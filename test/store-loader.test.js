import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBot, JsonStore, loadDefinitions, MemoryStore, ms, resolveColor, scope, SqliteStore } from '../src/index.js';

const sleep = (time) => new Promise((done) => setTimeout(done, time));

async function contract(store) {
  assert.equal(await store.get('missing'), undefined);
  await store.set('guild:1:prefix', '!');
  await store.set('guild:2:prefix', '?');
  await store.set('temp', { a: 1 }, { ttl: 30 });
  assert.equal(await store.get('guild:1:prefix'), '!');
  assert.deepEqual(await store.get('temp'), { a: 1 });
  assert.deepEqual((await store.keys('guild:')).sort(), ['guild:1:prefix', 'guild:2:prefix']);
  const guild = scope(store, 'guild:1');
  assert.equal(await guild.get('prefix'), '!');
  assert.deepEqual(await guild.keys(), ['prefix']);
  await sleep(40);
  assert.equal(await store.get('temp'), undefined);
  assert.equal(await store.delete('guild:2:prefix'), true);
  assert.equal(await store.delete('guild:2:prefix'), false);
}

test('MemoryStore', async () => {
  const store = new MemoryStore();
  await contract(store);
  const value = { list: [1] };
  await store.set('v', value);
  value.list.push(2);
  assert.deepEqual(await store.get('v'), { list: [1] }, 'stored values are copies');
});

test('JsonStore persists across instances', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiver-'));
  const path = join(dir, 'nested', 'store.json');
  const first = new JsonStore(path);
  await contract(first);
  await first.close();
  assert.equal(JSON.parse(await readFile(path, 'utf8'))['guild:1:prefix'].value, '!');
  const second = new JsonStore(path);
  await second.close();
  assert.equal(await second.get('guild:1:prefix'), '!');
  await second.close();
  await rm(dir, { recursive: true });
});

test('JsonStore flush can recover after a failed write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiver-'));
  const path = join(dir, 'store.json');
  try {
    await mkdir(`${path}.tmp`);
    const store = new JsonStore(path);
    await store.set('ready', true);
    await assert.rejects(store.flush());
    await rm(`${path}.tmp`, { recursive: true });
    await store.close();
    assert.equal(JSON.parse(await readFile(path, 'utf8')).ready.value, true);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('SqliteStore', async () => {
  const store = new SqliteStore(':memory:');
  await contract(store);
  await store.set('100%_done', 1);
  assert.deepEqual(await store.keys('100%'), ['100%_done']);
  await store.close();
});

test('ms and resolveColor', () => {
  assert.equal(ms('1h30m'), 5400000);
  assert.equal(ms('500ms'), 500);
  assert.equal(ms(250), 250);
  assert.throws(() => ms('soon'), /Invalid duration/);
  assert.equal(resolveColor('#fff'), 0xffffff);
  assert.equal(resolveColor('blurple'), 0x5865f2);
  assert.throws(() => resolveColor('nope'), /Invalid color/);
  assert.throws(() => resolveColor('constructor'), /Invalid color/);
});

const root = fileURLToPath(new URL('..', import.meta.url));

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'shiver-'));
  await cp(join(root, 'templates', 'basic'), dir, { recursive: true });
  await mkdir(join(dir, 'node_modules'));
  await symlink(root, join(dir, 'node_modules', 'shiver-framework'), 'junction');
  return dir;
}

test('loader reports every failing file at once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiver-'));
  const lib = new URL('../src/index.js', import.meta.url).href;
  await writeFile(join(dir, 'ok.mjs'), `import { defineCommand } from ${JSON.stringify(lib)};\nexport default defineCommand({ name: 'ok', description: 'ok', run() {} });`);
  await writeFile(join(dir, 'bad.mjs'), `import { defineCommand } from ${JSON.stringify(lib)};\nexport default defineCommand({ name: 'Bad Name', description: 'x', run() {} });`);
  await writeFile(join(dir, 'dupe.mjs'), `import { defineCommand } from ${JSON.stringify(lib)};\nexport default defineCommand({ name: 'ok', description: 'again', run() {} });`);
  await writeFile(join(dir, '_helper.mjs'), 'throw new Error("underscore files are not loaded");');
  const bot = createBot({ env: false, logLevel: 'silent', dir });
  await assert.rejects(() => bot.load(), (e) => e.code === 'LOAD_FAILED' && /2 file\(s\)/.test(e.message) && /bad\.mjs/.test(e.message) && /lowercase/.test(e.message) && /Two commands are named "ok"/.test(e.message));
  await bot.client.destroy();
  await rm(dir, { recursive: true });
});

