ShiverError codes identify developer mistakes, while UserError shows a controlled message to the invoking user.

# Errors

## Error codes

Every ShiverError code present under `src/`:

| Code | What to change |
| --- | --- |
| `INVALID_COMMAND` | Correct lowercase names/descriptions and opt builders; obey option/choice/child limits; use run or subcommands, at most one group; context menus need run without options |
| `INVALID_HANDLER` | Supply id pattern/run; shorten fixed id text to 100 characters |
| `INVALID_EVENT` | Supply event name and run(bot, ...args) |
| `INVALID_TASK` | Supply name/run and every of at least one second |
| `INVALID_COMPONENT` | Fix helper id/label/options/accessory/title as named, fill customId placeholders, shorten generated id |
| `INVALID_MESSAGE` | Correct reported payload path/limit; modal validation uses this too; keep V2 separate from content/embeds/poll; paginate needs nonempty pages |
| `INVALID_DEFINITION` | Use define* results with bot.add/runCommand; do not forge kinds |
| `DUPLICATE` | Rename duplicate command or exact component/modal handler id |
| `LOAD_FAILED` | Fix every listed file/import/duplicate; underlying failures are aggregated |
| `INVALID_DURATION` | Use nonnegative finite milliseconds or 5s, 10m, 1h30m |
| `INVALID_COLOR` | Use integer color, three/six-digit hex, or supported name |
| `INVALID_GUARD` | Supply a positive integer for a concurrency limit or cooldown uses |
| `INVALID_PERMISSION_TARGET` | Supply one guild or channel ID and one user or role ID; implicit masking is a channel option |
| `INVALID_PLUGIN` | Fix plugin metadata, required plugins, or dependency cycles |
| `INVALID_CACHE` | Supply a nonnegative message cap and positive sweep durations |
| `INVALID_HTTP_CONFIG` | Supply the application's hex public key and valid request limits |
| `UNSUPPORTED` | Open modal before acknowledgement from supported interaction; reply before awaitComponent or pass message |
| `NO_MATCH` | Supply testing id matching the handler pattern |
| `ALREADY_STARTED` | Do not call start twice without stopping |
| `START_CANCELLED` | Startup was cancelled by `stop()` |
| `NO_TOKEN` | Configure DISCORD_TOKEN or pass token to start/createBot |
| `DISALLOWED_INTENTS` | Enable the named privileged intents in the application portal, or remove features requesting them |

## Handle a controlled rejection

```js
import {defineCommand, ShiverError, UserError} from 'shiver-framework';
import {runCommand} from 'shiver-framework/testing';
try {
  defineCommand({name: 'Bad Name', description: 'Bad', run() {}});
} catch (error) {
  if (error instanceof ShiverError) console.log(error.code, error.message);
  else throw error;
}
const denied = defineCommand({name: 'denied', description: 'Deny', run() {throw new UserError('This feature is closed.');}});
console.log((await runCommand(denied)).text);
```

UserError accepts text/message objects, bypasses ordinary logging, and replies privately on interactions. Other handler failures log a trace ID, emit error on Bot, then invoke onError(ctx, error, id) or send a generic private trace reply. Event/task failures log and emit without a reply context. Discord code 10062 means an expired interaction: reply/defer within three seconds or configure defer/autoDefer. It is not a ShiverError code.

CLI `check --json` returns `{ok: false, code, error}` and exits nonzero for load failures. Definitions validate immediately even when outgoing validation is disabled. Local checks cover common limits, not every Discord rule; retain API error logging.
