import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  button, commandToJSON, container, customId, defineCommand, defineComponent, defineModal, modal, opt,
  textInput, UserError,
} from '../src/index.js';
import { createTestBot, runCommand, runComponent, runModal } from '../src/testing.js';

test('commandToJSON: required options first, subcommands, permissions, contexts', () => {
  const json = commandToJSON(defineCommand({
    name: 'ban',
    description: 'Ban a member',
    permissions: ['BanMembers'],
    guildOnly: true,
    options: {
      reason: opt.string('Why', { max: 200 }),
      user: opt.user('Who', { required: true }),
      days: opt.integer('Days', { min: 0, max: 7, choices: [1, { name: 'Week', value: 7 }] }),
      proof: opt.attachment('Screenshot', { types: ['image'] }),
    },
    run() {},
  }));
  assert.deepEqual(json.options.map((o) => o.name), ['user', 'reason', 'days', 'proof']);
  assert.deepEqual(json.options[1], { type: 3, name: 'reason', description: 'Why', max_length: 200 });
  assert.deepEqual(json.options[2].choices, [{ name: '1', value: 1 }, { name: 'Week', value: 7 }]);
  assert.deepEqual(json.options[3].file_types, ['image']);
  assert.equal(json.default_member_permissions, '4');
  assert.deepEqual(json.contexts, [0]);

  const nested = commandToJSON(defineCommand({
    name: 'role',
    description: 'Roles',
    install: ['guild', 'user'],
    subcommands: {
      add: { description: 'Add', options: { role: opt.role('Role', { required: true }) }, run() {} },
      admin: { description: 'Admin', subcommands: { purge: { description: 'Purge', run() {} } } },
    },
  }));
  assert.deepEqual(nested.options.map((o) => [o.type, o.name]), [[1, 'add'], [2, 'admin']]);
  assert.equal(nested.options[1].options[0].type, 1);
  assert.deepEqual(nested.integration_types, [0, 1]);

  assert.deepEqual(commandToJSON(defineCommand({ type: 'user', name: 'Report User', run() {} })), { type: 2, name: 'Report User' });
});

