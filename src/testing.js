import { PermissionsBitField } from 'discord.js';
import { Bot } from './bot.js';
import { Context } from './context.js';
import { compilePattern, KIND } from './define.js';
import { ShiverError } from './errors.js';
import { toPlain } from './ui/message.js';


const USER = { id: '100000000000000001', username: 'tester', tag: 'tester', bot: false };

export function createTestBot(options = {}) {
  const bot = new Bot({ env: false, logLevel: 'silent', sync: false, ...options });
  return bot;
}

function collectText(payload) {
  const out = [];
  const visit = (c) => {
    if (typeof c?.content === 'string') out.push(c.content);
    if (c?.label && c.type === 2) out.push(c.label);
    for (const kid of c?.components ?? []) visit(kid);
    if (c?.accessory) visit(c.accessory);
  };
  if (payload.content) out.push(payload.content);
  for (const e of payload.embeds ?? []) out.push(e.title, e.description, ...(e.fields ?? []).flatMap((f) => [f.name, f.value]), e.footer?.text);
  for (const c of payload.components ?? []) visit(c);
  return out.filter(Boolean).join('\n');
}

function recorder(replies) {
  return (method, payload = {}) => {
    const plain = toPlain(payload);
    delete plain.withResponse;
    const reply = { method, ...plain, ephemeral: Boolean((plain.flags ?? 0) & 64), text: collectText(plain) };
    replies.push(reply);
    return reply;
  };
}

function fakeInteraction(kind, o, replies) {
  const record = recorder(replies);
  const clicks = o.clicks ?? [];
  const message = {
    id: '300000000000000001',
    async awaitMessageComponent({ filter }) {
      while (clicks.length) {
        const next = clicks.shift();
        const click = fakeInteraction('component', { ...o, ...(typeof next === 'string' ? { id: next } : next) }, replies);
        if (!filter || filter(click)) return click;
      }
      throw new Error('timeout');
    },
  };
  const user = { ...USER, ...o.user };
  const guildId = o.guildId === undefined ? '200000000000000001' : o.guildId;
  let shown = null;
  const interaction = {
    replied: false,
    deferred: false,
    user,
    member: guildId ? { id: user.id, user, ...o.member } : null,
    guildId,
    guild: guildId ? { id: guildId, ...o.guild } : null,
    channelId: '400000000000000001',
    channel: { id: '400000000000000001', nsfw: false, ...o.channel },
    locale: o.locale ?? 'en-US',
    customId: o.id,
    values: o.values,
    message: kind === 'command' ? null : message,
    memberPermissions: new PermissionsBitField(o.permissions ?? []),
    appPermissions: new PermissionsBitField(o.botPermissions ?? ['Administrator']),
    entitlements: o.entitlements ?? [],
    isMessageComponent: () => kind === 'component',
    isFromMessage: () => kind === 'modal',
    async reply(p) { record('reply', p); this.replied = true; return { resource: { message } }; },
    async deferReply(p) { record('defer', p); this.deferred = true; },
    async editReply(p) { record('edit', p); this.replied = true; return message; },
    async followUp(p) { record('followUp', p); return { ...message, id: '300000000000000002' }; },
    async update(p) { record('update', p); this.replied = true; },
    async deferUpdate() { record('deferUpdate'); this.deferred = true; },
    async deleteReply() { record('delete'); },
    async fetchReply() { return message; },
    async showModal(m) { record('modal', {}).modal = shown = m.toJSON(); this.replied = true; },
    async launchActivity() { record('launchActivity'); this.replied = true; },
    async awaitModalSubmit() {
      if (!o.submit) throw new Error('timeout');
      const submit = fakeInteraction('modal', { ...o, id: shown?.custom_id }, replies);
      submit.fields = { fields: new Map(Object.entries(o.submit).map(([id, value]) => [id, Array.isArray(value) ? { values: value } : { value }])) };
      return submit;
    },
  };
  return interaction;
}

async function run(kind, def, o, data) {
  const bot = o.bot ?? createTestBot();
  const replies = [];
  const ctx = new Context(bot, { interaction: fakeInteraction(kind, o, replies) }, { kind, ephemeral: def.ephemeral, ...data });
  let error = null;
  const onError = (event) => { if (event.ctx === ctx) error = event.error; };
  bot.on('error', onError);
  try {
    await bot.invoke(ctx, def, { path: [o.sub ?? []].flat() });
  } finally {
    bot.off('error', onError);
  }
  return result(ctx, replies, error);
}

function result(ctx, replies, error) {
  return {
    ctx,
    replies,
    last: replies.at(-1) ?? null,
    text: replies.map((r) => r.text).filter(Boolean).join('\n'),
    modal: replies.find((r) => r.method === 'modal')?.modal ?? null,
    error,
  };
}

export function runCommand(def, o = {}) {
  if (def?.[KIND] !== 'command') throw new ShiverError('INVALID_DEFINITION', 'runCommand() takes a value created by defineCommand().');
  return run('command', def, o, { command: def, options: o.options ?? {}, target: o.target ?? null });
}

export async function runPrefix(def, o = {}) {
  if (def?.[KIND] !== 'command' || def.type && def.type !== 'slash') {
    throw new ShiverError('INVALID_DEFINITION', 'runPrefix() takes a slash command definition.');
  }
  const prefix = o.prefix ?? '!';
  const bot = o.bot ?? createTestBot({ prefix, mentionPrefix: false }).add(def);
  const replies = [];
  const record = recorder(replies);
  const simulated = fakeInteraction('component', o, replies);
  const sent = {
    ...simulated.message,
    async edit(payload) { record('edit', payload); return this; },
    async delete() { record('delete'); },
  };
  const message = {
    author: simulated.user,
    member: simulated.member && { ...simulated.member, permissions: simulated.memberPermissions },
    guildId: simulated.guildId,
    guild: simulated.guild,
    channelId: simulated.channelId,
    channel: {
      ...simulated.channel,
      async sendTyping() {},
      async send(payload) { record('followUp', payload); return sent; },
    },
    client: bot.client,
    content: o.content ?? prefix + def.name,
    attachments: new Map((o.attachments ?? []).map((attachment) => [attachment.id, attachment])),
    async reply(payload) { record('reply', payload); return sent; },
  };
  const errors = new Map();
  const onError = ({ ctx, error }) => errors.set(ctx, error);
  bot.on('error', onError);
  try {
    const ctx = await bot.handleMessage(message);
    return result(ctx ?? null, replies, errors.get(ctx) ?? null);
  } finally {
    bot.off('error', onError);
  }
}

export function runComponent(def, o = {}) {
  const id = o.id ?? def.id;
  if (typeof id !== 'string') throw new ShiverError('NO_MATCH', 'Pass a concrete id when testing a RegExp route.');
  const params = compilePattern(def.id)(id);
  if (!params) throw new ShiverError('NO_MATCH', `The id "${id}" does not match the handler pattern "${def.id}".`);
  return run('component', def, { ...o, id }, { params, values: o.values ?? [] });
}

export function runModal(def, o = {}) {
  const id = o.id ?? def.id;
  if (typeof id !== 'string') throw new ShiverError('NO_MATCH', 'Pass a concrete id when testing a RegExp route.');
  const params = compilePattern(def.id)(id);
  if (!params) throw new ShiverError('NO_MATCH', `The id "${id}" does not match the handler pattern "${def.id}".`);
  return run('modal', def, { ...o, id }, { params, fields: o.fields ?? {} });
}
