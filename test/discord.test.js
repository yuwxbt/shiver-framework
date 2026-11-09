import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import {
  button, checkboxGroup, container, createBot, createInteractionHandler, defineCommand, defineComponent, defineModal, modal, opt, ownerOnly,
  textInput,
} from '../src/index.js';

const USER = { id: '100000000000000001', username: 'tester', discriminator: '0', global_name: 'Tester', avatar: null };

function harness(...definitions) {
  const bot = createBot({ env: false, logLevel: 'silent', sync: false, prefix: '!', messages: { expired: null } }).add(definitions);
  const calls = [];
  const rest = bot.client.rest;
  for (const method of ['post', 'patch', 'put', 'get', 'delete']) {
    rest[method] = async (route, options = {}) => {
      calls.push({ method, route, body: options.body, query: options.query?.toString() });
      if (method === 'post' && route.endsWith('/callback')) return { interaction: { id: '1', type: 2 }, resource: null };
      return { id: '900000000000000001', channel_id: '400000000000000001', content: options.body?.content ?? '', author: USER, embeds: [], components: [], attachments: [], mentions: [], mention_roles: [], timestamp: new Date().toISOString(), type: 0 };
    };
  }
  let seq = 0;
  const base = () => ({
    id: String(500000000000000000n + BigInt(++seq)),
    application_id: '600000000000000001',
    token: `token${seq}`,
    version: 1,
    channel_id: '400000000000000001',
    channel: { id: '400000000000000001', type: 1 },
    user: USER,
    locale: 'en-US',
    entitlements: [],
    authorizing_integration_owners: {},
    context: 1,
    app_permissions: '8',
  });
  const settle = () => new Promise((done) => setTimeout(done, 20));
  const dispatch = async (data) => {
    calls.length = 0;
    bot.client.actions.InteractionCreate.handle({ ...base(), ...data });
    await settle();
    return calls;
  };
  return { bot, dispatch, calls };
}

test('slash command → interaction callback with Components V2 body', async () => {
  const cmd = defineCommand({
    name: 'echo',
    description: 'Echo',
    options: { text: opt.string('Text', { required: true }) },
    run: (ctx, { text }) => ctx.reply({ components: [container({ accent: 'red' }, `You said **${text}**`, button({ id: 'again', label: 'Again' }))], ephemeral: true }),
  });
  const { dispatch, bot } = harness(cmd);
  const calls = await dispatch({ type: 2, data: { id: '700000000000000001', name: 'echo', type: 1, options: [{ name: 'text', type: 3, value: 'hi' }] } });
  assert.equal(calls.length, 1);
  assert.match(calls[0].route, /^\/interactions\/\d+\/token1\/callback$/);
  assert.equal(calls[0].body.type, 4);
  assert.equal(calls[0].body.data.flags, 32768 | 64);
  assert.deepEqual(calls[0].body.data.components, [{
    type: 17,
    accent_color: 0xed4245,
    components: [
      { type: 10, content: 'You said **hi**' },
      { type: 1, components: [{ type: 2, style: 2, custom_id: 'again', label: 'Again' }] },
    ],
  }]);
  await bot.client.destroy();
});

