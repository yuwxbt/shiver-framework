`createBot(options)` configures loading, the Discord client, middleware, storage, and lifecycle behavior.

# Configuration

## Bot options

Relative paths resolve from the process working directory.

| Option | Default | Meaning |
| --- | --- | --- |
| `dir` | unset | Definition directory or array; omit for bot.add |
| `token` | DISCORD_TOKEN at start | Explicit start(token) takes precedence |
| `env` | true | Load working directory .env when constructing Bot |
| `sync` | true | Sync after login and successful watched reload |
| `validate` | true | Locally validate outgoing messages/modals; definitions always validate |
| `prefix` | unset | String/array or async function(message) returning prefixes; enables prefix intents |
| `splitPrefix` | unset | Optional argument splitter `(text, message) => string[]` or async equivalent |
| `mentionPrefix` | true | Recognize bot mentions when prefix configured |
| `owners` | [] | User ID/array; if empty, start discovers application owner/team |
| `ownersBypassCooldown` | true | Owners skip built-in cooldowns |
| `use` | [] | Global middleware or array |
| `plugins` | [] | Feature bundles and resource setup in dependency order |
| `store` | MemoryStore | Async key-value store, closed by stop |
| `devGuild` | unset | Redirect all registration to one guild |
| `intents` | [] | Extra intents added to inferred intents and Guilds |
| `client` | {} | discord.js ClientOptions overrides; Shiver replaces final gateway intents at start |
| `allowedMentions` | `{parse: ['users'], repliedUser: true}` | Message defaults and initial client default; client.allowedMentions overrides client only |
| `autoDefer` | off | true = 2000ms; number in ms/duration string; commands defer reply, other interaction kinds defer update |
| `defaultLocale` | en-US | Translation and prefix locale fallback |
| `locales` | unset | Directory of flat or nested `<locale>.json` string dictionaries |
| `resolveLocale` | unset | `(ctx, fallback) => locale` to use a preference or guild locale |
| `messages` | built-ins below | Partial built-in message overrides, merged by key |
| `logger` | console logger | Object with debug/info/warn/error |
| `logLevel` | LOG_LEVEL or info | debug/info/warn/error/silent; ignored with custom logger |
| `watch` | false | Recursive development watcher on dir; 150ms debounce |
| `catchUnhandled` | true | Add process unhandledRejection logging at start |
| `signals` | true | Stop and exit on SIGINT/SIGTERM |
| `onError` | generic trace reply | `(ctx, error, traceId)` after logging/emitting non-UserError failures |

## Message overrides

Message keys/arguments: `error(traceId)`, `cooldown(unixSeconds)`, `guildOnly`, `dmOnly`, `channelOnly`, `roles`, `busy`, `ownerOnly`, `nsfw`, `userPermissions(list)`, `botPermissions(list)`, `premium`, `expired`, `notYours`, `usage(line)`. Overrides may be strings/functions with those arguments. `expired: null` disables the delayed reply for unmatched component/modal interactions.

```js
import {createBot, defineCommand, JsonStore} from 'shiver-framework';
const bot = createBot({
  env: false, sync: false, prefix: ['!', '?'],
  owners: ['100000000000000001'],
  store: new JsonStore('./data/store.json'),
  autoDefer: '2s', defaultLocale: 'en-US',
  messages: {guildOnly: 'Use this in a server.'},
  onError: (ctx, error, id) => ctx.reply({content: `Report ${id}`, ephemeral: true}),
});
bot.add(defineCommand({name: 'ping', description: 'Ping', run: ctx => ctx.reply('Pong')}));
console.log(bot.summary, bot.intents.toArray());
await bot.stop();
```

## Intents and locales

Shiver always adds Guilds. A `guildMemberAdd` handler implies GuildMembers and a `voiceStateUpdate` handler implies GuildVoiceStates. Prefix adds GuildMessages, DirectMessages, and MessageContent. Enable privileged intents in the portal when needed. DirectMessages adds Channel partial unless `client.partials` is supplied. Use top-level `intents` for extra intents.

`bot.t(locale, key, vars)` and `ctx.t(key, vars)` replace `{name}` placeholders, falling back to defaultLocale then key. A key such as `account.welcome` resolves an exact flat key first, then a nested dictionary entry. Call `bot.loadLocales()` when testing offline. Watch validates the whole replacement before installing it. Watch bypasses entry module caching only. Restart when changing imported helpers.

`defineEvent({name, once?, filter?, run})` accepts a synchronous or async `filter(bot, ...args)`. With `once: true`, the first matching event runs the handler. A false result leaves the listener active.

## Bot API

Public Bot methods: `add(...definitions)`, `use(...middleware)`, `load(dir?, bust?)`, `loadLocales(dir?)`, `commandData()`, `sync({force?, prune?, token?}?)`, `start(token?)`, `stop()`, `invoke(ctx, definition, {path?}?)`, `message(key, ...args)`, `t(locale, key, vars?)`. Inspect `commands`, `owners`, `middleware`, `client`, `store`, `log`, `options`, `summary`, `intents`. Bot events: ready, reload, handled(ctx), error({error, ctx?, id?, event?, task?}).

Use `getCommand(name, type?)` to look up a definition and `handleMessage(message)` to dispatch a prefix message directly. `planSync({prune?, token?}?)` returns proposed operations, and `fetchPermissions(target)` retrieves an effective Discord permission bitfield for a member or role.

## Feature plugins

A plugin can register definitions, share middleware, and own resources. Supply plugins to `createBot({plugins})`. Shiver checks for missing dependencies, duplicates and cycles before starting. Setup runs in dependency order before Gateway login or when calling `prepareREST()`. A setup function can return an async or sync cleanup callback. Cleanup runs in reverse order on shutdown and after a later setup failure.

```js
import { createBot, defineCommand, definePlugin, messageCache } from 'shiver-framework';

const health = definePlugin({
  name: 'health',
  definitions: [
    defineCommand({ name: 'health', description: 'Show health', run: (ctx) => ctx.reply('Ready') }),
  ],
  setup(bot) {
    bot.log.info('Health plugin initialized');
    return () => bot.log.info('Health plugin stopped');
  },
});

const bot = createBot({
  plugins: [health],
  client: messageCache({ maxPerChannel: 50, lifetime: '15m', interval: '1m' }),
});
await bot.stop();
```

`messageCache()` configures discord.js `makeCache` and optional sweepers while keeping its other defaults. Set `maxPerChannel: 0` to disable message caching. Durations accept milliseconds or strings such as `'15m'`. Use the underlying `client` options for other managers and sweepers.
