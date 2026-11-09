import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { channelOnly, container, createBot, defineCommand, defineComponent, defineEvent, definePlugin, defineTask, dmOnly, limitConcurrency, messageCache, modal, opt, requireRoles, textInput } from '../src/index.js';
import { createTestBot, runCommand, runComponent, runPrefix } from '../src/testing.js';

test('confirm resolves true, false or null and removes the buttons', async () => {
  const cmd = defineCommand({ name: 'wipe', description: 'x', async run(ctx) { await ctx.followUp(`answer:${await ctx.confirm('Delete everything?', { danger: true })}`); } });

  const yes = await runCommand(cmd, { clicks: ['shiver:confirm:yes'] });
  assert.deepEqual(yes.replies.map((r) => r.method), ['reply', 'update', 'followUp']);
  assert.deepEqual(yes.replies[0].components[0].components.map((b) => [b.label, b.style]), [['Confirm', 4], ['Cancel', 2]]);
  assert.deepEqual(yes.replies[1].components, []);
  assert.equal(yes.last.text, 'answer:true');

  assert.equal((await runCommand(cmd, { clicks: ['shiver:confirm:no'] })).last.text, 'answer:false');
  assert.equal((await runCommand(cmd)).last.text, 'answer:null');
});

test('confirm ignores clicks from other users', async () => {
  const cmd = defineCommand({ name: 'c', description: 'x', async run(ctx) { await ctx.followUp(String(await ctx.confirm('Sure?'))); } });
  const r = await runCommand(cmd, { clicks: [{ id: 'shiver:confirm:yes', user: { id: '555' } }, 'shiver:confirm:no'] });
  assert.match(r.text, /Only the person who ran the command/);
  assert.equal(r.last.text, 'false');
});

test('collectors ignore unrelated controls and recover from a failing filter', async () => {
  const warnings = [];
  const bot = createTestBot({ logger: { warn: (...args) => warnings.push(args), debug() {}, info() {}, error() {} } });
  const cmd = defineCommand({ name: 'collect', description: 'x', async run(ctx) {
    await ctx.reply('Choose a control');
    const chosen = await ctx.awaitComponent({ filter: (click) => {
      if (click.interaction.customId === 'bad') throw new Error('bad filter');
      return click.interaction.customId === 'chosen';
    } });
    await chosen?.update('Done');
  } });
  const result = await runCommand(cmd, { bot, clicks: [{ id: 'other', user: { id: '555' } }, 'bad', 'chosen'] });
  assert.deepEqual(result.replies.map((reply) => reply.method), ['reply', 'update']);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1].message, 'bad filter');
});

test('confirm appends controls to a Components V2 message without replacing the container', async () => {
  const cmd = defineCommand({ name: 'v2-confirm', description: 'x', run: (ctx) => ctx.confirm(container('Sure?')) });
  const result = await runCommand(cmd, { clicks: ['shiver:confirm:yes'] });
  assert.deepEqual(result.replies.map((reply) => reply.components.map((component) => component.type)), [[17, 1], [17]]);
  assert.ok(result.replies.every((reply) => reply.flags & 32768 && !('content' in reply)));
});

test('confirmation timeout removes controls from the follow-up rather than the original reply', async () => {
  const cmd = defineCommand({ name: 'confirm-follow-up', description: 'x', async run(ctx) {
    await ctx.reply('Original reply');
    await ctx.confirm(container('Sure?'));
  } });
  const result = await runCommand(cmd);
  assert.deepEqual(result.replies.map((reply) => reply.method), ['reply', 'followUp', 'edit']);
  assert.equal(result.last.message, '300000000000000002');
  assert.deepEqual(result.last.components.map((component) => component.type), [17]);
});

