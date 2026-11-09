import { PermissionsBitField } from 'discord.js';
import { ShiverError } from './errors.js';
import { buildOptions, checkDescription, checkName } from './options.js';
import { clean, ms } from './util.js';

export const KIND = Symbol.for('shiver.kind');

const COMMAND_TYPE = { slash: 1, user: 2, message: 3, entryPoint: 4 };
const CONTEXT = { guild: 0, botDM: 1, privateChannel: 2 };
const INSTALL = { guild: 0, user: 1 };

const fail = (code, message) => { throw new ShiverError(code, message); };
const tag = (kind, def) => Object.freeze({ ...def, [KIND]: kind });

function checkNode(node, where, depth) {
  if (node.splitPrefix !== undefined && typeof node.splitPrefix !== 'function') fail('INVALID_COMMAND', `${where}: splitPrefix must be a function.`);
  if (node.subcommands) {
    if (node.run) fail('INVALID_COMMAND', `${where}: a command with subcommands cannot also have "run". Discord never invokes the parent.`);
    if (depth >= 2) fail('INVALID_COMMAND', `${where}: subcommands nest at most two levels (command → group → subcommand).`);
    const entries = Object.entries(node.subcommands);
    if (!entries.length || entries.length > 25) fail('INVALID_COMMAND', `${where}: needs 1-25 subcommands, got ${entries.length}.`);
    for (const [name, child] of entries) {
      const at = `${where} ${name}`;
      checkName(name, at);
      checkDescription(child.description, at);
      checkNode(child, at, depth + 1);
    }
    return;
  }
  if (typeof node.run !== 'function') fail('INVALID_COMMAND', `${where}: needs a "run(ctx, options)" function or "subcommands".`);
  buildOptions(node.options, where);
  if (node.cooldown !== undefined) ms(typeof node.cooldown === 'object' ? node.cooldown.duration : node.cooldown);
}

export function defineCommand(def) {
  if (!def || typeof def !== 'object') fail('INVALID_COMMAND', 'defineCommand() needs an object: defineCommand({ name, description, run }).');
  const type = def.type ?? 'slash';
  if (!Object.hasOwn(COMMAND_TYPE, type)) fail('INVALID_COMMAND', `Command "${def.name}": type must be "slash", "user", "message" or "entryPoint", got ${JSON.stringify(def.type)}.`);
  const where = `Command "${def.name}"`;
  if (type === 'slash') {
    checkName(def.name, where);
    checkDescription(def.description, where);
    checkNode(def, where, 0);
  } else if (type === 'entryPoint') {
    if (typeof def.name !== 'string' || !def.name.length || def.name.length > 32) fail('INVALID_COMMAND', `${where}: entry point names are 1–32 characters.`);
    checkDescription(def.description, where);
    if (def.guilds || def.options || def.subcommands) fail('INVALID_COMMAND', `${where}: Activity entry points are global and have no options or subcommands.`);
    const handler = def.handler ?? 'app';
    if (handler === 'app' && typeof def.run === 'function') return tag('command', { ...def, type, handler });
    if (handler === 'discord' && def.run === undefined) return tag('command', { ...def, type, handler });
    fail('INVALID_COMMAND', `${where}: use handler: "app" with run(ctx), or handler: "discord" without a handler function.`);
  } else {
    if (typeof def.name !== 'string' || !def.name.length || def.name.length > 32) fail('INVALID_COMMAND', `${where}: context menu names are 1-32 characters.`);
    if (typeof def.run !== 'function') fail('INVALID_COMMAND', `${where}: needs a "run(ctx, target)" function.`);
    if (def.options || def.subcommands) fail('INVALID_COMMAND', `${where}: context menu commands have no options or subcommands.`);
  }
  return tag('command', { ...def, type });
}

export function defineComponent(def) {
  checkHandler('defineComponent', def);
  return tag('component', def);
}
export const defineButton = defineComponent;
export const defineSelect = defineComponent;

export function defineModal(def) {
  checkHandler('defineModal', def);
  return tag('modal', def);
}

