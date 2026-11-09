import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, Events, GatewayIntentBits, IntentsBitField, Partials, PermissionsBitField, Routes } from 'discord.js';
import { Context, readFields } from './context.js';
import { commandToJSON, compilePattern, KIND, resolveLeaf } from './define.js';
import { ShiverError, UserError } from './errors.js';
import { compose, guardsFor } from './middleware.js';
import { parsePrefixOptions, readInteractionOptions, tokenize, usage } from './options.js';
import { PluginSet } from './plugin.js';
import { MemoryStore } from './store.js';
import { ms, traceId } from './util.js';

const G = GatewayIntentBits;
const commandRoute = (app, scope) => scope === 'global'
  ? Routes.applicationCommands(app)
  : Routes.applicationGuildCommands(app, scope);
const commandKey = ({ type, name }) => type === 4 ? '4:' : `${type}:${name}`;
const isId = (value) => typeof value === 'string' && /^\d{17,20}$/.test(value);

function translation(dictionary, key) {
  if (typeof dictionary?.[key] === 'string') return dictionary[key];
  let value = dictionary;
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return typeof value === 'string' ? value : undefined;
}

const EVENT_INTENTS = [
  [/^guildMember|^guildMembersChunk|^threadMembersUpdate/, G.GuildMembers],
  [/^guildBan|^guildAuditLogEntry/, G.GuildModeration],
  [/^emoji|^sticker|^guildSoundboard|^soundboard/, G.GuildExpressions],
  [/^guildIntegrationsUpdate/, G.GuildIntegrations],
  [/^webhook/, G.GuildWebhooks],
  [/^invite/, G.GuildInvites],
  [/^voiceState|^voiceChannelEffect/, G.GuildVoiceStates],
  [/^presenceUpdate/, G.GuildPresences],
  [/^message(Create|Update|Delete|BulkDelete|DeleteBulk)$/, G.GuildMessages],
  [/^messageReaction/, G.GuildMessageReactions],
  [/^typingStart/, G.GuildMessageTyping],
  [/^guildScheduledEvent/, G.GuildScheduledEvents],
  [/^autoModerationRule/, G.AutoModerationConfiguration],
  [/^autoModerationAction/, G.AutoModerationExecution],
  [/^messagePollVote/, G.GuildMessagePolls],
];

const MESSAGES = {
  error: (id) => `Something went wrong. If it keeps happening, report code \`${id}\`.`,
  cooldown: (unix) => `You're doing that too often. Try again <t:${unix}:R>.`,
  guildOnly: 'This only works in a server.',
  dmOnly: 'This only works in direct messages.',
  channelOnly: 'This does not work in this channel type.',
  roles: 'You need the required roles to use this.',
  busy: 'This action is already running. Try again in a moment.',
  ownerOnly: 'Only the bot owner can use this.',
  nsfw: 'This only works in age-restricted channels.',
  userPermissions: (list) => `You need these permissions: ${list}.`,
  botPermissions: (list) => `I need these permissions here: ${list}.`,
  premium: 'This needs an active subscription.',
  expired: 'This has expired. Run the command again.',
  notYours: 'Only the person who ran the command can use this.',
  usage: (line) => `Usage: \`${line}\``,
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };

export function createLogger(level = 'info') {
  const min = LEVELS[level] ?? 20;
  const at = (name, sink) => (...args) => {
    if (LEVELS[name] >= min) sink(`${new Date().toISOString().slice(11, 19)} ${name.padEnd(5)}`, ...args);
  };
  return { debug: at('debug', console.debug), info: at('info', console.log), warn: at('warn', console.warn), error: at('error', console.error) };
}

const MODULE = /\.(?:js|mjs|cjs|ts|mts)$/;

function createRegistry() {
  return {
    commands: new Map(),
    prefixes: new Map(),
    routes: { component: { exact: new Map(), patterns: [] }, modal: { exact: new Map(), patterns: [] } },
    entryPoint: null,
  };
}