test('signed HTTP interactions use the same discord.js dispatcher without a gateway', async () => {
  const command = defineCommand({ name: 'http', description: 'HTTP', run: (ctx) => ctx.reply(`HTTP reply: ${ctx.entitlements.size}`) });
  const { bot, calls } = harness(command);
  const appId = '600000000000000001';
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const key = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const handler = createInteractionHandler(bot, { publicKey: key, applicationId: appId });
  const request = (payload, opts = {}) => {
    const text = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000) + (opts.offset ?? 0));
    const signature = sign(null, Buffer.from(timestamp + text), privateKey).toString('hex');
    return new Request('http://localhost/interactions', {
      method: 'POST',
      headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
      body: opts.tamper ? text + ' ' : text,
    });
  };
  try {
    await bot.prepareREST('offline-placeholder');
    assert.equal(bot.client.isReady(), false);
    assert.deepEqual(await (await handler(request({ type: 1 }))).json(), { type: 1 });
    assert.equal((await handler(request({ type: 1 }, { offset: -600 }))).status, 401);
    assert.equal((await handler(request({ type: 1 }, { tamper: true }))).status, 401);
    assert.equal((await handler(new Request('http://localhost/interactions'))).status, 405);
    const limited = createInteractionHandler(bot, { publicKey: key, maxBodyBytes: 10 });
    assert.equal((await limited(request({ type: 1, application_id: appId }))).status, 413);
    const payload = {
      id: '500000000000000001', application_id: appId, type: 2, token: 'fixture',
      version: 1, user: USER, locale: 'en-US', app_permissions: '8', context: 1,
      channel_id: '400000000000000001', channel: { id: '400000000000000001', type: 1 },
      entitlements: [{ id: '900000000000000001', sku_id: '900000000000000002', application_id: appId, type: 8, deleted: false }],
      data: { id: '700000000000000001', name: 'http', type: 1 },
    };
    assert.equal((await handler(request({ ...payload, application_id: '600000000000000002' }))).status, 401);
    const first = await handler(request(payload));
    assert.equal(first.status, 202);
    assert.equal(await first.text(), '');
    assert.equal((await handler(request(payload))).status, 202);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.data.content, 'HTTP reply: 1');
  } finally {
    await bot.stop();
  }
});

test('button click → params, update callback', async () => {
  const handler = defineComponent({ id: 'vote:{choice}', run: (ctx, { choice }) => ctx.update(`voted ${choice}`) });
  const { dispatch, bot } = harness(handler);
  const calls = await dispatch({
    type: 3,
    data: { custom_id: 'vote:yes', component_type: 2 },
    message: { id: '800000000000000001', channel_id: '400000000000000001', content: 'x', author: USER, embeds: [], components: [], attachments: [], mentions: [], mention_roles: [], timestamp: new Date().toISOString(), type: 0 },
  });
  assert.equal(calls[0].body.type, 7);
  assert.equal(calls[0].body.data.content, 'voted yes');
  await bot.client.destroy();
});

test('commands with the same name route by Discord command type', async () => {
  const slash = defineCommand({ name: 'inspect', description: 'Inspect', run: (ctx) => ctx.reply('slash') });
  const user = defineCommand({ name: 'inspect', type: 'user', run: (ctx, target) => ctx.reply(`user:${target.id}`) });
  const message = defineCommand({ name: 'inspect', type: 'message', run: (ctx, target) => ctx.reply(`message:${target.id}`) });
  const { bot, dispatch } = harness(user, slash, message);
  try {
    assert.equal(bot.commands.get('inspect'), slash);
    assert.equal(bot.getCommand('inspect', 'user'), user);
    assert.deepEqual(bot.commandData().get('global').map((c) => c.type).sort(), [1, 2, 3]);
    assert.equal((await dispatch({ type: 2, data: { id: '1', name: 'inspect', type: 1 } }))[0].body.data.content, 'slash');
    assert.equal((await dispatch({ type: 2, data: { id: '2', name: 'inspect', type: 2, target_id: USER.id, resolved: { users: { [USER.id]: USER } } } }))[0].body.data.content, `user:${USER.id}`);
    const target = { id: '800000000000000001', channel_id: '400000000000000001', content: 'x', author: USER, embeds: [], components: [], attachments: [], mentions: [], mention_roles: [], timestamp: new Date().toISOString(), type: 0 };
    assert.equal((await dispatch({ type: 2, data: { id: '3', name: 'inspect', type: 3, target_id: target.id, resolved: { messages: { [target.id]: target } } } }))[0].body.data.content, `message:${target.id}`);
    assert.throws(() => bot.add(slash), { code: 'DUPLICATE' });
    assert.equal(bot.summary.commands, 3);
  } finally {
    await bot.stop();
  }
});

