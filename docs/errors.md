How errors reach users and logs, how to show your own error messages, and what every `ShiverError` code means and how to fix it.

# Errors

The framework separates three kinds of failure:

| Kind | Raised by | What the user sees | Logged |
| --- | --- | --- | --- |
| `UserError` | Your code and the built-in guards | The message you wrote, privately | No |
| `ShiverError` | The framework, when it is used incorrectly | Nothing at load time. The generic error message if it happens inside a handler | Yes |
| Any other error | Your handler or a library | The generic error message with a trace ID | Yes |

```js
import { defineCommand, opt, UserError } from 'shiver-framework';

export default defineCommand({
  name: 'withdraw',
  description: 'Withdraw coins',
  options: { amount: opt.integer('Coins to withdraw', { required: true, min: 1 }) },
  run: async (ctx, { amount }) => {
    const balance = (await ctx.store.get(`coins:${ctx.user.id}`)) ?? 0;
    if (amount > balance) throw new UserError(`You only have ${balance} coins.`);
    await ctx.store.set(`coins:${ctx.user.id}`, balance - amount);
    await ctx.reply(`Withdrew ${amount} coins.`);
  },
});
```

## Show a message to the user

Throw `UserError` anywhere in a handler or middleware to stop and tell the user why. The reply is ephemeral for interactions and a normal reply in chat commands. Nothing is logged and no `error` event is emitted, because this is an expected outcome.