test('defineCommand rejects bad definitions with a fix', () => {
  const bad = (def, pattern) => assert.throws(() => defineCommand(def), (e) => e.code === 'INVALID_COMMAND' && pattern.test(e.message));
  bad({ name: 'Bad Name', description: 'x', run() {} }, /lowercase/);
  bad({ name: 'x', run() {} }, /description must be 1-100/);
  bad({ name: 'x', description: 'x' }, /needs a "run/);
  bad({ name: 'x', description: 'x', options: { a: 'string' }, run() {} }, /use an option builder/);
  bad({ name: 'x', description: 'x', run() {}, subcommands: { a: { description: 'a', run() {} } } }, /cannot also have "run"/);
});

test('reply, then reply again becomes a follow-up', async () => {
  const cmd = defineCommand({ name: 'hi', description: 'x', async run(ctx) { await ctx.reply('one'); await ctx.reply('two'); } });
  const r = await runCommand(cmd);
  assert.deepEqual(r.replies.map((x) => [x.method, x.content]), [['reply', 'one'], ['followUp', 'two']]);
});

test('defer then reply edits the deferred response', async () => {
  const cmd = defineCommand({ name: 'slow', description: 'x', defer: 'ephemeral', run: (ctx) => ctx.reply('done') });
  const r = await runCommand(cmd);
  assert.deepEqual(r.replies.map((x) => x.method), ['defer', 'edit']);
  assert.equal(r.replies[0].flags, 64);
});

test('options reach the handler; ephemeral default applies', async () => {
  const cmd = defineCommand({
    name: 'echo',
    description: 'x',
    ephemeral: true,
    options: { text: opt.string('Text', { required: true }) },
    run: (ctx, { text }) => ctx.reply(container(`You said ${text}`, button({ id: 'again', label: 'Again' }))),
  });
  const r = await runCommand(cmd, { options: { text: 'hey' } });
  assert.match(r.text, /You said hey/);
  assert.equal(r.last.ephemeral, true);
  assert.equal(r.last.flags, 32768 | 64);
});

test('subcommands run the right leaf and inherit parent guards', async () => {
  const cmd = defineCommand({
    name: 'cfg',
    description: 'x',
    guildOnly: true,
    subcommands: { get: { description: 'Get', run: (ctx) => ctx.reply('got') }, set: { description: 'Set', run: (ctx) => ctx.reply('set') } },
  });
  assert.equal((await runCommand(cmd, { sub: 'set' })).text, 'set');
  assert.match((await runCommand(cmd, { sub: 'get', guildId: null })).text, /only works in a server/);
});

test('guards: permissions, owner, cooldown', async () => {
  const mod = defineCommand({ name: 'kick', description: 'x', permissions: ['KickMembers'], run: (ctx) => ctx.reply('ok') });
  const denied = await runCommand(mod);
  assert.match(denied.text, /Kick Members/);
  assert.equal(denied.last.ephemeral, true);
  assert.equal((await runCommand(mod, { permissions: ['KickMembers'] })).text, 'ok');
  assert.equal((await runCommand(mod, { permissions: ['Administrator'] })).text, 'ok');

  const owner = defineCommand({ name: 'eval', description: 'x', ownerOnly: true, run: (ctx) => ctx.reply('ok') });
  assert.match((await runCommand(owner)).text, /bot owner/);
  assert.equal((await runCommand(owner, { bot: createTestBot({ owners: ['100000000000000001'] }) })).text, 'ok');

  const limited = defineCommand({ name: 'daily', description: 'x', cooldown: '1h', run: (ctx) => ctx.reply('claimed') });
  assert.equal((await runCommand(limited)).text, 'claimed');
  assert.match((await runCommand(limited)).text, /too often/);
  assert.equal((await runCommand(limited, { user: { id: '999' } })).text, 'claimed');
});

test('UserError is shown; other errors are reported with a trace id', async () => {
  const friendly = defineCommand({ name: 'a', description: 'x', run() { throw new UserError('Join a voice channel first.'); } });
  const a = await runCommand(friendly);
  assert.equal(a.text, 'Join a voice channel first.');
  assert.equal(a.error, null);

  const broken = defineCommand({ name: 'b', description: 'x', run() { throw new TypeError('boom'); } });
  const b = await runCommand(broken);
  assert.equal(b.error.message, 'boom');
  assert.match(b.text, /Something went wrong.*`[A-Z0-9]+`/);
  assert.equal(b.last.ephemeral, true);
});

test('an invalid message surfaces as an error, not a Discord 400', async () => {
  const cmd = defineCommand({ name: 'long', description: 'x', run: (ctx) => ctx.reply('x'.repeat(3000)) });
  const r = await runCommand(cmd);
  assert.equal(r.error.code, 'INVALID_MESSAGE');
});

test('middleware runs in order: global, then definition', async () => {
  const order = [];
  const bot = createTestBot({ use: async (ctx, next) => { order.push('global'); ctx.state.n = 1; await next(); order.push('after'); } });
  const cmd = defineCommand({
    name: 'm',
    description: 'x',
    use: [(ctx, next) => { order.push('local'); return next(); }],
    run: (ctx) => { order.push(`run:${ctx.state.n}`); return ctx.reply('ok'); },
  });
  await runCommand(cmd, { bot });
  assert.deepEqual(order, ['global', 'local', 'run:1', 'after']);
});

test('component ids carry params', async () => {
  const close = defineComponent({ id: 'ticket:close:{ticket}:{reason}', run: (ctx, { ticket, reason }) => ctx.update(`closed ${ticket} ${reason}`) });
  const id = customId(close.id, { ticket: 42, reason: 'spam' });
  assert.equal(id, 'ticket:close:42:spam');
  const r = await runComponent(close, { id });
  assert.deepEqual([r.last.method, r.text], ['update', 'closed 42 spam']);
  await assert.rejects(async () => runComponent(close, { id: 'other' }), /does not match/);
  assert.throws(() => customId('a:{x}', {}), /missing value/);

  const pick = defineComponent({ id: 'color', run: (ctx) => ctx.reply(ctx.values.join(',')) });
  assert.equal((await runComponent(pick, { values: ['red', 'blue'] })).text, 'red,blue');
});

test('modals: open from a command, handle the submit', async () => {
  const open = defineCommand({ name: 'form', description: 'x', run: (ctx) => ctx.showModal(modal({ id: 'form:{n}'.replace('{n}', '7'), title: 'Form' }, textInput({ id: 'name', label: 'Name' }))) });
  const opened = await runCommand(open);
  assert.equal(opened.modal.custom_id, 'form:7');
  assert.equal(opened.modal.components[0].component.custom_id, 'name');

  const submit = defineModal({ id: 'form:{n}', run: (ctx, { n }) => ctx.reply(`${n}:${ctx.fields.name}`) });
  assert.equal((await runModal(submit, { id: 'form:7', fields: { name: 'Ada' } })).text, '7:Ada');

  const late = defineCommand({ name: 'late', description: 'x', defer: true, run: (ctx) => ctx.showModal(modal({ id: 'm', title: 'x' }, textInput({ id: 'a', label: 'A' }))) });
  assert.equal((await runCommand(late)).error.code, 'UNSUPPORTED');
});

test('context menu commands receive the target', async () => {
  const report = defineCommand({ type: 'message', name: 'Report', run: (ctx, message) => ctx.reply(`reported ${message.id}`) });
  assert.equal((await runCommand(report, { target: { id: 'm1' } })).text, 'reported m1');
});

test('guards reject privately even when the command defers publicly', async () => {
  const cmd = defineCommand({ name: 'slowmod', description: 'x', defer: true, permissions: ['KickMembers'], run: (ctx) => ctx.reply('ok') });
  const denied = await runCommand(cmd);
  assert.deepEqual(denied.replies.map((r) => [r.method, r.ephemeral]), [['reply', true]]);
  assert.deepEqual((await runCommand(cmd, { permissions: ['KickMembers'] })).replies.map((r) => r.method), ['defer', 'edit']);
});

test('subcommand groups pass defer and ephemeral down', async () => {
  const cmd = defineCommand({
    name: 'admin',
    description: 'x',
    subcommands: { logs: { description: 'Logs', ephemeral: true, defer: true, subcommands: { show: { description: 'Show', run: (ctx) => ctx.reply('done') } } } },
  });
  const r = await runCommand(cmd, { sub: ['logs', 'show'] });
  assert.deepEqual(r.replies.map((x) => x.method), ['defer', 'edit']);
  assert.equal(r.replies[0].flags, 64);
});

test('runCommand fills missing options like a real interaction', async () => {
  const cmd = defineCommand({
    name: 'greet',
    description: 'x',
    options: { name: opt.string('Name'), times: opt.integer('Times', { default: 2 }) },
    run: (ctx, { name, times }) => ctx.reply(`${name}:${times}`),
  });
  assert.equal((await runCommand(cmd)).text, 'null:2');
});

test('a prefix alias cannot shadow another command', () => {
  const bot = createTestBot({ prefix: '!' });
  bot.add(defineCommand({ name: 'help', description: 'x', run() {} }));
  assert.throws(() => bot.add(defineCommand({ name: 'support', description: 'x', aliases: ['help'], run() {} })), (e) => e.code === 'DUPLICATE' && /already used by command "help"/.test(e.message));
});