test('Activity Entry Points use the launch callback and update Discord’s existing entry point', async () => {
  const entry = defineCommand({ name: 'play', type: 'entryPoint', description: 'Open the game', run: (ctx) => ctx.launchActivity() });
  const { bot, dispatch, calls } = harness(entry);
  try {
    assert.deepEqual(bot.commandData().get('global'), [{ type: 4, name: 'play', description: 'Open the game', handler: 1 }]);
    bot.options.devGuild = '111111111111111111';
    assert.deepEqual([...bot.commandData()], [['111111111111111111', []]]);
    delete bot.options.devGuild;
    assert.equal((await dispatch({ type: 2, data: { id: '4', name: 'play', type: 4 } }))[0].body.type, 12);
    calls.length = 0;
    bot.client.rest.get = async (route) => route === '/applications/@me'
      ? { id: '600000000000000001' }
      : [{ id: '700000000000000001', type: 4, name: 'Launch' }];
    await bot.sync({ force: true });
    assert.deepEqual(calls.map((call) => [call.method, call.route, call.body.name]), [
      ['patch', '/applications/600000000000000001/commands/700000000000000001', 'play'],
    ]);
    await bot.sync({ prune: true });
    assert.equal(calls.at(-1).body[0].id, '700000000000000001');
  } finally {
    await bot.stop();
  }
});

test('modal: showModal sends raw JSON; submit fields are parsed', async () => {
  const open = defineCommand({
    name: 'form',
    description: 'Form',
    run: (ctx) => ctx.showModal(modal(
      { id: 'form', title: 'Form' },
      textInput({ id: 'name', label: 'Name' }),
      checkboxGroup({ id: 'tags', label: 'Tags', options: ['a', 'b'] }),
    )),
  });
  let seen = null;
  const submit = defineModal({ id: 'form', run: (ctx) => { seen = ctx.fields; return ctx.reply('saved'); } });
  const { dispatch, bot } = harness(open, submit);

  const opened = await dispatch({ type: 2, data: { id: '700000000000000002', name: 'form', type: 1 } });
  assert.equal(opened[0].body.type, 9);
  assert.deepEqual(opened[0].body.data.components[1], {
    type: 18, label: 'Tags', component: { type: 22, custom_id: 'tags', options: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }] },
  });

  const submitted = await dispatch({
    type: 5,
    data: {
      custom_id: 'form',
      components: [
        { type: 18, id: 1, component: { type: 4, id: 2, custom_id: 'name', value: 'Ada' } },
        { type: 18, id: 3, component: { type: 22, id: 4, custom_id: 'tags', values: ['a', 'b'] } },
        { type: 18, id: 5, component: { type: 19, id: 6, custom_id: 'uploads', values: ['901000000000000001'] } },
        { type: 18, id: 7, component: { type: 23, id: 8, custom_id: '__proto__', value: false } },
        { type: 18, id: 9, component: { type: 21, id: 10, custom_id: 'choice', value: 'b' } },
      ],
      resolved: { attachments: { '901000000000000001': {
        id: '901000000000000001', filename: 'report.txt', size: 12,
        url: 'https://example.com/report.txt', proxy_url: 'https://example.com/report.txt',
      } } },
    },
  });
  const { uploads, ...fields } = seen;
  assert.deepEqual(fields, { name: 'Ada', tags: ['a', 'b'], ['__proto__']: false, choice: 'b' });
  assert.deepEqual(uploads.map(({ name }) => name), ['report.txt']);
  assert.equal(submitted[0].body.data.content, 'saved');
  await bot.client.destroy();
});

test('autocomplete responds with choices', async () => {
  const cmd = defineCommand({
    name: 'city',
    description: 'City',
    options: { name: opt.string('Name', { autocomplete: (ctx, value) => ['Paris', 'Prague', 'Rome'].filter((c) => c.toLowerCase().startsWith(value.toLowerCase())) }) },
    run() {},
  });
  const { dispatch, bot } = harness(cmd);
  const calls = await dispatch({ type: 4, data: { id: '700000000000000003', name: 'city', type: 1, options: [{ name: 'name', type: 3, value: 'p', focused: true }] } });
  assert.equal(calls[0].body.type, 8);
  assert.deepEqual(calls[0].body.data.choices.map((c) => [c.name, c.value]), [['Paris', 'Paris'], ['Prague', 'Prague']]);
  await bot.client.destroy();
});

