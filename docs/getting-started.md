Shiver loads exported feature definitions and runs them through one Discord interaction and prefix pipeline.

# Getting started

## Install and scaffold

Use Node 22.12 or later and an ESM project. Once v3 is available on the repository's main branch:

```sh
npm i github:yuwxbt/shiver-framework discord.js@^14.28.0
npx shiver init my-bot
cd my-bot
npm install
npm run check
```

Copy `.env.example` to `.env`, set `DISCORD_TOKEN`, and run `npm start`. Create a bot application in the Discord Developer Portal and install it with `bot` and `applications.commands`. Never commit your token. For registration in one development server, pass `devGuild: 'SERVER_ID'` to `createBot`.

The generated `bot.js` loads `./src`. Put one feature per file, in any folders you prefer. Default exports, named exports, and arrays of definitions work. Modules starting with `_` or `.`, `node_modules`, test/spec modules, declarations, and the running entry file are skipped. All other JS/MJS/CJS/TS/MTS modules are imported; imports can have side effects. Compile TypeScript first when your Node version cannot execute it directly.

## Run one file

For a single-file project, save this as `bot.js` in a package with `"type": "module"`:

```js
import {createBot, defineCommand} from 'shiver-framework';
const bot = createBot({env: false});
bot.add(defineCommand({
  name: 'ping', description: 'Check latency',
  run: ctx => ctx.reply(`Pong: ${ctx.client.ws.ping}ms`),
}));
await bot.start();
```

Set `DISCORD_TOKEN` in your environment before `node bot.js`. `start()` loads definitions/locales, connects, discovers application owners if needed, syncs commands, and starts tasks. `stop()` closes the gateway, stops timers/watchers, and flushes the store.

## Check before connecting

`npx shiver check --dir src --json` validates without logging in. It imports the files, so keep login and other startup side effects in the entry file. The JSON result includes a `warnings` array. A prefix command with slash autocomplete warns that users must type the value manually. Attachments can be supplied as message uploads. Warnings do not change the exit status. In this repository, `npm run check` runs tests and type checks.

Use `npx shiver new command ping` to create `src/commands/ping.js`. The generator also accepts `component`, `modal`, `event`, and `task`, and refuses to overwrite existing files. Run `npx shiver manifest` for a JSON inventory of registration payloads, routes, intents, listeners, and tasks. The CLI manifest loads source definitions. Call `bot.manifest()` to include plugins from your application's configuration.
