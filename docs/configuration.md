Every option `createBot` accepts, with defaults, plus built-in messages, translations, logging, and the `Bot` API.

# Configuration

`createBot(options)` returns a `Bot`. It wires a discord.js `Client`, a store, a logger, and the handler pipeline. Every option is optional.

```js
import { createBot } from 'shiver-framework';

const bot = createBot({ dir: './src' });

await bot.start();
```

`start()` loads the definitions in `dir`, logs in with `DISCORD_TOKEN`, registers the commands, and resolves when the bot is ready. The complete list of options is in the [options reference](#options-reference).

## Provide the token

`start()` looks for the token in this order:

1. The argument: `bot.start(token)`.
2. The `token` option.
3. The `DISCORD_TOKEN` environment variable.

When `createBot` runs, it loads a `.env` file from the working directory with Node's `process.loadEnvFile`. Variables that are already set in the environment keep their value. Pass `env: false` to skip the file.

> **Note**
> `.env` is loaded inside `createBot`. An expression such as `process.env.DEV_GUILD` written in the options object is evaluated before that, so it only sees variables from the real environment. To use `.env` values in your options, start Node with `node --env-file-if-exists=.env bot.js`, as the starter project's `dev` and `start` scripts do, or call `process.loadEnvFile()` on the line before `createBot`.

## Load definitions from a folder

`dir` is a path or an array of paths. Relative paths resolve from the working directory. The loader imports every `.js`, `.mjs`, `.cjs`, `.ts`, and `.mts` file below it, recursively, and registers every exported value created by a `define*` function. Default exports, named exports, and exported arrays all work.

The loader skips:

- Files and folders whose name starts with `_` or `.`
- `node_modules`
- Files with `.test.` or `.spec.` in the name, and `.d.ts` declaration files
- The entry file of the running process

Use the skipped names for helpers that should not be imported as features, for example `src/_lib/format.js`. Importing a file runs its top-level code, so keep `bot.start()` and other side effects in the entry file.

Without `dir`, register definitions yourself:

```js
import { createBot, defineCommand } from 'shiver-framework';

const bot = createBot();

bot.add(defineCommand({
  name: 'ping',
  description: 'Check that the bot is alive',
  run: (ctx) => ctx.reply('Pong'),
}));

await bot.start();
```

`bot.add()` accepts definitions and arrays of definitions, and you can combine it with `dir`.

To inspect a folder without registering anything, call `loadDefinitions(dir)`. It resolves with `{ definitions, errors }`, where each error names the file that failed.

## Enable prefix commands

Set `prefix` to let users run slash command definitions from chat:

```js
import { createBot } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  prefix: ['!', '?'],
});

await bot.start();
```

`prefix` is a string, an array of strings, or a function that receives the message and returns either. The function may be async, which lets you read a per-server prefix from the store:

```js
import { createBot } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  prefix: async (message) => (await bot.store.get(`prefix:${message.guildId}`)) ?? '!',
});

await bot.start();
```

With a prefix configured, a mention of the bot also works as a prefix (`@my-bot ping`). Set `mentionPrefix: false` to turn that off, or `prefix: []` to accept mentions only.

> **Warning**
> Setting `prefix` adds the `GuildMessages`, `DirectMessages`, and privileged `MessageContent` intents. Enable **Message Content Intent** on the Bot page of the Developer Portal, or login fails with `DISALLOWED_INTENTS`.

How arguments are parsed is covered in [Commands](commands.md#run-a-command-from-chat).

## Register commands in one server while developing

`devGuild` sends every command to a single server instead of its normal scope:

```js
import { createBot } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  devGuild: '123456789012345678',
});

await bot.start();
```

While `devGuild` is set, `guilds` on individual commands is ignored and Activity entry points are not registered. Remove the option before you deploy.

Registration runs on every start because `sync` defaults to `true`. The bot stores a hash of each scope's commands in the [store](store.md) and skips scopes that have not changed. Set `sync: false` to register only from the [CLI](cli.md#shiver-sync) or your own call to `bot.sync()`.

## Add intents and client options

The bot always requests `Guilds` and adds intents for the features it sees:

| You use | Intents added |
| --- | --- |
| The `prefix` option | `GuildMessages`, `DirectMessages`, `MessageContent` |
| An event definition | The intent for that event, as listed in [Events and tasks](events-and-tasks.md#intents-added-for-each-event) |

Add anything else with `intents`. Other discord.js `ClientOptions` go in `client`:

```js
import { GatewayIntentBits, Partials } from 'discord.js';
import { createBot, messageCache } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  intents: [GatewayIntentBits.GuildVoiceStates],
  client: {
    partials: [Partials.Channel, Partials.Message],
    ...messageCache({ maxPerChannel: 50, lifetime: '15m' }),
  },
});

await bot.start();
```

The final intents are computed at `start()` and replace any `intents` inside `client`. When `DirectMessages` is requested and you do not set `client.partials`, the bot sets `partials: [Partials.Channel]` so that direct messages arrive.

`messageCache({ maxPerChannel, lifetime, interval })` returns `makeCache` and `sweepers` settings for `client`:

| Field | Default | Meaning |
| --- | --- | --- |
| `maxPerChannel` | `50` | Messages kept per channel. `0` disables the message cache |
| `lifetime` | none | Age after which cached messages are swept. Without it no sweeper is added |
| `interval` | `'1m'` | How often the sweeper runs |

## Set the bot owners

`owners` is a user ID or an array of user IDs. They pass the `ownerOnly` guard and, unless `ownersBypassCooldown` is `false`, skip cooldowns.

When `owners` is empty, `start()` fetches the application and uses its owner, or every member of its team.

## Defer slow handlers automatically

Discord closes an interaction that gets no response within three seconds. `autoDefer` acknowledges for you when a handler is still running after a delay:

```js
import { createBot } from 'shiver-framework';

const bot = createBot({ dir: './src', autoDefer: true });

await bot.start();
```

| Value | Delay |
| --- | --- |
| `true` | 2000 ms |
| A number | That many milliseconds |
| A string such as `'1500ms'` or `'2s'` | That duration |

Commands get a deferred reply. Components and modals get a deferred update. A definition with its own `defer` setting is not affected, and `defer: false` on a definition opts it out, which you need for handlers that open a modal. See [Messages](messages.md#take-longer-than-three-seconds).

## Change the built-in messages

The bot sends a short message when a guard rejects a user or a handler fails. Override any of them with `messages`. Your keys are merged over the defaults.

```js
import { createBot } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  messages: {
    guildOnly: 'Use this command in a server.',
    cooldown: (unix) => `Slow down. Try again <t:${unix}:R>.`,
    expired: null,
  },
});

await bot.start();
```

| Key | Arguments | Default text | Sent when |
| --- | --- | --- | --- |
| `error` | trace ID | ``Something went wrong. If it keeps happening, report code `ID`.`` | A handler throws an unexpected error |
| `cooldown` | Unix seconds when the cooldown ends | `You're doing that too often. Try again <t:UNIX:R>.` | A cooldown is active |
| `guildOnly` | none | `This only works in a server.` | `guildOnly`, `roles`, or `permissions` is used in a DM |
| `dmOnly` | none | `This only works in direct messages.` | `dmOnly` is used in a server |
| `channelOnly` | none | `This does not work in this channel type.` | `channelTypes` does not match |
| `roles` | none | `You need the required roles to use this.` | A role from `roles` is missing |
| `busy` | none | `This action is already running. Try again in a moment.` | `limitConcurrency` is at its limit |
| `ownerOnly` | none | `Only the bot owner can use this.` | `ownerOnly` rejects the user |
| `nsfw` | none | `This only works in age-restricted channels.` | `nsfw` is used in a normal server channel |
| `userPermissions` | comma-separated permission names | `You need these permissions: LIST.` | The user lacks `permissions` |
| `botPermissions` | comma-separated permission names | `I need these permissions here: LIST.` | The bot lacks `botPermissions` |
| `premium` | none | `This needs an active subscription.` | `entitlement` is missing |
| `expired` | none | `This has expired. Run the command again.` | A button, select, or modal has no handler |
| `notYours` | none | `Only the person who ran the command can use this.` | Another user clicks a component that `ctx.awaitComponent`, `ctx.confirm`, or `ctx.paginate` is waiting on |
| `usage` | usage line | ``Usage: `LINE` `` | A prefix command is missing or has invalid arguments |

A value is a string or a function that receives the listed arguments. `expired: null` disables the reply for unhandled components. Read a message yourself with `bot.message(key, ...args)`.

## Handle unexpected errors

When a handler throws anything other than a `UserError`, the bot logs the error with a six-character trace ID, emits `error` on the bot, and replies privately with the `error` message. Replace that reply with `onError`:

```js
import { createBot } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  onError: (ctx, error, traceId) => ctx.reply({
    content: `That failed. Reference: ${traceId}`,
    ephemeral: true,
  }),
});

bot.on('error', ({ error, ctx, id, event, task }) => {
  // Forward to your error tracker here.
});

await bot.start();
```

The `error` event carries `ctx` and `id` for handler failures, `event` for a failed event listener, and `task` for a failed task. See [Errors](errors.md#what-happens-when-a-handler-throws).

## Translate replies

Point `locales` at a folder of JSON files named after Discord locales:

```text
locales/
  en-US.json
  fr.json
```

```json
{
  "greeting": "Hello, {name}.",
  "account": { "welcome": "Welcome back, {name}." }
}
```

```js
import { createBot, defineCommand } from 'shiver-framework';

const bot = createBot({ locales: './locales', defaultLocale: 'en-US' });

bot.add(defineCommand({
  name: 'hi',
  description: 'Say hello',
  run: (ctx) => ctx.reply(ctx.t('greeting', { name: ctx.user.username })),
}));

await bot.start();
```

`ctx.t(key, vars)` looks up the key in the user's locale, then in `defaultLocale`, and returns the key itself when neither has it. A dotted key such as `account.welcome` matches a flat key with that exact name first, then a nested object. `{name}` placeholders are replaced from `vars`, and unknown placeholders are left as written.

The locale of a context is the interaction locale, then the server's preferred locale, then `defaultLocale`. To choose it yourself, for example from a saved user preference, provide `resolveLocale`. It must return synchronously, so read the preference into `ctx.state` in a [middleware](middleware.md) first:

```js
import { createBot } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  locales: './locales',
  use: async (ctx, next) => {
    ctx.state.locale = await ctx.store.get(`locale:${ctx.user.id}`);
    return next();
  },
  resolveLocale: (ctx, fallback) => ctx.state.locale ?? fallback,
});

await bot.start();
```

Locale files are read during `start()`. In a test or script that does not start the bot, call `await bot.loadLocales()` first. Outside a handler, use `bot.t(locale, key, vars)`.

To translate command names and descriptions in Discord's own UI, use `nameLocalizations` and `descriptionLocalizations` on the [command](commands.md#control-where-a-command-appears).

## Control logging

The default logger writes lines such as `12:00:01 info  Ready as my-bot#1234` to the console.

| Setting | Effect |
| --- | --- |
| `logLevel: 'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` | Lowest level that is printed. Default `info` |
| `LOG_LEVEL` environment variable | Used when `logLevel` is not set |
| `logger` | An object with `debug`, `info`, `warn`, and `error` methods that replaces the console logger. `logLevel` is then ignored |

The logger is available as `bot.log` and `ctx.log`. `createLogger(level)` returns the built-in logger for use elsewhere.

## Reload on file changes

`watch: true` watches `dir` after the bot is ready. When a file changes, the bot re-imports every definition file, re-registers commands if `sync` is on, logs `Reloaded`, and emits `reload`.

- A reload that fails validation logs the error and keeps the previous definitions active.
- Only the definition files are re-imported. Modules they import are cached by Node, so restart after changing a shared helper.

The scaffolded project uses `node --env-file-if-exists=.env --watch-path=./src bot.js` instead, which restarts the whole process. Use one or the other, and keep `watch` off in production.

## Shut down cleanly

`bot.stop()` cancels a start in progress, runs plugin cleanup, destroys the client, stops tasks and the watcher, and closes the store.

By default the bot calls `stop()` on `SIGINT` and `SIGTERM` and then exits. It also logs unhandled promise rejections instead of letting them crash the process. Turn these off with `signals: false` and `catchUnhandled: false` when your own code handles them.

## Options reference

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `dir` | `string \| string[]` | none | Folders to load definitions from |
| `token` | `string` | `DISCORD_TOKEN` | Bot token used by `start()` and `prepareREST()` |
| `env` | `boolean` | `true` | Load `.env` from the working directory when the bot is created |
| `sync` | `boolean` | `true` | Register commands after login and after each watched reload |
| `devGuild` | `string` | none | Register every command in this server only |
| `prefix` | `string \| string[] \| (message) => string \| string[]` | none | Enables prefix commands. The function may be async |
| `mentionPrefix` | `boolean` | `true` | Accept a mention of the bot as a prefix when `prefix` is set |
| `splitPrefix` | `(text, message) => string[]` | none | Replaces the argument tokenizer for prefix commands. May be async |
| `intents` | discord.js intents | `[]` | Extra gateway intents |
| `client` | discord.js `ClientOptions` | `{}` | Passed to the `Client` constructor |
| `allowedMentions` | discord.js `MessageMentionOptions` | `{ parse: ['users'], repliedUser: true }` | Default for the client and for every message that does not set its own |
| `store` | `Store` | `new MemoryStore()` | Key-value store, available as `bot.store` and `ctx.store` |
| `owners` | `string \| string[]` | application owner or team | User IDs that pass `ownerOnly` |
| `ownersBypassCooldown` | `boolean` | `true` | Owners skip cooldowns |
| `use` | `Middleware \| Middleware[]` | `[]` | Global middleware |
| `plugins` | `Plugin[]` | `[]` | Feature bundles. See [Plugins](plugins.md) |
| `validate` | `boolean` | `true` | Check outgoing messages and modals against Discord's limits before sending |
| `autoDefer` | `boolean \| number \| string` | off | Acknowledge interactions that are still running after a delay |
| `messages` | `Record<string, string \| function \| null>` | built-in texts | Overrides for built-in messages |
| `onError` | `(ctx, error, traceId) => unknown` | sends the `error` message | Called after an unexpected handler error is logged |
| `locales` | `string` | none | Folder of `<locale>.json` translation files |
| `defaultLocale` | `string` | `'en-US'` | Fallback locale |
| `resolveLocale` | `(ctx, fallback) => string \| undefined` | none | Chooses the locale of a context |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` | `LOG_LEVEL` or `'info'` | Lowest level the built-in logger prints |
| `logger` | `{ debug, info, warn, error }` | console logger | Replaces the built-in logger |
| `watch` | `boolean` | `false` | Reload definitions when files in `dir` change |
| `signals` | `boolean` | `true` | Stop and exit on `SIGINT` and `SIGTERM` |
| `catchUnhandled` | `boolean` | `true` | Log unhandled promise rejections while the bot runs |

Durations are a number of milliseconds or a string such as `'500ms'`, `'5s'`, `'10m'`, `'1h30m'`, `'2d'`, or `'1w'`.

## Bot reference

### Properties

| Property | Type | Meaning |
| --- | --- | --- |
| `client` | discord.js `Client` | The underlying client |
| `store` | `Store` | The configured store |
| `log` | logger | The configured logger |
| `options` | object | The resolved options |
| `commands` | `Map<string, definition>` | Loaded commands by name |
| `owners` | `Set<string>` | Owner user IDs |
| `middleware` | `Middleware[]` | Global middleware, in order |
| `plugins` | `string[]` | Plugin names in setup order |
| `summary` | object | Counts: `{ commands, components, modals, events, tasks }` |
| `intents` | `IntentsBitField` | Intents the bot requests with the current definitions |

### Methods

| Method | Returns | What it does |
| --- | --- | --- |
| `add(...definitions)` | `this` | Registers definitions or arrays of definitions |
| `use(...middleware)` | `this` | Appends global middleware |
| `load(dir?)` | `Promise<this>` | Loads the folders in `dir`, replacing previously loaded files. Throws `LOAD_FAILED` and keeps the old set when any file fails |
| `loadLocales(dir?)` | `Promise<void>` | Reads translation files |
| `start(token?)` | `Promise<this>` | Loads, logs in, syncs commands, starts tasks |
| `prepareREST(token?)` | `Promise<this>` | Loads definitions and plugins without a gateway connection. See [Deployment](deploy.md#serve-interactions-over-http) |
| `stop()` | `Promise<void>` | Disconnects and closes the store |
| `sync({ force?, prune?, token? })` | `Promise<{ scope, count, changed }[]>` | Registers commands. See [Deployment](deploy.md#register-commands) |
| `planSync({ prune?, token? })` | `Promise<{ scope, create, upsert, delete, keep }[]>` | Compares local commands with Discord without writing |
| `commandData()` | `Map<string, object[]>` | Registration JSON by scope (`'global'` or a server ID) |
| `manifest()` | object | Intents, scopes, prefix names, routes, events, tasks, and plugins |
| `getCommand(name, type?)` | definition or `undefined` | Looks up a command. `type` is `'slash'` (default), `'user'`, `'message'`, or `'entryPoint'` |
| `fetchPermissions(target)` | `Promise<PermissionsBitField>` | Asks Discord for effective permissions. See [Middleware](middleware.md#check-permissions-yourself) |
| `handleMessage(message)` | `Promise<Context \| undefined>` | Runs a message through the prefix parser |
| `invoke(ctx, definition, { path? })` | `Promise<void>` | Runs a definition through the middleware pipeline |
| `message(key, ...args)` | `string` | Returns a built-in message |
| `t(locale, key, vars?)` | `string` | Translates a key |

### Events

`Bot` is a Node `EventEmitter`.

| Event | Argument | Emitted when |
| --- | --- | --- |
| `ready` | the bot | `start()` has finished |
| `reload` | the bot | A watched reload succeeded |
| `handled` | `ctx` | A command, component, or modal handler finished without throwing |
| `error` | `{ error, ctx?, id?, event?, task? }` | A handler, event listener, or task threw |

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `NO_TOKEN`: `No bot token. Put DISCORD_TOKEN=... in a .env file, or pass { token } to createBot().` | No token in the argument, the option, or the environment | Create `.env` in the directory you start Node from, or pass `token` |
| `DISALLOWED_INTENTS`: `Discord rejected the login: privileged intents are not enabled.` | `prefix` or an event needs `MessageContent`, `GuildMembers`, or `GuildPresences` | Enable the intents named in the message on the portal's Bot page |
| `LOAD_FAILED`: `N file(s) failed to load:` | A file under `dir` threw on import or exports an invalid or duplicate definition | Fix each file listed in the message. Run `npx shiver check` to see the list without starting |
| `ALREADY_STARTED`: `The bot already has a session or is shutting down.` | `start()` or `prepareREST()` was called twice | Call it once, or `await bot.stop()` first |
| `INVALID_CACHE`: `messageCache() needs a nonnegative integer maxPerChannel.` | A negative or fractional `maxPerChannel` | Pass `0` or a positive integer |
| `devGuild` from `.env` is ignored | `process.env` was read before `.env` loaded | Start with `node --env-file=.env bot.js` |
| A helper file is reported as failing to load | The loader imports every file under `dir` | Move it to a folder or file name that starts with `_` |
