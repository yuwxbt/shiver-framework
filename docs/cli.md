Every `shiver` command and flag: create a project, generate feature files, validate offline, inspect registration data, and register commands.

# CLI

The package installs a `shiver` executable. Run it with `npx shiver` inside a project that depends on `shiver-framework`, or through the scripts of the scaffolded `package.json`.

```sh
npx shiver check
```

```text
OK  3 commands, 2 components, 1 modals, 1 events, 0 tasks
    global: counter, feedback, ping
    intents: Guilds
```

| Command | What it does | Needs a token |
| --- | --- | --- |
| [`shiver init [dir]`](#shiver-init) | Creates a new bot project | No |
| [`shiver new <kind> <name>`](#shiver-new) | Creates a feature file | No |
| [`shiver check`](#shiver-check) | Loads and validates every definition | No |
| [`shiver manifest`](#shiver-manifest) | Prints registration data, routes, and intents as JSON | No |
| [`shiver sync`](#shiver-sync) | Registers commands with Discord | Yes |

`check`, `manifest`, and `sync` load the files under `--dir` (default `./src`), the same way the bot does with its `dir` option. They do not run your `bot.js`, so they see neither `createBot` options such as `devGuild` and `prefix`, nor definitions added in code with `bot.add()` or [plugins](plugins.md).

## shiver init

```sh
npx shiver init my-bot
```

Copies the starter project into `my-bot`, creating the folder if needed, and prints the next steps. Without an argument it uses the current folder. The project name in `package.json` is taken from the folder name.

The command refuses to run, with exit code 1, when the target folder already contains a `package.json`.

The starter contains `bot.js`, `.env.example`, `.gitignore`, three example commands, one event, and these scripts:

| Script | Runs |
| --- | --- |
| `npm run dev` | `node --env-file-if-exists=.env --watch-path=./src bot.js` |
| `npm start` | `node --env-file-if-exists=.env bot.js` |
| `npm run check` | `shiver check` |
| `npm run sync` | `shiver sync` |
| `npm test` | `node --test` |

The [tutorial](getting-started.md) walks through it.

## shiver new

```sh
npx shiver new command hello
```

```text
Created /home/you/my-bot/src/commands/hello.js
```

Creates `<dir>/<kind>s/<name>.js` with a minimal working definition:

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({ name: "hello", description: 'Describe this command', run: (ctx) => ctx.reply('Ready') });
```

| Kind | File | Generated definition |
| --- | --- | --- |
| `command` | `src/commands/<name>.js` | A slash command that replies `Ready` |
| `component` | `src/components/<name>.js` | A handler for the custom id `<name>` |
| `modal` | `src/modals/<name>.js` | A handler for the modal id `<name>` |
| `event` | `src/events/<name>.js` | A listener for the event `<name>` |
| `task` | `src/tasks/<name>.js` | A task that runs every minute |

Names are restricted so that they are safe file names:

| Kind | Allowed name |
| --- | --- |
| `event` | A discord.js event name: starts with a lowercase letter, then letters and digits, such as `guildMemberAdd` |
| All others | Starts with a lowercase letter or digit, then lowercase letters, digits, `-`, and `_`. At most 32 characters |

The command never overwrites. If the file exists, it prints `<file> already exists.` and exits with code 1.

## shiver check

```sh
npx shiver check
npx shiver check --dir bot/features --json
```

Imports every file under `--dir`, validates each definition, and checks for duplicates. It does not read `.env`, needs no token, and makes no network request, which makes it suitable for CI and for a pre-commit hook.

On success it prints the counts, the commands in each registration scope, and the gateway intents the definitions require, and exits with code 0. With `--json`:

```json
{
  "ok": true,
  "commands": 3,
  "components": 2,
  "modals": 1,
  "events": 1,
  "tasks": 0,
  "intents": [
    "Guilds"
  ],
  "scopes": [
    {
      "scope": "global",
      "commands": [
        "counter",
        "feedback",
        "ping"
      ]
    }
  ],
  "warnings": []
}
```

On failure it prints every file that failed, with the error code and message for each, and exits with code 1:

```text
1 file(s) failed to load:
  /home/you/my-bot/src/commands/broken.js
    [INVALID_COMMAND] Command "Broken": name "Broken" is invalid. Names are 1-32 characters, lowercase, with no spaces (letters, numbers, "-" and "_").
```

With `--json`, a failure is `{ "ok": false, "code": "LOAD_FAILED", "error": "..." }`.

### Warnings

Warnings do not change the exit code. There is one kind: a command that can run from chat and has an option with `autocomplete`.

```text
WARN  weather: prefix users must type "city" without Discord autocomplete.
```

Because the CLI cannot see whether your bot sets a prefix, it warns for every such command. Set `prefix: false` on the command if it is slash only.

> **Note**
> `check` imports your files, which runs their top-level code. Keep `bot.start()`, database connections, and other side effects in the entry file or in a [plugin](plugins.md#open-and-close-resources).

## shiver manifest

```sh
npx shiver manifest
npx shiver manifest --guild 123456789012345678
```

Prints one JSON document that describes what the definitions under `--dir` amount to. Like `check`, it works offline.

| Key | Content |
| --- | --- |
| `intents` | Gateway intents the definitions require |
| `scopes` | For each registration scope, the exact command JSON that a sync would send |
| `prefixes` | Command names and aliases that would answer in chat |
| `components`, `modals` | Handler routes, as `{ "id": "..." }` or `{ "pattern": "...", "flags": "..." }` for regular expressions |
| `events`, `tasks` | Names of event and task definitions |
| `plugins` | Always empty from the CLI. Call `bot.manifest()` in code to include plugins |

`--guild <id>` shows the output as it would be with that `devGuild`. Use the manifest to review registration changes in a pull request, or to diff two branches.

## shiver sync

```sh
npx shiver sync
```

```text
Synced 4 command(s) to global
```

Registers the commands under `--dir` with Discord. The token is read from the `DISCORD_TOKEN` environment variable. A `.env` file in the working directory is loaded first.

Each command is created or updated in its scope: the servers in its `guilds` field, or `global`. Commands that exist on Discord but not locally are left alone unless you pass `--prune`. The CLI always sends the commands, whether or not they changed.

| Flag | Effect |
| --- | --- |
| `--guild <id>` | Send every command to this one server instead of its normal scope |
| `--prune` | Replace the command list of each selected scope with the local commands, deleting the rest |
| `--dry-run` | Read from Discord and print what would happen. Nothing is written |
| `--json` | Print the result, or the dry-run plan, as JSON |

Preview a prune before running it:

```sh
npx shiver sync --prune --dry-run
```

```text
global
    create: tag (type 1)
    upsert: ping (type 1)
    delete: oldcommand (type 1)
```

| Plan entry | Meaning |
| --- | --- |
| `create` | Local only. Will be created |
| `upsert` | Exists in both. Will be overwritten, even when identical |
| `delete` | Remote only, and `--prune` is set. Will be deleted |
| `keep` | Remote only, and `--prune` is not set. Left alone |

The number after `type` is Discord's command type: 1 slash, 2 user, 3 message, 4 entry point.

> **Warning**
> `--prune` deletes every remote command in the scope that is not defined under `--dir`. That includes commands registered by plugins or `bot.add()`. See [Deployment](deploy.md#remove-commands-you-deleted) before using it.

## Options reference

| Flag | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `--dir <path>` | `new`, `check`, `manifest`, `sync` | `./src` | Folder that holds your definitions |
| `--guild <id>` | `manifest`, `sync` | none | Target one server |
| `--prune` | `sync` | off | Remove remote commands that are missing locally |
| `--dry-run` | `sync` | off | Preview without writing |
| `--json` | `check`, `sync` | off | Machine-readable output |
| `--help`, `-h` | all | | Print the usage summary |

Running `shiver` with no command, or with an unknown one, prints the usage summary.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, or the usage summary was printed |
| `1` | A file failed to load, the token is missing, Discord returned an error, or the arguments to `init` or `new` were rejected |

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `DISCORD_TOKEN is not set. Add it to .env or the environment.` | `sync` found no token | Run it in the folder that holds `.env`, or export the variable |
| `<dir> already has a package.json. Choose an empty directory: shiver init my-bot` | `init` was run in an existing project | Pass a new folder name |
| `Usage: shiver new <command\|component\|modal\|event\|task> <name>.` | An unknown kind, or a name with capitals, spaces, or path separators | Use a simple name such as `user-info` |
| `1 file(s) failed to load:` followed by `ENOENT` | `--dir` points to a folder that does not exist | Pass the right folder |
| `Unknown option '--force'` with a stack trace | A flag the CLI does not have | Use the flags listed above |
| `check` passes, yet the bot fails to start | The failure is in `bot.js`, in a plugin, or at login | Run the bot. `check` covers the files under `--dir` |
| `sync` registered commands globally although the bot uses `devGuild` | The CLI does not read `createBot` options | Pass `--guild <id>` |