export async function loadDefinitions(dir, bust = '') {
  const root = resolve(dir);
  const entry = process.argv[1] ? resolve(process.argv[1]) : null;
  const definitions = [];
  const errors = [];
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((item) => item.isFile() && MODULE.test(item.name) && !/\.d\.[mc]?ts$|\.(?:test|spec)\./.test(item.name))
    .map((item) => join(item.parentPath, item.name))
    .filter((file) => file !== entry)
    .filter((file) => !file.slice(root.length).split(/[\\/]/).some((part) => part.startsWith('_') || part.startsWith('.') || part === 'node_modules'))
    .sort();

  await Promise.all(files.map(async (file) => {
    try {
      const module = await import(pathToFileURL(file).href + bust);
      for (const value of new Set(Object.values(module).flat())) {
        if (value?.[KIND]) definitions.push(Object.freeze({ ...value, file }));
      }
    } catch (error) {
      errors.push({ file, error });
    }
  }));
  definitions.sort((a, b) => a.file.localeCompare(b.file));
  return { definitions, errors };
}

export class Bot extends EventEmitter {
  commands = new Map();
  owners = new Set();
  middleware = [];

  #definitions = [];
  #registry = createRegistry();
  #listeners = [];
  #timers = [];
  #locales = new Map();
  #watcher = null;
  #started = false;
  #startup = null;
  #startupAbort = null;
  #shutdown = null;
  #syncQueue = Promise.resolve();
  #loadQueue = Promise.resolve();
  #plugins;