test('a rejected reload keeps the active commands, components and event listeners', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiver-'));
  const lib = new URL('../src/index.js', import.meta.url).href;
  const file = join(dir, 'features.mjs');
  const bot = createBot({ env: false, logLevel: 'silent', dir });
  const definition = (name) => `
    import { defineCommand, defineComponent, defineEvent } from ${JSON.stringify(lib)};
    export const command = defineCommand({ name: '${name}', description: 'Command', run() {} });
    export const component = defineComponent({ id: '${name}', run() {} });
    export const event = defineEvent({ name: 'messageDelete', run(bot) { bot.emit('active-listener', '${name}'); } });
  `;
  try {
    await writeFile(file, definition('old'));
    await bot.load();
    const commands = bot.commands;
    const old = bot.getCommand('old');
    await writeFile(file, definition('new'));
    await writeFile(join(dir, 'broken.mjs'), 'throw new Error("broken file");');
    await assert.rejects(bot.load(dir, '?failed'), { code: 'LOAD_FAILED' });
    assert.equal(bot.commands, commands);
    assert.equal(bot.getCommand('old'), old);
    assert.equal(bot.getCommand('new'), undefined);
    assert.equal(bot.summary.components, 1);
    const active = new Promise((resolve) => bot.once('active-listener', resolve));
    bot.client.emit('messageDelete');
    assert.equal(await active, 'old');
    await rm(join(dir, 'broken.mjs'));
    await bot.load(dir, '?good');
    assert.equal(bot.getCommand('old'), undefined);
    assert.equal(bot.getCommand('new').name, 'new');
    const refreshed = new Promise((resolve) => bot.once('active-listener', resolve));
    bot.client.emit('messageDelete');
    assert.equal(await refreshed, 'new');
  } finally {
    await bot.stop();
    await rm(dir, { recursive: true });
  }
});

test('starter template loads, and the CLI checks it', async () => {
  const dir = await project();
  const { definitions, errors } = await loadDefinitions(join(dir, 'src'));
  assert.deepEqual(errors, []);
  assert.equal(definitions.length, 7);

  const bot = createBot({ env: false, logLevel: 'silent', dir: join(dir, 'src') });
  await bot.load();
  assert.deepEqual(bot.summary, { commands: 3, components: 2, modals: 1, events: 1, tasks: 0 });
  assert.deepEqual(bot.commandData().get('global').map((c) => c.name).sort(), ['counter', 'feedback', 'ping']);
  await bot.client.destroy();

  const out = execFileSync(process.execPath, [join(root, 'bin', 'shiver.js'), 'check', '--json'], { cwd: dir, encoding: 'utf8' });
  const report = JSON.parse(out);
  assert.equal(report.ok, true);
  assert.equal(report.commands, 3);
  await rm(dir, { recursive: true });
});