`UserError` accepts a string or a full [message payload](messages.md#choose-what-to-send):

```js
import { button, defineCommand, row, UserError } from 'shiver-framework';

export default defineCommand({
  name: 'export',
  description: 'Export your data',
  run: async (ctx) => {
    const linked = await ctx.store.get(`linked:${ctx.user.id}`);
    if (!linked) {
      throw new UserError({
        content: 'Link your account first.',
        components: [row(button({ url: 'https://example.com/link', label: 'Link account' }))],
      });
    }
    await ctx.reply('Your export is on its way.');
  },
});
```

If the handler has already deferred or replied publicly, the message appears in that public reply. See [Reply privately or defer](commands.md#reply-privately-or-defer).

## What happens when a handler throws

For any error that is not a `UserError`, the bot does the following:

1. Creates a six-character trace ID, such as `7DRINX`.
2. Logs the error with the ID: `[7DRINX] command "withdraw" failed`, followed by the stack trace.
3. Emits `error` on the bot with `{ error, ctx, id }`.
4. Calls your [`onError` option](configuration.md#handle-unexpected-errors) if set. Otherwise it replies privately with ``Something went wrong. If it keeps happening, report code `7DRINX`.``

A user who reports the code lets you find the stack trace in your logs.

Failures outside handlers are logged and emitted, and have no user to reply to:

| Source | Log line | `error` event payload |
| --- | --- | --- |
| An [event](events-and-tasks.md) listener | `Event "guildMemberAdd" failed` | `{ error, event }` |
| A [task](events-and-tasks.md#run-a-recurring-task) | `Task "cleanup" failed` | `{ error, task }` |
| An autocomplete function | `Autocomplete for /weather "city" failed` | none. The user gets an empty list |

## Catch a ShiverError

Every error the framework throws is a `ShiverError` with a stable `code` and a message that says what to change:

```js
import { defineCommand, ShiverError } from 'shiver-framework';

try {
  defineCommand({ name: 'Bad Name', description: 'This name is not valid', run() {} });
} catch (error) {
  if (!(error instanceof ShiverError)) throw error;
  console.log(error.code);    // INVALID_COMMAND
  console.log(error.message); // Command "Bad Name": name "Bad Name" is invalid. Names are 1-32 characters, ...
}
```

Most codes are thrown while files load, before the bot connects. Run [`npx shiver check`](cli.md#shiver-check) to surface them without starting the bot. With `--json` it prints `{ "ok": false, "code": "LOAD_FAILED", "error": "..." }` and exits with code 1.

## Error code reference

### Definition errors

Thrown by the `define*` functions when a file is imported.

| Code | Thrown when | Fix |
| --- | --- | --- |
| `INVALID_COMMAND` | A command, subcommand, or option breaks a rule: an invalid name or description, an option that is not built with `opt`, `run` together with `subcommands`, more than two levels of subcommands, more than 25 options or choices, `choices` together with `autocomplete`, bounds on an option kind that has none, or options on a context menu command. Also thrown at run time when `splitPrefix` does not return an array of strings | The message starts with the command and option it refers to, for example `Command "echo" option "text":`. Apply the change it describes. Rules are listed in [Commands](commands.md#limits-checked-when-you-define-a-command) |
| `INVALID_HANDLER` | `defineComponent` or `defineModal` has no string or `RegExp` `id`, has no `run` function, or the fixed part of the id is longer than 100 characters | Provide `id` and `run`, and shorten the id |
| `INVALID_EVENT` | `defineEvent` has no `name`, no `run` function, or a `filter` that is not a function | Provide the missing field |
| `INVALID_TASK` | `defineTask` has no `name`, no `run` function, or `every` is shorter than one second | Provide the field, and use an interval of at least `'1s'` |
| `INVALID_PLUGIN` | A plugin name is not lowercase letters, digits, and dashes. `requires`, `definitions`, `use`, or `setup` has the wrong type. Two plugins share a name, a required plugin is missing, plugins require each other in a cycle, or `setup` returns something other than a function or nothing | Fix the field named in the message. See [Plugins](plugins.md#plugin-reference) |
| `INVALID_DURATION` | A duration is not a non-negative number or a string made of `ms`, `s`, `m`, `h`, `d`, `w` parts. Raised for `cooldown`, `every`, `ttl`, `time`, `autoDefer`, and `messageCache` values | Use milliseconds or a string such as `'5s'`, `'10m'`, or `'1h30m'` |
| `INVALID_GUARD` | `limitConcurrency` gets a limit that is not a positive whole number, or `cooldown` gets such a `uses` value | Pass `1` or more |

### Loading errors

Thrown by `bot.add()`, `bot.load()`, and `bot.start()`.

| Code | Thrown when | Fix |
| --- | --- | --- |
| `INVALID_DEFINITION` | `bot.add()` receives something that no `define*` function created. The test runners throw it when given the wrong kind of definition | Export and pass the return value of `defineCommand`, `defineComponent`, `defineModal`, `defineEvent`, or `defineTask` |
| `DUPLICATE` | Two commands share a name and type, two component or modal handlers share an id or pattern, or there is more than one Activity entry point | Rename or remove one. The message includes the file |
| `LOAD_FAILED` | One or more files under `dir` failed to import or register. The message lists every file with its own error and code | Fix each listed file. Nothing from a failed load is activated, and a watched reload keeps the previous definitions |

### Message and component errors

Thrown when a component is built or a message is sent. Inside a handler they are reported like any other unexpected error.

| Code | Thrown when | Fix |
| --- | --- | --- |
| `INVALID_COMPONENT` | A component function is missing something it needs: a button without `id`, or without `label` and `emoji`, an unknown button style, a select without options, a section without an accessory, a modal without `id` or `title`, a modal input without a label, `mentionableSelect` defaults without a `type`, invalid `fileUpload` types, a numeric id out of range, or `customId` with a missing value or a result over 100 characters | The message quotes the call and names the missing field |
| `INVALID_MESSAGE` | A payload is not a string or plain object, mixes Components V2 with `content`, `embeds`, or `poll`, or exceeds a limit that is checked before sending. Also thrown by `validateModal`, `componentEmbed`, and `ctx.paginate` for invalid input | The message starts with the path of the offending part, such as `components[0].components[5]` or `embeds[1].fields[0]`, and states the limit. See [message limits](messages.md#limits-checked-before-sending) and [component limits](components.md#component-reference) |
| `INVALID_COLOR` | A color is not a number from 0 to 16777215, a three or six digit hex string, or a known color name | Use a value such as `0x5865f2`, `'#5865f2'`, or `'blurple'` |

### Startup errors

| Code | Thrown when | Fix |
| --- | --- | --- |
| `NO_TOKEN` | `start()` or `prepareREST()` finds no token | Put `DISCORD_TOKEN=...` in `.env` or the environment, or pass `token` |
| `DISALLOWED_INTENTS` | Discord rejects the login because a privileged intent the bot requests is not enabled. The message lists which of `GuildMembers`, `GuildPresences`, and `MessageContent` are requested | Enable them under Bot, Privileged Gateway Intents in the Developer Portal, or remove the `prefix` option or event that needs them |
| `ALREADY_STARTED` | `start()` or `prepareREST()` is called while the bot is started, starting, or stopping | Start once. Await `bot.stop()` before starting again |
| `START_CANCELLED` | `stop()` was called while `start()` was still in progress. The pending `start()` rejects with this code | Expected during shutdown. Ignore it or handle it where you call `start()` |
| `INVALID_CACHE` | `messageCache()` gets a negative or fractional `maxPerChannel`, a `lifetime` or `interval` of zero, or an `interval` above 2147483 seconds | Pass valid values. See [Configuration](configuration.md#add-intents-and-client-options) |
| `INVALID_HTTP_CONFIG` | `createInteractionHandler()` gets a `publicKey` that is not 64 hex characters, an `applicationId` that is not an ID, or a non-positive `maxBodyBytes` or `maxAge` | Copy the public key and application ID from the Developer Portal |

### Runtime errors

Thrown inside handlers.

| Code | Thrown when | Fix |
| --- | --- | --- |
| `UNSUPPORTED` | `ctx.showModal()` is called in a chat command or a modal submission, or after a reply or deferral. `ctx.launchActivity()` is called after a response. `ctx.awaitComponent()` is called before any message exists | Open modals first, without `defer`. Reply before waiting for a click, or pass `{ message }` |
| `INVALID_PERMISSION_TARGET` | `bot.fetchPermissions()` does not get exactly one of `guildId` or `channelId` and exactly one of `userId` or `roleId`, an ID is malformed, or `implicit` is used with a server | See [Check permissions yourself](middleware.md#check-permissions-yourself) |

### Testing errors

| Code | Thrown when | Fix |
| --- | --- | --- |
| `NO_MATCH` | `runComponent` or `runModal` gets an `id` that does not match the definition, or no `id` for a `RegExp` route | Pass the custom id a real component would carry |

## Discord errors you will meet

These come from Discord or discord.js, not from the framework.

| Error | Meaning | What to do |
| --- | --- | --- |
| Code `10062`, Unknown interaction | The interaction was not acknowledged within three seconds. The bot logs `Interaction expired before a reply was sent` with the handler name and sends nothing | Add `defer: true` to the definition or enable [`autoDefer`](configuration.md#defer-slow-handlers-automatically) |
| Code `50013`, Missing Permissions | The bot lacks a permission for what the handler tried | Add a `botPermissions` guard so the user gets a clear message instead |
| Code `50001`, Missing Access | The bot cannot see the channel or server | Check the bot's roles and channel overrides |
| Code `50035`, Invalid Form Body | Discord rejected a payload. The local checks cover common limits, not all of them | Read the path in the error and compare with Discord's documentation |
| `TokenInvalid` | The token is wrong or was reset | Copy a fresh token into `DISCORD_TOKEN` |

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Users see ``Something went wrong... report code `XXXXXX`.`` for an expected condition | A plain `Error` was thrown where a `UserError` was meant | Throw `UserError` for anything the user can act on |
| A `UserError` message is visible to everyone | The handler was deferred publicly before the error | Use `defer: 'ephemeral'` |
| Nothing is logged for a failing command | `logLevel` is `'silent'`, or a custom `logger` drops errors | Lower the level, or listen to the bot's `error` event |
| An error tracker receives nothing | Errors are logged and emitted, not rethrown | Forward them from `bot.on('error', ...)` |
| The process exits on `start()` with `LOAD_FAILED` | One file is invalid, so the bot refuses to start with a partial set | Run `npx shiver check` and fix the listed files |