test('paginate moves between pages and disables buttons at the end', async () => {
  const cmd = defineCommand({ name: 'pages', description: 'x', run: (ctx) => ctx.paginate(['one', container('two'), 'three']) });
  const r = await runCommand(cmd, { clicks: ['shiver:page:next', 'shiver:page:next', 'shiver:page:prev'] });
  assert.deepEqual(r.replies.map((x) => x.method), ['reply', 'update', 'update', 'update', 'edit']);
  assert.match(r.replies[0].text, /^one\n‹\n1 \/ 3\n›$/);
  assert.equal(r.replies[1].components[0].type, 17, 'a Components V2 page keeps its container');
  assert.match(r.replies[2].text, /three/);
  assert.ok(r.replies.every((reply) => reply.flags & 32768 && !('content' in reply)));
  assert.ok(r.last.components.at(-1).components.every((b) => b.disabled));

  const single = await runCommand(defineCommand({ name: 'p1', description: 'x', run: (ctx) => ctx.paginate(['only']) }));
  assert.equal(single.last.components, undefined);
});

test('select pagination renders lazy pages on demand and acknowledges before loading', async () => {
  const visited = [];
  const command = defineCommand({
    name: 'lazy', description: 'Lazy pages', run: (ctx) => ctx.paginate({
      count: 3,
      v2: true,
      async render(i) {
        visited.push(i);
        return i === 2 ? container('Last') : 'First';
      },
    }, { controls: 'select', pageLabel: (i) => `Item ${i + 1}` }),
  });
  const result = await runCommand(command, { clicks: [
    { id: 'shiver:page:select', values: ['9'] },
    { id: 'shiver:page:select', values: ['2'] },
  ] });
  assert.equal(result.error, null);
  assert.deepEqual(visited, [0, 2]);
  assert.deepEqual(result.replies.map((reply) => reply.method), ['reply', 'deferUpdate', 'edit', 'edit']);
  assert.equal(result.replies[0].components.at(-1).components[0].options[2].label, 'Item 3');
  assert.equal(result.last.components.at(-1).components[0].disabled, true);
  assert.match(result.last.text, /Last/);
  assert.ok(result.replies.filter((reply) => reply.components).every((reply) => reply.flags & 32768));
});

test('a RegExp component route provides named parameters on every dispatch', async () => {
  const regex = /^ticket:(?<id>\d+)$/g;
  regex.lastIndex = 4;
  const def = defineComponent({ id: regex, run: (ctx, { id }) => ctx.update(id) });
  assert.equal((await runComponent(def, { id: 'ticket:42' })).text, '42');
  assert.equal((await runComponent(def, { id: 'ticket:43' })).text, '43');
  assert.equal(regex.lastIndex, 4);
  assert.throws(() => runComponent(def), { code: 'NO_MATCH' });
});

test('prefix testing exercises aliases, parsed input and file type rules', async () => {
  const command = defineCommand({
    name: 'upload', description: 'Upload', aliases: ['up'],
    options: {
      copies: opt.integer('Copies', { required: true }),
      report: opt.attachment('Report', { required: true, types: ['.PDF'] }),
    },
    run: (ctx, { copies, report }) => ctx.reply(`${copies}:${report.name}`),
  });
  const content = '?up 2';
  const passed = await runPrefix(command, { prefix: '?', content, attachments: [{ id: '1', name: 'report.PDF' }] });
  assert.equal(passed.ctx.kind, 'prefix');
  assert.equal(passed.text, '2:report.PDF');
  const refused = await runPrefix(command, { prefix: '?', content, attachments: [{ id: '2', name: 'report.exe' }] });
  assert.match(refused.text, /attach a file of type .PDF/);
  assert.match(refused.text, /Usage/);
});

test('prefix commands support escaped quotes and custom argument splitters', async () => {
  const options = { first: opt.string('First'), second: opt.string('Second') };
  const run = (ctx, { first, second }) => ctx.reply(`${first}|${second}`);
  const standard = defineCommand({ name: 'standard', description: 'Standard', options, run });
  const custom = defineCommand({ name: 'custom', description: 'Custom', options, run, splitPrefix: (text) => text.split(';') });
  const quoted = await runPrefix(standard, { content: String.raw`!standard "first \"quote\"" second words` });
  assert.equal(quoted.text, 'first "quote"|second words');
  assert.equal((await runPrefix(custom, { content: '!custom one;two words' })).text, 'one|two words');
});