test('autocomplete middleware can reject suggestions without replying with an error message', async () => {
  const command = defineCommand({
    name: 'secret', description: 'Suggestions',
    options: { name: opt.string('Name', { autocomplete: () => ['one'], autocompleteUse: ownerOnly() }) },
    run() {},
  });
  const { bot, dispatch } = harness(command);
  try {
    const raw = { type: 4, data: { id: '1', name: 'secret', type: 1, options: [{ name: 'name', type: 3, value: 'o', focused: true }] } };
    assert.deepEqual((await dispatch(raw))[0].body.data.choices, []);
    bot.owners.add(USER.id);
    assert.deepEqual((await dispatch(raw))[0].body.data.choices.map(({ name, value }) => ({ name, value })), [{ name: 'one', value: 'one' }]);
  } finally {
    await bot.stop();
  }
});

test('prefix: the same command runs from a message', async () => {
  const sent = [];
  const cmd = defineCommand({
    name: 'say',
    description: 'Say',
    aliases: ['s'],
    options: { times: opt.integer('Times', { required: true, min: 1, max: 3 }), text: opt.string('Text', { required: true }) },
    run: (ctx, { times, text }) => ctx.reply(`${text} x${times}`),
  });
  const { bot } = harness(cmd);
  bot.client.user = { id: '600000000000000001' };
  const message = (content) => ({
    content,
    author: { ...USER, bot: false },
    attachments: new Map(),
    client: bot.client,
    guild: null,
    channel: { send: async (p) => sent.push(p), sendTyping: async () => {} },
    reply: async (p) => { sent.push(p); return { edit: async () => {} }; },
  });
  const emit = async (content) => { sent.length = 0; bot.client.emit('messageCreate', message(content)); await new Promise((done) => setTimeout(done, 20)); return sent.map((p) => p.content); };

  assert.deepEqual(await emit('!say 2 hello there world'), ['hello there world x2']);
  assert.deepEqual(await emit('!s 1 "quoted"'), ['quoted x1']);
  assert.deepEqual(await emit('<@600000000000000001> say 3 hi'), ['hi x3']);
  assert.match((await emit('!say nine hi'))[0], /`times`: must be a whole number\.\nUsage: `!say <times> <text>`/);
  assert.match((await emit('!say "" hi'))[0], /must be a whole number/);
  assert.match((await emit('!say 9 hi'))[0], /must be at most 3/);
  assert.deepEqual(await emit('?say 1 hi'), []);
  assert.deepEqual(await emit('!unknown'), []);
  await bot.client.destroy();
});

test('sync sends raw command JSON per scope and skips unchanged scopes', async () => {
  const globalCmd = defineCommand({ name: 'ping', description: 'Ping', run() {} });
  const guildCmd = defineCommand({ name: 'admin', description: 'Admin', guilds: ['111111111111111111'], install: ['guild'], contexts: ['guild'], run() {} });
  const { bot, calls } = harness(globalCmd, guildCmd);
  bot.client.rest.get = async () => ({ id: '600000000000000001' });

  const first = await bot.sync();
  assert.deepEqual(first.map((r) => [r.scope, r.count, r.changed]), [['global', 1, true], ['111111111111111111', 1, true]]);
  assert.deepEqual(calls.map((c) => c.route), ['/applications/600000000000000001/commands', '/applications/600000000000000001/guilds/111111111111111111/commands']);
  assert.equal(calls[0].method, 'post');
  assert.deepEqual(calls[0].body, { type: 1, name: 'ping', description: 'Ping', options: [] });
  assert.ok(!('contexts' in calls[1].body) && !('integration_types' in calls[1].body));
  assert.deepEqual((await bot.sync()).map((r) => r.changed), [false, false]);
  assert.deepEqual((await bot.sync({ prune: true })).map((r) => r.changed), [true, true]);
  assert.deepEqual(calls.slice(2).map(({ method, body }) => [method, body[0].name]), [['put', 'ping'], ['put', 'admin']]);
  bot.options.devGuild = '222222222222222222';
  const empty = harness();
  empty.bot.options.devGuild = bot.options.devGuild;
  empty.bot.client.rest.get = bot.client.rest.get;
  await empty.bot.sync({ prune: true });
  assert.deepEqual(empty.calls.map(({ method, route, body }) => [method, route, body]), [
    ['put', '/applications/600000000000000001/guilds/222222222222222222/commands', []],
  ]);
  await empty.bot.client.destroy();
  await bot.client.destroy();
});