function checkHandler(fn, def) {
  if (!(def?.id instanceof RegExp) && (typeof def?.id !== 'string' || !def.id)) fail('INVALID_HANDLER', `${fn}() needs a string or RegExp "id" pattern, e.g. ${fn}({ id: "poll:vote:{choice}", run }).`);
  if (typeof def.run !== 'function') fail('INVALID_HANDLER', `${fn}({ id: "${def.id}" }) needs a "run(ctx, params)" function.`);
  if (typeof def.id === 'string' && def.id.replace(/\{\w+\}/g, '').length > 100) fail('INVALID_HANDLER', `${fn}: id pattern "${def.id}" is longer than Discord's 100 character custom id limit.`);
}

export function defineEvent(def) {
  if (typeof def?.name !== 'string') fail('INVALID_EVENT', 'defineEvent() needs a "name": defineEvent({ name: "guildMemberAdd", run(bot, member) {} }).');
  if (typeof def.run !== 'function') fail('INVALID_EVENT', `Event "${def.name}" needs a "run(bot, ...args)" function.`);
  if (def.filter !== undefined && typeof def.filter !== 'function') fail('INVALID_EVENT', `Event "${def.name}" needs a filter function.`);
  return tag('event', def);
}

export function defineTask(def) {
  if (typeof def?.name !== 'string') fail('INVALID_TASK', 'defineTask() needs a "name".');
  if (typeof def.run !== 'function') fail('INVALID_TASK', `Task "${def.name}" needs a "run(bot)" function.`);
  if (ms(def.every) < 1000) fail('INVALID_TASK', `Task "${def.name}": "every" must be at least 1 second.`);
  return tag('task', def);
}

const perms = (value) => (value === undefined || value === null ? undefined : PermissionsBitField.resolve(value).toString());

function nodeOptions(node, where) {
  if (!node.subcommands) return buildOptions(node.options, where);
  return Object.entries(node.subcommands).map(([name, child]) => clean({
    type: child.subcommands ? 2 : 1,
    name,
    description: child.description,
    name_localizations: child.nameLocalizations,
    description_localizations: child.descriptionLocalizations,
    options: nodeOptions(child, `${where} ${name}`),
  }));
}

export function commandToJSON(def) {
  const slash = def.type === 'slash';
  const entry = def.type === 'entryPoint';
  const contexts = def.contexts ?? (def.guildOnly ? ['guild'] : undefined);
  return clean({
    type: COMMAND_TYPE[def.type],
    name: def.name,
    description: slash || entry ? def.description : undefined,
    options: slash ? nodeOptions(def, `Command "${def.name}"`) : undefined,
    default_member_permissions: perms(def.defaultMemberPermissions ?? def.permissions),
    nsfw: def.nsfw || undefined,
    contexts: contexts?.map((c) => CONTEXT[c] ?? c),
    integration_types: def.install?.map((i) => INSTALL[i] ?? i),
    name_localizations: def.nameLocalizations,
    description_localizations: slash || entry ? def.descriptionLocalizations : undefined,
    handler: entry ? (def.handler === 'discord' ? 2 : 1) : undefined,
  });
}

export function resolveLeaf(def, path) {
  const chain = [def];
  let node = def;
  let used = 0;
  while (node.subcommands) {
    const name = path[used]?.toLowerCase();
    if (!Object.hasOwn(node.subcommands, name)) break;
    const next = node.subcommands[name];
    chain.push((node = next));
    used++;
  }
  return { leaf: node, chain, rest: path.slice(used) };
}

export function compilePattern(pattern) {
  if (pattern instanceof RegExp) {
    const regex = new RegExp(pattern.source, pattern.flags);
    return (id) => {
      regex.lastIndex = 0;
      const match = regex.exec(id);
      return match ? Object.fromEntries(Object.entries(match.groups ?? {}).filter(([, value]) => value !== undefined)) : null;
    };
  }
  const names = [];
  const source = pattern.split(/(\{\w+\})/).map((part) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    if (!name) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    names.push(name);
    return '(.*?)';
  }).join('');
  const regex = new RegExp(`^${source}$`, 's');
  return (id) => {
    const match = regex.exec(id);
    return match ? Object.fromEntries(names.map((name, i) => [name, match[i + 1]])) : null;
  };
}

export function customId(pattern, params = {}) {
  const id = pattern.replace(/\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(params, name) || params[name] === undefined) fail('INVALID_COMPONENT', `customId("${pattern}"): missing value for "{${name}}".`);
    return String(params[name]);
  });
  if (id.length > 100) fail('INVALID_COMPONENT', `customId("${pattern}") produced ${id.length} characters; Discord allows 100. Store the data and pass a short key.`);
  return id;
}