  constructor(options = {}) {
    super();
    if (options.env !== false && existsSync('.env')) {
      try { process.loadEnvFile('.env'); } catch {}
    }
    this.options = {
      sync: true,
      validate: true,
      mentionPrefix: true,
      ownersBypassCooldown: true,
      defaultLocale: 'en-US',
      allowedMentions: { parse: ['users'], repliedUser: true },
      ...options,
      messages: { ...MESSAGES, ...options.messages },
    };
    this.log = options.logger ?? createLogger(options.logLevel ?? process.env.LOG_LEVEL);
    this.store = options.store ?? new MemoryStore();
    this.#plugins = new PluginSet(options.plugins ?? []);
    for (const id of [options.owners ?? []].flat()) this.owners.add(String(id));
    this.middleware.push(...[options.use ?? []].flat());

    this.client = new Client({
      intents: [G.Guilds],
      allowedMentions: this.options.allowedMentions,
      ...options.client,
    });
    this.client.on(Events.InteractionCreate, (interaction) => this.#onInteraction(interaction));
    this.client.on(Events.MessageCreate, (message) => this.handleMessage(message));
    this.client.on(Events.Error, (error) => this.log.error('discord.js client error', error));
    this.client.on(Events.Warn, (message) => this.log.warn(message));
    this.on('error', () => {});
    for (const plugin of this.#plugins.ordered) this.use(plugin.use ?? []);
    this.add(this.#plugins.ordered.flatMap((plugin) => plugin.definitions ?? []));
  }

  get plugins() { return this.#plugins.ordered.map((plugin) => plugin.name); }

  message(key, ...args) {
    const value = this.options.messages[key];
    return typeof value === 'function' ? value(...args) : value;
  }

  t(locale, key, vars = {}) {
    const text = translation(this.#locales.get(locale), key) ?? translation(this.#locales.get(this.options.defaultLocale), key) ?? key;
    return text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
  }

  use(...middleware) {
    this.middleware.push(...middleware.flat());
    return this;
  }

  add(...definitions) {
    const added = definitions.flat();
    const all = [...this.#definitions, ...added];
    const registry = createRegistry();
    for (const def of all) this.#register(def, registry);
    this.#installRegistry(registry, all);
    for (const def of added) this.#activate(def);
    return this;
  }

  #register(def, registry) {
    if (!def?.[KIND]) throw new ShiverError('INVALID_DEFINITION', 'bot.add() takes values created by defineCommand, defineComponent, defineModal, defineEvent or defineTask.');
    const at = def.file ? ` (${def.file})` : '';
    switch (def[KIND]) {
      case 'command': {
        const key = commandKey(def);
        if (registry.commands.has(key)) throw new ShiverError('DUPLICATE', `Two commands are named "${def.name}" with type ${def.type}${at}. Use a unique name within that command type.`);
        if (def.type === 'entryPoint') {
          if (registry.entryPoint) throw new ShiverError('DUPLICATE', 'An application can have only one Activity entry point.');
          registry.entryPoint = def;
        }
        registry.commands.set(key, def);
        if (def.type === 'slash' && def.prefix !== false) {
          for (const name of [def.name, ...(def.aliases ?? [])]) registry.prefixes.set(name.toLowerCase(), def);
        }
        break;
      }
      case 'component':
      case 'modal': {
        const table = registry.routes[def[KIND]];
        if (def.id instanceof RegExp || def.id.includes('{')) {
          const key = String(def.id);
          if (table.patterns.some((route) => String(route.def.id) === key)) throw new ShiverError('DUPLICATE', `Two ${def[KIND]} handlers use pattern "${key}"${at}.`);
          table.patterns.push({ match: compilePattern(def.id), def });
        }
        else if (table.exact.has(def.id)) throw new ShiverError('DUPLICATE', `Two ${def[KIND]} handlers use the id "${def.id}"${at}.`);
        else table.exact.set(def.id, def);
        break;
      }
      case 'event':
      case 'task':
        break;
      default:
        throw new ShiverError('INVALID_DEFINITION', `Unknown definition kind "${String(def[KIND])}"${at}.`);
    }
  }

  #activate(def) {
    if (def[KIND] === 'task' && this.client.isReady()) this.#startTask(def);
    if (def[KIND] !== 'event') return;
    const name = def.name === 'ready' ? Events.ClientReady : def.name;
    let used = false;
    const listener = (...args) => Promise.resolve().then(async () => {
      if (def.filter && !await def.filter(this, ...args)) return;
      if (def.once) {
        if (used) return;
        used = true;
        this.client.off(name, listener);
      }
      await def.run(this, ...args);
    }).catch((error) => {
      this.log.error(`Event "${def.name}" failed${def.file ? ` (${def.file})` : ''}`, error);
      this.emit('error', { error, event: def.name });
    });
    this.client[def.once && !def.filter ? 'once' : 'on'](name, listener);
    this.#listeners.push([name, listener]);
  }

  #installRegistry(registry, definitions) {
    this.#registry = registry;
    this.#definitions = definitions;
    this.commands.clear();
    for (const def of registry.commands.values()) {
      if (!this.commands.has(def.name) || def.type === 'slash') this.commands.set(def.name, def);
    }
    for (const [qualified, def] of registry.commands) {
      if (this.commands.get(def.name) === def) continue;
      let key = qualified;
      while (this.commands.has(key)) key = `:${key}`;
      this.commands.set(key, def);
    }
  }

  getCommand(name, type = 'slash') {
    return this.#registry.commands.get(`${type}:${name}`);
  }

  load(dir = this.options.dir, bust = '') {
    const run = this.#loadQueue.then(() => this.#load(dir, bust));
    this.#loadQueue = run.catch(() => {});
    return run;
  }

  async #load(dir, bust) {
    const all = [];
    const failed = [];
    for (const one of [dir].flat().filter(Boolean)) {
      try {
        const { definitions, errors } = await loadDefinitions(one, bust);
        all.push(...definitions);
        failed.push(...errors);
      } catch (error) {
        failed.push({ file: one, error });
      }
    }
    const manual = this.#definitions.filter((def) => !def.file);
    const definitions = [...manual, ...all];
    const registry = createRegistry();
    for (const def of definitions) {
      try { this.#register(def, registry); } catch (error) { failed.push({ file: def.file ?? '(bot.add)', error }); }
    }
    if (failed.length) {
      const lines = failed.map(({ file, error }) => `  ${file}\n    ${error.code ? `[${error.code}] ` : ''}${error.message}`);
      throw new ShiverError('LOAD_FAILED', `${failed.length} file(s) failed to load:\n${lines.join('\n')}`);
    }
    for (const [name, listener] of this.#listeners.splice(0)) this.client.off(name, listener);
    for (const timer of this.#timers.splice(0)) clearInterval(timer);
    this.#installRegistry(registry, definitions);
    for (const def of definitions) this.#activate(def);
    return this;
  }

  get summary() {
    const count = (kind) => this.#definitions.filter((def) => def[KIND] === kind).length;
    return { commands: count('command'), components: count('component'), modals: count('modal'), events: count('event'), tasks: count('task') };
  }

  get intents() {
    const bits = new IntentsBitField([G.Guilds, ...[this.options.intents ?? []].flat()]);
    if (this.options.prefix !== undefined) bits.add(G.GuildMessages, G.DirectMessages, G.MessageContent);
    for (const def of this.#definitions) {
      if (def[KIND] !== 'event') continue;
      for (const [pattern, intent] of EVENT_INTENTS) if (pattern.test(def.name)) bits.add(intent);
    }
    return bits;
  }

  commandData() {
    const scopes = new Map();
    const push = (scope, json) => scopes.set(scope, [...(scopes.get(scope) ?? []), json]);
    for (const def of this.commands.values()) {
      if (def.slash === false) continue;
      if (def.type === 'entryPoint' && this.options.devGuild) continue;
      const json = commandToJSON(def);
      const { contexts, integration_types, ...guildJSON } = json;
      const targets = this.options.devGuild ? [this.options.devGuild] : def.guilds ?? ['global'];
      for (const scope of [targets].flat()) push(String(scope), scope === 'global' ? json : guildJSON);
    }
    const defaultScope = this.options.devGuild ?? 'global';
    if (!scopes.has(defaultScope)) scopes.set(defaultScope, []);
    return scopes;
  }

  manifest() {
    const handlers = (kind) => this.#definitions
      .filter((def) => def[KIND] === kind)
      .map((def) => def.id instanceof RegExp ? { pattern: def.id.source, flags: def.id.flags } : { id: def.id });
    const names = (kind) => this.#definitions.filter((def) => def[KIND] === kind).map((def) => def.name);
    return {
      intents: this.intents.toArray(),
      scopes: [...this.commandData()].map(([scope, commands]) => ({ scope, commands })),
      prefixes: [...this.#registry.prefixes.keys()],
      components: handlers('component'),
      modals: handlers('modal'),
      events: names('event'),
      tasks: names('task'),
      plugins: this.plugins,
    };
  }

  sync(o = {}) {
    return this.#queueSync(() => this.#sync(o));
  }

  #queueSync(action) {
    const run = this.#syncQueue.then(action);
    this.#syncQueue = run.catch(() => {});
    return run;
  }

  async #syncTarget(token) {
    const rest = this.client.rest;
    if (token ?? this.client.token) rest.setToken(token ?? this.client.token);
    const application = token ? null : this.client.application;
    const appId = application?.id ?? (await rest.get(Routes.currentApplication())).id;
    return { rest, appId };
  }

  planSync(o = {}) {
    return this.#queueSync(async () => {
      const { rest, appId } = await this.#syncTarget(o.token);
      const describe = ({ name, type }) => ({ name, type });
      const plan = [];
      for (const [scope, local] of this.commandData()) {
        const remote = await rest.get(commandRoute(appId, scope));
        const remoteKeys = new Set(remote.map(commandKey));
        const localKeys = new Set(local.map(commandKey));
        const stale = remote.filter((command) => !localKeys.has(commandKey(command))).map(describe);
        plan.push({
          scope,
          create: local.filter((command) => !remoteKeys.has(commandKey(command))).map(describe),
          upsert: local.filter((command) => remoteKeys.has(commandKey(command))).map(describe),
          delete: o.prune ? stale : [],
          keep: o.prune ? [] : stale,
        });
      }
      return plan;
    });
  }

  async fetchPermissions({ guildId, channelId, userId, roleId, implicit } = {}) {
    const scopeId = guildId ?? channelId;
    const subjectId = userId ?? roleId;
    if (!isId(scopeId) || !isId(subjectId) || (guildId != null && channelId != null) ||
      (userId != null && roleId != null) || (implicit !== undefined && (!channelId || typeof implicit !== 'boolean'))) {
      throw new ShiverError('INVALID_PERMISSION_TARGET', 'Pass one guildId or channelId, one userId or roleId, and implicit only for channels.');
    }
    const route = channelId
      ? (userId ? Routes.channelPermissionsMember : Routes.channelPermissionsRole)
      : (userId ? Routes.guildPermissionsMember : Routes.guildPermissionsRole);
    const query = implicit === undefined ? undefined : new URLSearchParams({ implicit: String(implicit) });
    const { permissions } = await this.client.rest.get(route(scopeId, subjectId), { query });
    return new PermissionsBitField(permissions).freeze();
  }

  async #sync(o) {
    const { rest, appId } = await this.#syncTarget(o.token);
    const results = [];
    for (const [scope, body] of this.commandData()) {
      const key = `shiver:sync:upsert:${appId}:${scope}`;
      const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex');
      const changed = Boolean(o.prune || o.force || (await this.store.get(key)) !== hash);
      if (changed) {
        const route = commandRoute(appId, scope);
        const entry = body.find((command) => command.type === 4);
        const remoteEntry = entry && (await rest.get(route)).find((command) => command.type === 4);
        if (o.prune) {
          const commands = remoteEntry ? body.map((command) => command === entry ? { ...command, id: remoteEntry.id } : command) : body;
          await rest.put(route, { body: commands });
        } else {
          for (const command of body) {
            if (command === entry && remoteEntry) {
              await rest.patch(Routes.applicationCommand(appId, remoteEntry.id), { body: command });
            } else {
              await rest.post(route, { body: command });
            }
          }
        }
        await this.store.set(key, hash);
      }
      results.push({ scope, count: body.length, changed });
    }
    return results;
  }

  async start(token = this.options.token ?? process.env.DISCORD_TOKEN) {
    return this.#startSession(token, (signal) => this.#start(token, signal));
  }

  async prepareREST(token = this.options.token ?? process.env.DISCORD_TOKEN) {
    return this.#startSession(token, async (signal) => {
      await this.#prepare(token, signal);
      return this;
    });
  }

  async #startSession(token, start) {
    if (this.#started || this.#shutdown) throw new ShiverError('ALREADY_STARTED', 'The bot already has a session or is shutting down.');
    if (!token) throw new ShiverError('NO_TOKEN', 'No bot token. Put DISCORD_TOKEN=... in a .env file, or pass { token } to createBot().');
    this.#started = true;
    const controller = new AbortController();
    this.#startupAbort = controller;
    const launch = Promise.resolve().then(() => start(controller.signal));
    const startup = launch.catch(async (error) => {
      if (!this.#shutdown) await this.#disconnect().catch((cleanupError) => this.log.error('Startup cleanup failed', cleanupError));
      throw error;
    });
    this.#startup = startup;
    try {
      return await startup;
    } finally {
      this.#startup = null;
      this.#startupAbort = null;
    }
  }

  async #prepare(token, signal) {
    signal.throwIfAborted();
    this.client.rest.setToken(token);
    if (this.options.dir) await this.load();
    await this.loadLocales();
    signal.throwIfAborted();
    await this.#plugins.start(this, signal);
    signal.throwIfAborted();
  }

  async #start(token, signal) {
    await this.#prepare(token, signal);
    signal.throwIfAborted();

    const intents = this.intents;
    this.client.options.intents = intents.freeze();
    if (intents.has(G.DirectMessages) && !this.options.client?.partials) this.client.options.partials = [Partials.Channel];

    if (this.options.catchUnhandled !== false) {
      process.on('unhandledRejection', this.#onUnhandled);
    }
    if (this.options.signals !== false) {
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, this.#onSignal);
    }

    let onReady;
    const ready = new Promise((done) => { onReady = done; this.client.once(Events.ClientReady, onReady); });
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
    });
    try {
      await Promise.race([this.client.login(token).then(() => ready), cancelled]);
    } catch (error) {
      if (/disallowed intents/i.test(error.message)) {
        const privileged = ['GuildMembers', 'GuildPresences', 'MessageContent'].filter((name) => intents.has(G[name]));
        throw new ShiverError('DISALLOWED_INTENTS', `Discord rejected the login: privileged intents are not enabled. Turn on ${privileged.join(', ')} under Bot → Privileged Gateway Intents at https://discord.com/developers/applications.`);
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      this.client.off(Events.ClientReady, onReady);
    }

    signal.throwIfAborted();
    if (!this.owners.size) {
      const app = await this.client.application.fetch().catch(() => null);
      const owner = app?.owner;
      for (const id of owner?.members ? owner.members.keys() : owner ? [owner.id] : []) this.owners.add(id);
    }
    if (this.options.sync) {
      const results = await this.sync();
      for (const r of results) this.log[r.changed ? 'info' : 'debug'](`Commands ${r.changed ? 'synced' : 'unchanged'}: ${r.count} (${r.scope})`);
    }
    signal.throwIfAborted();
    for (const def of this.#definitions) if (def[KIND] === 'task') this.#startTask(def);
    if (this.options.watch && this.options.dir) this.#watch();

    const s = this.summary;
    this.log.info(`Ready as ${this.client.user.tag} — ${s.commands} commands, ${s.components + s.modals} component handlers, ${s.events} events, ${s.tasks} tasks`);
    this.emit('ready', this);
    return this;
  }

  #onUnhandled = (error) => this.log.error('Unhandled promise rejection', error);

  #onSignal = () => this.stop().then(
    () => process.exit(0),
    (error) => { this.log.error('Shutdown failed', error); process.exit(1); },
  );

  stop() {
    this.#shutdown ??= Promise.resolve().then(() => this.#stop()).finally(() => { this.#shutdown = null; });
    return this.#shutdown;
  }

  async #stop() {
    this.#startupAbort?.abort(new ShiverError('START_CANCELLED', 'Bot startup was cancelled by stop().'));
    await this.#startup?.catch(() => {});
    try {
      await this.#disconnect();
    } finally {
      await this.store.close?.();
    }
  }

  async #disconnect() {
    process.off('unhandledRejection', this.#onUnhandled);
    for (const signal of ['SIGINT', 'SIGTERM']) process.off(signal, this.#onSignal);
    const watcher = this.#watcher;
    this.#watcher = null;
    await watcher?.close();
    for (const timer of this.#timers.splice(0)) clearInterval(timer);
    try {
      try { await this.#plugins.stop(); } finally { await this.client.destroy(); }
    } finally {
      this.#started = false;
    }
  }

  #startTask(def) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try { await def.run(this); } catch (error) {
        this.log.error(`Task "${def.name}" failed`, error);
        this.emit('error', { error, task: def.name });
      } finally { running = false; }
    };
    this.#timers.push(setInterval(tick, ms(def.every)).unref());
    if (def.immediate) tick();
  }

  async loadLocales(dir = this.options.locales) {
    if (!dir) return;
    for (const entry of await readdir(dir)) {
      if (entry.endsWith('.json')) this.#locales.set(entry.slice(0, -5), JSON.parse(await readFile(join(dir, entry), 'utf8')));
    }
  }

  #watch() {
    let timer = null;
    let stopped = false;
    let pending = Promise.resolve();
    const reload = async () => {
      if (stopped) return;
      try {
        await this.load(this.options.dir, `?t=${Date.now()}`);
        if (stopped) return;
        if (this.options.sync) await this.sync();
        this.log.info('Reloaded');
        this.emit('reload', this);
      } catch (error) {
        this.log.error(error.message);
      }
    };
    const dirs = [this.options.dir].flat();
    const watchers = [];
    try {
      for (const dir of dirs) {
        const watcher = watch(dir, { recursive: true }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => { pending = pending.then(reload); }, 150);
        });
        watcher.on('error', (error) => this.log.error(`Watcher for "${dir}" failed`, error));
        watchers.push(watcher);
      }
    } catch (error) {
      watchers.forEach((watcher) => watcher.close());
      throw error;
    }
    this.#watcher = { close: () => {
      stopped = true;
      clearTimeout(timer);
      watchers.forEach((w) => w.close());
      return pending;
    } };
    this.log.info(`Watching ${dirs.join(', ')} for changes`);
  }

  async invoke(ctx, def, o = {}) {
    if (def[KIND] !== 'command') return this.#run(ctx, [def], (c) => def.run(c, c.params));
    if (def.type === 'entryPoint') {
      if (def.run) return this.#run(ctx, [def], (c) => def.run(c));
      return undefined;
    }
    if (def.type !== 'slash') return this.#run(ctx, [def], (c) => def.run(c, c.target));
    const { leaf, chain } = resolveLeaf(def, o.path ?? []);
    return this.#run(ctx, chain, (c) => leaf.run(c, c.options));
  }

  async #run(ctx, nodes, handler) {
    const first = nodes[0];
    const leaf = nodes.at(-1);
    const defer = leaf.defer ?? first.defer;
    let timer = null;
    try {
      if (ctx.isInteraction && ctx.kind !== 'autocomplete') {
        if (defer === 'update') await ctx.deferUpdate();
        else if (defer) await ctx.defer({ ephemeral: defer === 'ephemeral' ? true : undefined });
        else if (defer !== false && this.options.autoDefer) {
          const wait = this.options.autoDefer === true ? 2000 : ms(this.options.autoDefer);
          timer = setTimeout(() => (ctx.kind === 'command' ? ctx.defer() : ctx.deferUpdate()).catch(() => {}), wait);
        }
      }
      const stack = [...this.middleware, ...nodes.flatMap(guardsFor)];
      await compose(stack, handler)(ctx);
      this.emit('handled', ctx);
    } catch (error) {
      await this.#fail(ctx, error);
    } finally {
      clearTimeout(timer);
    }
  }

  async #fail(ctx, error) {
    if (error instanceof UserError) {
      const payload = typeof error.payload === 'string' ? { content: error.payload } : error.payload;
      await ctx.reply({ ...payload, ephemeral: true }).catch((e) => this.log.debug('Could not deliver a UserError', e));
      return;
    }
    if (error?.code === 10062) {
      this.log.warn(`Interaction expired before a reply was sent (${ctx.command?.name ?? ctx.interaction?.customId ?? 'unknown'}). Reply or defer within 3 seconds; set "defer: true" on slow handlers.`);
      return;
    }
    const id = traceId();
    const name = ctx.command?.name ?? ctx.interaction?.customId ?? ctx.kind;
    this.log.error(`[${id}] ${ctx.kind} "${name}" failed`, error);
    this.emit('error', { error, ctx, id });
    try {
      if (this.options.onError) await this.options.onError(ctx, error, id);
      else if (ctx.kind !== 'autocomplete') await ctx.reply({ content: this.message('error', id), ephemeral: true });
    } catch (e) {
      this.log.debug('Could not deliver the error message', e);
    }
  }

  async #onInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand()) return await this.#onSlash(interaction);
      if (interaction.isPrimaryEntryPointCommand?.()) return await this.#onEntryPoint(interaction);
      if (interaction.isContextMenuCommand()) return await this.#onContextMenu(interaction);
      if (interaction.isAutocomplete()) return await this.#onAutocomplete(interaction);
      if (interaction.isMessageComponent()) return await this.#onRouted('component', interaction);
      if (interaction.isModalSubmit()) return await this.#onRouted('modal', interaction);
    } catch (error) {
      this.log.error('Interaction dispatch failed', error);
    }
    return undefined;
  }

  #slashTarget(interaction) {
    const def = this.getCommand(interaction.commandName);
    if (!def) return null;
    const path = [interaction.options.getSubcommandGroup(false), interaction.options.getSubcommand(false)].filter(Boolean);
    return { def, ...resolveLeaf(def, path) };
  }

  async #onSlash(interaction) {
    const target = this.#slashTarget(interaction);
    if (!target) return void this.log.warn(`No handler for /${interaction.commandName}. Run a sync to remove stale commands.`);
    const { def, leaf, chain } = target;
    const ctx = new Context(this, { interaction }, {
      kind: 'command',
      command: def,
      options: readInteractionOptions(interaction, leaf.options),
      ephemeral: leaf.ephemeral ?? def.ephemeral,
    });
    await this.#run(ctx, chain, (c) => leaf.run(c, c.options));
  }

  async #onContextMenu(interaction) {
    const type = interaction.isUserContextMenuCommand() ? 'user' : 'message';
    const def = this.getCommand(interaction.commandName, type);
    if (!def) return;
    const target = interaction.targetMessage ?? interaction.targetMember ?? interaction.targetUser;
    const ctx = new Context(this, { interaction }, { kind: 'command', command: def, target, ephemeral: def.ephemeral });
    await this.invoke(ctx, def);
  }

  async #onEntryPoint(interaction) {
    const def = this.getCommand(interaction.commandName, 'entryPoint');
    if (!def) return;
    const ctx = new Context(this, { interaction }, { kind: 'command', command: def, ephemeral: def.ephemeral });
    await this.invoke(ctx, def);
  }

  async #onAutocomplete(interaction) {
    const target = this.#slashTarget(interaction);
    const focused = interaction.options.getFocused(true);
    const option = target?.leaf.options?.[focused.name];
    const complete = option?.autocomplete;
    if (!complete) return void await interaction.respond([]).catch(() => {});
    const ctx = new Context(this, { interaction }, { kind: 'autocomplete', command: target.def, options: readInteractionOptions(interaction, target.leaf.options) });
    try {
      let choices = [];
      const run = async (context) => { choices = (await complete(context, focused.value)) ?? []; };
      await compose([option.autocompleteUse ?? []].flat(), run)(ctx);
      await interaction.respond(choices.slice(0, 25).map((c) => (typeof c === 'object' ? c : { name: String(c), value: c })));
    } catch (error) {
      if (!(error instanceof UserError)) this.log.error(`Autocomplete for /${interaction.commandName} "${focused.name}" failed`, error);
      await interaction.respond([]).catch(() => {});
    }
  }

  #match(kind, id) {
    const table = this.#registry.routes[kind];
    const exact = table.exact.get(id);
    if (exact) return { def: exact, params: {} };
    for (const { match, def } of table.patterns) {
      const params = match(id);
      if (params) return { def, params };
    }
    return null;
  }

  async #onRouted(kind, interaction) {
    const hit = this.#match(kind, interaction.customId);
    if (!hit) {
      if (this.options.messages.expired) {
        setTimeout(() => {
          if (!interaction.replied && !interaction.deferred) interaction.reply({ content: this.message('expired'), flags: 64 }).catch(() => {});
        }, 2500).unref();
      }
      return;
    }
    const { def, params } = hit;
    const ctx = new Context(this, { interaction }, {
      kind,
      params,
      values: interaction.values ?? [],
      fields: kind === 'modal' ? readFields(interaction) : {},
      ephemeral: def.ephemeral,
    });
    await this.invoke(ctx, def);
  }

  async #prefixes(message) {
    const { prefix, mentionPrefix } = this.options;
    const list = [typeof prefix === 'function' ? await prefix(message) : prefix].flat().filter(Boolean);
    if (mentionPrefix && this.client.user) list.push(`<@${this.client.user.id}>`, `<@!${this.client.user.id}>`);
    return list.sort((a, b) => b.length - a.length);
  }

  async handleMessage(message) {
    if (this.options.prefix === undefined || message.author.bot || !message.content) return;
    try {
      const prefix = (await this.#prefixes(message)).find((p) => message.content.startsWith(p));
      if (prefix === undefined) return;
      const body = message.content.slice(prefix.length).trimStart();
      const tokens = tokenize(body);
      const def = tokens.length ? this.#registry.prefixes.get(tokens[0].value.toLowerCase()) : undefined;
      if (!def) return;

      const { leaf, chain, rest } = resolveLeaf(def, tokens.slice(1).map((t) => t.value));
      const used = tokens.length - rest.length;
      const text = used < tokens.length ? body.slice(tokens[used].index) : '';
      const ctx = new Context(this, { message }, { kind: 'prefix', command: def });
      const line = prefix + [def.name, ...tokens.slice(1, used).map((t) => t.value.toLowerCase())].join(' ');

      await this.#run(ctx, chain, async (c) => {
        if (leaf.subcommands) throw new UserError(this.message('usage', `${line} <${Object.keys(leaf.subcommands).join(' | ')}>`));
        try {
          c.options = await parsePrefixOptions(message, text, leaf.options, leaf.splitPrefix ?? def.splitPrefix ?? this.options.splitPrefix);
        } catch (error) {
          if (error instanceof UserError) throw new UserError(`${error.message}\n${this.message('usage', `${line} ${usage(leaf.options)}`.trim())}`);
          throw error;
        }
        return leaf.run(c, c.options);
      });
      return ctx;
    } catch (error) {
      this.log.error('Prefix dispatch failed', error);
    }
  }
}

export function createBot(options) {
  return new Bot(options);
}