test('prune planning matches command type and only reads the selected guild', async () => {
  const slash = defineCommand({ name: 'inspect', description: 'Inspect', run() {} });
  const user = defineCommand({ name: 'inspect', type: 'user', run() {} });
  const { bot, calls } = harness(slash, user);
  bot.options.devGuild = '222222222222222222';
  const routes = [];
  bot.client.rest.get = async (route) => {
    routes.push(route);
    return route === '/applications/@me' ? { id: '600000000000000001' } : [{ type: 2, name: 'inspect' }, { type: 3, name: 'stale' }];
  };
  try {
    assert.deepEqual(await bot.planSync({ prune: true }), [{
      scope: '222222222222222222',
      create: [{ type: 1, name: 'inspect' }],
      upsert: [{ type: 2, name: 'inspect' }],
      delete: [{ type: 3, name: 'stale' }],
      keep: [],
    }]);
    assert.deepEqual(routes, ['/applications/@me', '/applications/600000000000000001/guilds/222222222222222222/commands']);
    assert.deepEqual(calls, []);
    const [normal] = await bot.planSync();
    assert.deepEqual(normal.delete, []);
    assert.deepEqual(normal.keep, [{ type: 3, name: 'stale' }]);
  } finally {
    await bot.stop();
  }
});

test('server-computed permissions use all four Discord routes and support masking', async () => {
  const { bot } = harness();
  const id = '600000000000000001';
  const other = '700000000000000001';
  const calls = [];
  bot.client.rest.get = async (route, { query }) => {
    calls.push([route, query?.toString()]);
    return { permissions: '2048' };
  };
  try {
    for (const target of [
      { guildId: id, userId: other },
      { guildId: id, roleId: other },
      { channelId: id, userId: other, implicit: false },
      { channelId: id, roleId: other },
    ]) {
      const permissions = await bot.fetchPermissions(target);
      assert.ok(permissions.has('SendMessages'));
      assert.ok(Object.isFrozen(permissions));
    }
    assert.deepEqual(calls, [
      [`/guilds/${id}/permissions/member/${other}`, undefined],
      [`/guilds/${id}/permissions/role/${other}`, undefined],
      [`/channels/${id}/permissions/member/${other}`, 'implicit=false'],
      [`/channels/${id}/permissions/role/${other}`, undefined],
    ]);
    await assert.rejects(bot.fetchPermissions({ guildId: id, roleId: other, userId: other }), { code: 'INVALID_PERMISSION_TARGET' });
  } finally {
    await bot.stop();
  }
});

test('failed login releases process and ready listeners and can be retried', async () => {
  const bot = createBot({ env: false, logLevel: 'silent', sync: false });
  const before = ['unhandledRejection', 'SIGINT', 'SIGTERM'].map((event) => process.listenerCount(event));
  const ready = bot.client.listenerCount('clientReady');
  bot.client.login = async () => { throw new Error('mock login failed'); };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(bot.start('test-placeholder'), /mock login failed/);
    assert.deepEqual(['unhandledRejection', 'SIGINT', 'SIGTERM'].map((event) => process.listenerCount(event)), before);
    assert.equal(bot.client.listenerCount('clientReady'), ready);
  }
});

test('intents are inferred from events and prefix', async () => {
  const { defineEvent } = await import('../src/index.js');
  const bot = createBot({ env: false, logLevel: 'silent' }).add(
    defineEvent({ name: 'guildMemberAdd', run() {} }),
    defineEvent({ name: 'voiceStateUpdate', run() {} }),
  );
  assert.deepEqual(bot.intents.toArray().sort(), ['GuildMembers', 'GuildVoiceStates', 'Guilds']);
  const prefixed = createBot({ env: false, logLevel: 'silent', prefix: '!' });
  assert.ok(prefixed.intents.has('MessageContent'));
  await bot.client.destroy();
  await prefixed.client.destroy();
});
