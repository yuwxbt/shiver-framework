Create a bot project, run it, and add your first command that works as both a slash command and a chat command.

# Getting started

This tutorial takes about ten minutes. You scaffold a project, connect it to Discord, add a `/hello` command, run the same command from chat as `!hello`, and test it without a network connection.

## Before you start

You need:

- Node.js 22.13 or later. Check with `node --version`.
- A Discord account and a server where you are allowed to add bots.

shiver.js is ESM only and runs on discord.js 14.28 or later.

## 1. Create the project

Install the framework, then let its CLI create a project in a new `my-bot` folder:

```sh
npm i github:yuwxbt/shiver-framework discord.js@^14.28.0
npx shiver init my-bot
cd my-bot
npm install
```

`shiver init` prints the path it created and the next steps:

```text
Created /home/you/my-bot

  cd my-bot
  npm install
  copy .env.example to .env and paste your bot token
  npm run dev
```

The project looks like this:

```text
my-bot/
  bot.js                    creates the bot and starts it
  package.json              scripts: dev, start, check, sync, test
  .env.example              template for your token
  src/
    commands/ping.js        /ping
    commands/counter.js     /counter, with two button handlers
    commands/feedback.js    /feedback, with a modal handler
    events/ready.js         runs once when the bot connects
```

Every file under `src/` is loaded automatically. A file exports one or more definitions, and the folder names are only a convention.

## 2. Check the project offline

```sh
npm run check
```

`shiver check` imports every file under `src/`, validates each definition, and prints a summary. It needs no token and makes no network request:

```text
OK  3 commands, 2 components, 1 modals, 1 events, 0 tasks
    global: counter, feedback, ping
    intents: Guilds
```

Run this after every change. When a definition is wrong, the command exits with code 1 and names the file and the fix.

## 3. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
2. Open the **Bot** page and select **Reset Token**. Copy the token. You need it in the next step.
3. Open **OAuth2**, then **URL Generator**. Select the `bot` and `applications.commands` scopes.
4. Open the generated URL and add the bot to your server.

You do not need any privileged intents yet.

## 4. Add your token

Copy the template and paste your token after `DISCORD_TOKEN=`:

```sh
cp .env.example .env
```

```ini
DISCORD_TOKEN=paste-your-token-here
DEV_GUILD=
```

Leave `DEV_GUILD` empty for this tutorial. The framework reads `.env` from the working directory when the bot is created.

> **Warning**
> The token gives full control of your bot. The generated `.gitignore` already excludes `.env`. Never commit it or paste it into chat.

## 5. Start the bot

```sh
npm run dev
```

The bot logs in, registers its commands with Discord, and reports what it loaded:

```text
12:00:01 info  Commands synced: 3 (global)
12:00:01 info  Ready as my-bot#1234: 3 commands, 3 component handlers, 1 event, 0 tasks
```

In your server, try the three commands:

| Command | What you see |
| --- | --- |
| `/ping` | A reply with the gateway latency |
| `/counter` | A card with **+1** and **Reset** buttons that update the card |
| `/feedback` | A modal with a radio group and a text field |

`npm run dev` runs `node --env-file-if-exists=.env --watch-path=./src bot.js`, so the process restarts whenever you save a file under `src/`. Leave it running for the next steps.

If Discord does not list the commands, reload the Discord client with Ctrl+R.

## 6. Add your own command

Generate a command file:

```sh
npx shiver new command hello
```

```text
Created /home/you/my-bot/src/commands/hello.js
```

Replace the contents of `src/commands/hello.js` with:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'hello',
  description: 'Greet someone',
  options: {
    name: opt.string('Who to greet', { required: true }),
  },
  run: (ctx, { name }) => ctx.reply(`Hello, ${name}.`),
});
```

Save the file. The bot restarts and logs `Commands synced: 4 (global)`. In Discord, run `/hello name:Ada`. The bot replies `Hello, Ada.`

The second argument of `run` holds the parsed options. `ctx.reply` sends the response.

## 7. Run the same command from chat

The same definition can also answer chat messages such as `!hello Ada`. Reading message text needs a privileged intent, so enable it first:

1. In the Developer Portal, open your application's **Bot** page.
2. Turn on **Message Content Intent** and save.

Then add a prefix to `bot.js`:

```js
import { createBot, JsonStore } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  prefix: '!',
  devGuild: process.env.DEV_GUILD || undefined,
  store: new JsonStore('./data/store.json'),
});

await bot.start();
```

`bot.js` is outside `src/`, so stop the process with Ctrl+C and run `npm run dev` again. Type `!hello Ada` in a channel the bot can read. It replies `Hello, Ada.`

Type `!hello` without a name. The bot answers with the missing option and a usage line:

```text
`name`: this is required.
Usage: `!hello <name>`
```

> **Note**
> If the bot exits with `DISALLOWED_INTENTS`, the Message Content Intent is still off in the portal. The error message names the intents to enable.

## 8. Test the command without Discord

Create `test/hello.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCommand, runPrefix } from 'shiver-framework/testing';
import hello from '../src/commands/hello.js';

test('hello greets by name as a slash command', async () => {
  const result = await runCommand(hello, { options: { name: 'Ada' } });
  assert.equal(result.text, 'Hello, Ada.');
});

test('hello greets by name as a chat command', async () => {
  const result = await runPrefix(hello, { content: '!hello Ada' });
  assert.equal(result.text, 'Hello, Ada.');
});
```

Run it:

```sh
npm test
```

```text
# tests 2
# pass 2
# fail 0
```

The runners execute your real handler through the same pipeline the bot uses and record every reply. No token or connection is involved.

## What you built

- A project where each file under `src/` exports definitions that load automatically.
- A command defined once that runs from the slash menu and from chat.
- An offline check and a test that run without Discord.

## Where to go next

- [Commands](commands.md): options, choices, autocomplete, subcommands, and context menus.
- [Components and modals](components.md): buttons, selects, layouts, and forms, as used by `/counter` and `/feedback`.
- [Messages](messages.md): embeds, files, private replies, deferring, confirmation prompts, and pagination.
- [Middleware](middleware.md): permissions, cooldowns, and your own checks.
- [Events and tasks](events-and-tasks.md): react to members joining and run recurring jobs.
- [Storage](store.md): keep data between restarts.
- [Testing](testing.md): simulate users, permissions, clicks, and modal submissions.
- [Errors](errors.md): what each error code means and how to fix it.
- [Configuration](configuration.md): every `createBot` option.
- [CLI](cli.md): every `shiver` command and flag.
- [Deployment](deploy.md): run the bot in production.