test('plugins register feature bundles, order their lifecycle and unwind on failure', async () => {
  const events = [];
  const utility = definePlugin({
    name: 'utility',
    setup() { events.push('utility:start'); return () => { events.push('utility:stop'); }; },
  });
  const commands = definePlugin({
    name: 'commands', requires: ['utility'],
    definitions: [defineCommand({ name: 'plugin', description: 'Plugin', run: (ctx) => ctx.reply('Plugin command') })],
    async use(ctx, next) { events.push('plugin:middleware'); await next(); },
    setup() { events.push('commands:start'); return () => { events.push('commands:stop'); }; },
  });
  const bot = createTestBot({ plugins: [commands, utility] });
  try {
    await bot.prepareREST('offline-placeholder');
    assert.deepEqual(bot.plugins, ['utility', 'commands']);
    assert.equal((await runCommand(bot.getCommand('plugin'), { bot })).text, 'Plugin command');
  } finally {
    await bot.stop();
  }
  assert.deepEqual(events, ['utility:start', 'commands:start', 'plugin:middleware', 'commands:stop', 'utility:stop']);
  assert.throws(() => createTestBot({ plugins: [commands] }), { code: 'INVALID_PLUGIN' });
  assert.throws(() => createTestBot({ plugins: [definePlugin({ name: 'loop', requires: ['loop'] })] }), { code: 'INVALID_PLUGIN' });
  const failure = definePlugin({ name: 'failure', requires: ['utility'], setup() { throw new Error('Plugin failed'); } });
  const broken = createTestBot({ plugins: [failure, utility] });
  try {
    await assert.rejects(broken.prepareREST('offline-placeholder'), /Plugin failed/);
    assert.deepEqual(events.slice(-2), ['utility:start', 'utility:stop']);
  } finally {
    await broken.stop();
  }
});

test('stop cancels an in-progress REST startup and waits for plugin cleanup', async () => {
  let enter, resume;
  const entered = new Promise((resolve) => { enter = resolve; });
  const resumed = new Promise((resolve) => { resume = resolve; });
  let cleaned = 0;
  const plugin = definePlugin({
    name: 'resource',
    async setup() {
      enter();
      await resumed;
      return () => { cleaned++; };
    },
  });
  const bot = createTestBot({ plugins: [plugin] });
  const started = bot.prepareREST('offline-placeholder');
  const cancelled = assert.rejects(started, { code: 'START_CANCELLED' });
  await entered;
  const stopping = bot.stop();
  assert.equal(bot.stop(), stopping);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cleaned, 0);
  resume();
  await cancelled;
  await stopping;
  assert.equal(cleaned, 1);
});

test('message cache settings cap each channel and retain default sweepers', async () => {
  const options = messageCache({ maxPerChannel: 2, lifetime: '2m', interval: '30s' });
  assert.deepEqual(options.sweepers.messages, { lifetime: 120, interval: 30 });
  assert.ok(options.sweepers.threads);
  class MessageManager {}
  const cache = options.makeCache(MessageManager, {}, MessageManager);
  cache.set('1', 1).set('2', 2).set('3', 3);
  assert.deepEqual([...cache.keys()], ['2', '3']);
  assert.throws(() => messageCache({ maxPerChannel: -1 }), { code: 'INVALID_CACHE' });
  const bot = createBot({ env: false, client: messageCache({ maxPerChannel: 0 }) });
  await bot.stop();
});

test('DM, channel and role guards apply before running the command', async () => {
  const command = defineCommand({ name: 'safe', description: 'Protected', use: [channelOnly(0), requireRoles('42')], run: (ctx) => ctx.reply('allowed') });
  assert.match((await runCommand(command, { channel: { type: 1 } })).text, /channel type/);
  assert.match((await runCommand(command, { channel: { type: 0 } })).text, /required roles/);
  assert.equal((await runCommand(command, { channel: { type: 0 }, member: { roles: ['42'] } })).text, 'allowed');
  const privateCommand = defineCommand({ name: 'private', description: 'DM', use: dmOnly(), run: (ctx) => ctx.reply('allowed') });
  assert.match((await runCommand(privateCommand)).text, /direct messages/);
  assert.equal((await runCommand(privateCommand, { guildId: null })).text, 'allowed');
});