test('shiver init scaffolds a project', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shiver-'));
  execFileSync(process.execPath, [join(root, 'bin', 'shiver.js'), 'init', 'My Bot'], { cwd: dir, encoding: 'utf8' });
  const pkg = JSON.parse(await readFile(join(dir, 'My Bot', 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'my-bot');
  await readFile(join(dir, 'My Bot', '.gitignore'), 'utf8');
  await readFile(join(dir, 'My Bot', 'src', 'commands', 'ping.js'), 'utf8');
  await mkdir(join(dir, 'My Bot', 'node_modules'));
  await symlink(root, join(dir, 'My Bot', 'node_modules', 'shiver-framework'), 'junction');
  const checked = execFileSync(process.execPath, [join(root, 'bin', 'shiver.js'), 'check', '--json'], {
    cwd: join(dir, 'My Bot'), encoding: 'utf8',
  });
  assert.equal(JSON.parse(checked).ok, true);
  await rm(dir, { recursive: true });
});

test('shiver check warns about prefix autocomplete and allows attachments', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'src', 'lookup.js'), `
      import { defineCommand, opt } from 'shiver-framework';
      export const lookup = defineCommand({
        name: 'lookup', description: 'Lookup', subcommands: {
          city: { description: 'City', options: {
            name: opt.string('Name', { autocomplete: () => ['Paris'] }),
            picture: opt.attachment('Picture'),
          }, run() {} },
        },
      });
      export const slashOnly = defineCommand({
        name: 'private', description: 'Lookup', prefix: false,
        options: { name: opt.string('Name', { autocomplete: () => [] }) }, run() {},
      });
    `);
    const output = execFileSync(process.execPath, [join(root, 'bin', 'shiver.js'), 'check', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output).warnings, ['lookup city: prefix users must type "name" without Discord autocomplete.']);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('shiver check rejects malformed numeric bounds and boolean choices offline', async () => {
  const dir = await project();
  try {
    for (const [name, option] of [['bounds', "opt.integer('N', { min: 10, max: 2 })"], ['choices', "opt.boolean('B', { choices: [true] })"]]) {
      await writeFile(join(dir, 'src', `${name}.js`), `
        import { defineCommand, opt } from 'shiver-framework';
        export default defineCommand({ name: '${name}', description: 'Invalid', options: { option: ${option} }, run() {} });
      `);
    }
    assert.throws(() => execFileSync(process.execPath, [join(root, 'bin', 'shiver.js'), 'check', '--json'], { cwd: dir, encoding: 'utf8' }), (error) => {
      const result = JSON.parse(error.stdout);
      assert.equal(error.status, 1);
      assert.equal(result.code, 'LOAD_FAILED');
      assert.match(result.error, /bounds[\s\S]*min must be less than or equal to max/);
      assert.match(result.error, /choices[\s\S]*only string, integer and number options support choices/);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('shiver new generates a loadable feature and refuses to overwrite it', async () => {
  const dir = await project();
  const cli = join(root, 'bin', 'shiver.js');
  const generate = () => execFileSync(process.execPath, [cli, 'new', 'command', 'extra'], { cwd: dir, encoding: 'utf8' });
  try {
    assert.match(generate(), /Created/);
    const path = join(dir, 'src', 'commands', 'extra.js');
    const contents = await readFile(path, 'utf8');
    assert.throws(generate, (error) => error.status === 1 && /already exists/.test(error.stderr));
    assert.equal(await readFile(path, 'utf8'), contents);
    const checked = execFileSync(process.execPath, [cli, 'check', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(JSON.parse(checked).commands, 4);
    const raw = execFileSync(process.execPath, [cli, 'manifest'], { cwd: dir, encoding: 'utf8' });
    const manifest = JSON.parse(raw);
    assert.ok(manifest.scopes[0].commands.some((command) => command.name === 'extra'));
    assert.ok(manifest.components.some((route) => route.id === 'counter:add:{count}'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('CLI prune dry-run outputs JSON without issuing a write', async () => {
  const dir = await project();
  try {
    const mock = join(dir, 'mock-rest.mjs');
    const discord = pathToFileURL(createRequire(import.meta.url).resolve('discord.js')).href;
    await writeFile(mock, `
      import { REST } from ${JSON.stringify(discord)};
      REST.prototype.get = async (route) => route === '/applications/@me'
        ? { id: '600000000000000001' }
        : [{ type: 1, name: 'stale' }];
      for (const method of ['put', 'post', 'patch', 'delete']) REST.prototype[method] = () => { throw new Error('Unexpected write'); };
    `);
    const args = ['--import', pathToFileURL(mock).href, join(root, 'bin', 'shiver.js'), 'sync', '--dry-run', '--prune', '--json'];
    const output = execFileSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, DISCORD_TOKEN: 'offline-fixture' } });
    const [plan] = JSON.parse(output);
    assert.equal(plan.scope, 'global');
    assert.deepEqual(plan.delete, [{ name: 'stale', type: 1 }]);
    assert.deepEqual(plan.create.map((entry) => entry.name).sort(), ['counter', 'feedback', 'ping']);
  } finally {
    await rm(dir, { recursive: true });
  }
});
