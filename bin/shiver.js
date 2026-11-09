#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createBot } from '../src/index.js';

const HELP = `shiver — CLI for shiver-framework

  shiver init [dir]         Create a new bot project
  shiver new <kind> <name>  Create a command, component, modal, event or task
  shiver check [--dir src]  Load every definition and validate it (no token, no network)
  shiver manifest          Print registration JSON, routes, events, tasks and intents offline
  shiver sync  [--dir src]  Register commands with Discord (needs DISCORD_TOKEN)

Options
  --dir <path>    Where your definitions live (default: ./src)
  --guild <id>    sync: register to one server instead of globally (instant updates)
  --prune         sync: remove commands that are missing locally in the selected scopes
  --dry-run       sync: preview creates, upserts and removals without writing to Discord
  --json          check/sync: print machine-readable output
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { dir: { type: 'string', default: './src' }, guild: { type: 'string' }, prune: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
});
const [command, target, name] = positionals;

async function load(extra = {}) {
  const bot = createBot({ dir: values.dir, sync: false, logLevel: 'warn', ...extra });
  try {
    await bot.load();
  } catch (error) {
    await bot.client.destroy();
    throw error;
  }
  return bot;
}

function prefixWarnings(command, path = command.name) {
  if (command.subcommands) {
    return Object.entries(command.subcommands).flatMap(([name, child]) => prefixWarnings(child, `${path} ${name}`));
  }
  return Object.entries(command.options ?? {})
    .filter(([, option]) => option.kind !== 'attachment' && option.autocomplete)
    .map(([name]) => `${path}: prefix users must type "${name}" without Discord autocomplete.`);
}

async function check() {
  let bot;
  try {
    bot = await load({ env: false });
    const scopes = [...bot.commandData()].map(([scope, body]) => ({ scope, commands: body.map((c) => c.name) }));
    const warnings = [...bot.commands.values()]
      .filter((command) => command.type === 'slash' && command.prefix !== false)
      .flatMap((command) => prefixWarnings(command));
    const result = { ok: true, ...bot.summary, intents: bot.intents.toArray(), scopes, warnings };
    if (values.json) return console.log(JSON.stringify(result, null, 2));
    console.log(`OK  ${result.commands} commands, ${result.components} components, ${result.modals} modals, ${result.events} events, ${result.tasks} tasks`);
    for (const { scope, commands } of scopes) console.log(`    ${scope}: ${commands.join(', ') || '(none)'}`);
    console.log(`    intents: ${result.intents.join(', ')}`);
    for (const warning of warnings) console.warn(`WARN  ${warning}`);
  } catch (error) {
    if (values.json) console.log(JSON.stringify({ ok: false, code: error.code ?? null, error: error.message }, null, 2));
    else console.error(error.message);
    process.exitCode = 1;
  } finally {
    await bot?.client.destroy();
  }
  return undefined;
}

async function sync() {
  let bot;
  try {
    bot = await load({ devGuild: values.guild });
    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error('DISCORD_TOKEN is not set. Add it to .env or the environment.');
    if (values['dry-run']) {
      const plan = await bot.planSync({ token, prune: values.prune });
      if (values.json) return console.log(JSON.stringify(plan, null, 2));
      for (const { scope, ...actions } of plan) {
        console.log(scope);
        for (const [action, commands] of Object.entries(actions)) {
          for (const { name, type } of commands) console.log(`    ${action}: ${name} (type ${type})`);
        }
      }
      return;
    }
    const results = await bot.sync({ token, force: true, prune: values.prune });
    if (values.json) return console.log(JSON.stringify(results, null, 2));
    for (const r of results) console.log(`Synced ${r.count} command(s) to ${r.scope}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await bot?.client.destroy();
  }
}

async function manifest() {
  let bot;
  try {
    bot = await load({ env: false, devGuild: values.guild });
    console.log(JSON.stringify(bot.manifest(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await bot?.client.destroy();
  }
}

async function init() {
  const dir = resolve(target ?? '.');
  if (existsSync(join(dir, 'package.json'))) {
    console.error(`${dir} already has a package.json. Choose an empty directory: shiver init my-bot`);
    process.exitCode = 1;
    return;
  }
  const template = fileURLToPath(new URL('../templates/basic', import.meta.url));
  await cp(template, dir, { recursive: true });
  await rename(join(dir, 'gitignore'), join(dir, '.gitignore'));
  const pkgPath = join(dir, 'package.json');
  const name = basename(dir).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  await writeFile(pkgPath, (await readFile(pkgPath, 'utf8')).replace('"my-bot"', JSON.stringify(name)));
  console.log(`Created ${dir}

  ${target ? `cd ${target}\n  ` : ''}npm install
  copy .env.example to .env and paste your bot token
  npm run dev
`);
}

const generators = {
  command: ['defineCommand', (id) => `{ name: ${id}, description: 'Describe this command', run: (ctx) => ctx.reply('Ready') }`],
  component: ['defineComponent', (id) => `{ id: ${id}, run: (ctx) => ctx.update('Handled') }`],
  modal: ['defineModal', (id) => `{ id: ${id}, run: (ctx) => ctx.reply({ content: 'Saved', ephemeral: true }) }`],
  event: ['defineEvent', (id) => `{ name: ${id}, run: (bot) => bot.log.debug('Event received') }`],
  task: ['defineTask', (id) => `{ name: ${id}, every: '1m', run: (bot) => bot.log.debug('Task ran') }`],
};

async function scaffold() {
  const validName = target === 'event' ? /^[a-z][a-zA-Z0-9]{0,63}$/ : /^[a-z0-9][a-z0-9_-]{0,31}$/;
  if (!Object.hasOwn(generators, target) || typeof name !== 'string' || !validName.test(name)) {
    console.error('Usage: shiver new <command|component|modal|event|task> <name>. Use a simple file name without spaces or path separators.');
    process.exitCode = 1;
    return;
  }
  const [define, body] = generators[target];
  const dir = resolve(values.dir, `${target}s`);
  const file = join(dir, `${name}.js`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, `import { ${define} } from 'shiver-framework';\n\nexport default ${define}(${body(JSON.stringify(name))});\n`, { flag: 'wx' });
    console.log(`Created ${file}`);
  } catch (error) {
    console.error(error.code === 'EEXIST' ? `${file} already exists.` : error.message);
    process.exitCode = 1;
  }
}

const commands = { check, sync, manifest, init, new: scaffold };
if (values.help || !Object.hasOwn(commands, command)) console.log(HELP);
else await commands[command]();
