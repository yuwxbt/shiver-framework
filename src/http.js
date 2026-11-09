import { createPublicKey, verify } from 'node:crypto';
import { ClientApplication } from 'discord.js';
import { ShiverError } from './errors.js';

const keyPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const supported = new Set([2, 3, 4, 5]);
const MAX_REPLAY_ENTRIES = 10_000;

async function readBody(request, limit) {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, length);
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export function createInteractionHandler(bot, {
  publicKey, applicationId, maxBodyBytes = 1_048_576, maxAge = 300_000,
} = {}) {
  if (typeof publicKey !== 'string' || !/^[a-f0-9]{64}$/i.test(publicKey)) {
    throw new ShiverError('INVALID_HTTP_CONFIG', 'createInteractionHandler() needs the application’s 32-byte hex public key.');
  }
  if (![maxBodyBytes, maxAge].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new ShiverError('INVALID_HTTP_CONFIG', 'maxBodyBytes and maxAge must be positive integers.');
  }
  if (applicationId !== undefined && (typeof applicationId !== 'string' || !/^\d{17,20}$/.test(applicationId))) {
    throw new ShiverError('INVALID_HTTP_CONFIG', 'applicationId must be a Discord application ID.');
  }
  const key = createPublicKey({ key: Buffer.concat([keyPrefix, Buffer.from(publicKey, 'hex')]), format: 'der', type: 'spki' });
  const seen = new Map();
  return async (request) => {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature) || !timestamp ||
      !/^\d{1,12}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp) * 1000) > maxAge) {
      return new Response(null, { status: 401 });
    }
    let body;
    try { body = await readBody(request, maxBodyBytes); } catch { return new Response(null, { status: 400 }); }
    if (body === null) return new Response(null, { status: 413 });
    const now = Date.now();
    const timestampMs = Number(timestamp) * 1000;
    if (Math.abs(now - timestampMs) > maxAge || !verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signature, 'hex'))) {
      return new Response(null, { status: 401 });
    }
    let interaction;
    try { interaction = JSON.parse(body.toString('utf8')); } catch { return new Response(null, { status: 400 }); }
    if (!interaction || typeof interaction !== 'object') return new Response(null, { status: 400 });
    const expectedApp = applicationId ?? bot.client.application?.id;
    if (expectedApp && interaction.application_id !== expectedApp && !(interaction.type === 1 && interaction.application_id === undefined)) {
      return new Response(null, { status: 401 });
    }
    if (interaction.type === 1) return Response.json({ type: 1 });
    if (!supported.has(interaction.type) || !/^\d{17,20}$/.test(interaction.id) ||
      !/^\d{17,20}$/.test(interaction.application_id) || typeof interaction.token !== 'string' ||
      !interaction.token || !interaction.data) {
      return new Response(null, { status: 400 });
    }
    if ((seen.get(interaction.id) ?? 0) > now) return new Response(null, { status: 202 });
    for (const [id, expires] of seen) {
      if (expires > now && seen.size < MAX_REPLAY_ENTRIES) break;
      seen.delete(id);
    }
    try {
      bot.client.application ??= new ClientApplication(bot.client, { id: interaction.application_id });
      bot.client.actions.InteractionCreate.handle({
        ...interaction,
        entitlements: interaction.entitlements ?? [],
        authorizing_integration_owners: interaction.authorizing_integration_owners ?? {},
      });
    } catch {
      return new Response(null, { status: 400 });
    }
    seen.set(interaction.id, timestampMs + maxAge + 1);
    return new Response(null, { status: 202 });
  };
}