test('concurrency guards release slots after failed work', async () => {
  let start, release;
  const started = new Promise((resolve) => { start = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const bot = createTestBot();
  let runs = 0;
  const command = defineCommand({
    name: 'concurrent', description: 'Limit', use: limitConcurrency(1),
    async run(ctx) {
      if (++runs === 1) {
        start();
        await gate;
        throw new Error('first run failed');
      }
      await ctx.reply('next run');
    },
  });
  const first = runCommand(command, { bot });
  await started;
  const blocked = await runCommand(command, { bot });
  assert.match(blocked.text, /already running/);
  assert.equal(blocked.error, null);
  release();
  assert.equal((await first).error.message, 'first run failed');
  assert.equal((await runCommand(command, { bot })).text, 'next run');
  await bot.stop();
});

test('a filtered once event is consumed by the first matching payload', async () => {
  const bot = createTestBot().add(defineEvent({
    name: 'messageDelete', once: true,
    async filter(_bot, message) { return message.id === 'match'; },
    run(bot, message) { bot.emit('matching-message', message.id); },
  }));
  const seen = [];
  bot.on('matching-message', (id) => seen.push(id));
  for (const id of ['skip', 'match', 'match']) bot.client.emit('messageDelete', { id });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['match']);
  await bot.stop();
});

test('awaitModal returns a context with the submitted fields', async () => {
  const cmd = defineCommand({
    name: 'ask',
    description: 'x',
    async run(ctx) {
      const form = await ctx.awaitModal(modal({ id: 'ask', title: 'Ask' }, textInput({ id: 'q', label: 'Question' })));
      if (form) await form.reply(`asked: ${form.fields.q}`);
    },
  });
  assert.equal((await runCommand(cmd, { submit: { q: 'why?' } })).last.text, 'asked: why?');
  assert.equal((await runCommand(cmd)).replies.length, 1);
});

test('autoDefer acknowledges slow handlers before Discord times out', async () => {
  const bot = createTestBot({ autoDefer: 10 });
  const slow = defineCommand({ name: 's', description: 'x', async run(ctx) { await new Promise((done) => setTimeout(done, 40)); await ctx.reply('done'); } });
  assert.deepEqual((await runCommand(slow, { bot })).replies.map((r) => r.method), ['defer', 'edit']);
  const fast = defineCommand({ name: 'f', description: 'x', run: (ctx) => ctx.reply('done') });
  assert.deepEqual((await runCommand(fast, { bot })).replies.map((r) => r.method), ['reply']);
  const modalFirst = defineCommand({ name: 'modal-first', description: 'x', defer: false, async run(ctx) {
    await new Promise((done) => setTimeout(done, 40));
    await ctx.showModal(modal({ id: 'ask', title: 'Ask' }, textInput({ id: 'q', label: 'Question' })));
  } });
  assert.deepEqual((await runCommand(modalFirst, { bot })).replies.map((r) => r.method), ['modal']);
});

test('translations fall back to the default locale, then the key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiver-'));
  await writeFile(join(dir, 'en-US.json'), JSON.stringify({ hello: 'Hello {name}', bye: 'Bye' }));
  await writeFile(join(dir, 'pl.json'), JSON.stringify({ hello: 'Cześć {name}', nav: { home: 'Start' } }));
  const bot = createTestBot({ locales: dir, resolveLocale: (ctx, fallback) => ctx.user.id === 'preferred' ? 'pl' : fallback });
  await bot.loadLocales();
  const cmd = defineCommand({ name: 't', description: 'x', run: (ctx) => ctx.reply([ctx.t('hello', { name: 'Ada' }), ctx.t('bye'), ctx.t('missing')].join('|')) });
  assert.equal((await runCommand(cmd, { bot, locale: 'pl' })).text, 'Cześć Ada|Bye|missing');
  assert.equal((await runCommand(cmd, { bot, locale: 'en-US', user: { id: 'preferred' } })).text, 'Cześć Ada|Bye|missing');
  assert.equal(bot.t('pl', 'nav.home'), 'Start');
  await rm(dir, { recursive: true });
});

test('defineTask validates its interval', () => {
  assert.throws(() => defineTask({ name: 'fast', every: 10, run() {} }), /at least 1 second/);
  assert.doesNotThrow(() => defineTask({ name: 'ok', every: '5m', run() {} }));
});
