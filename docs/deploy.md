Run Shiver under a process supervisor with environment-provided credentials and durable storage when needed.

# Deployment

Validate locally with `npm ci` and `npm run check`. Deploy a Node >=22.12 ESM application and lockfile, install production dependencies, and start the entry file. Keep `watch` off. Supply `DISCORD_TOKEN` through the environment; never bake it into images/source. Grant the permissions/intents your bot uses.

## Register or prune commands

`npx shiver sync` registers or updates local commands in their configured scopes. Use `npx shiver sync --prune` to replace the command list in those scopes, including the global scope. With `--guild <id>`, the operation targets that guild only, even if the local list is empty. An empty list with prune removes all commands in that scope. Run prune only with the complete definition set for the selected application and scopes.

`await bot.sync({ prune: true })` does the same in code. A regular programmatic sync skips scopes whose local payload hash matches the last successful sync in its store. Pass `force: true` to re-register them. Prune always contacts Discord. A guild that no longer appears in definitions can be pruned explicitly with `--guild <id>`.

Use `npx shiver sync --dry-run --prune --guild SERVER_ID` to preview what prune would delete. The preview reads the remote registry and reports `create`, `upsert`, `delete`, and `keep` per scope. Existing names are reported as upserts even if their data is identical. Add `--json` for machine-readable output, or call `await bot.planSync({ prune: true })` from a connected app. Treat the plan as a snapshot and rerun it if the remote configuration changes.

## HTTP interactions

For an app that only handles interactions, call `prepareREST()` instead of starting a Gateway session. It loads definitions and plugins and configures REST. Register commands separately with the CLI or `bot.sync()`. Mount the Fetch-style handler at your Discord Interactions Endpoint URL in a long-running Node process.

```js
import { createBot, createInteractionHandler } from 'shiver-framework';

const bot = createBot({ dir: './src' });
await bot.prepareREST();

export const handleInteraction = createInteractionHandler(bot, {
  publicKey: process.env.DISCORD_PUBLIC_KEY,
  applicationId: process.env.DISCORD_APPLICATION_ID,
});
```

Pass the original request body without parsing or reserializing it. The handler verifies Ed25519 signatures, answers Discord's PING, and returns HTTP 202 for authenticated interaction deliveries. The normal handlers send responses through Discord REST. The default timestamp window is five minutes and the request limit is 1 MiB. The local replay cache is bounded and process-local. Gateway events, prefix commands, and ready-triggered tasks require a Gateway session. Keep the Node process running while REST callbacks and collectors are in flight. Call `bot.stop()` during shutdown. [Discord interaction transport](https://docs.discord.com/developers/interactions/receiving-and-responding)

## PM2

With PM2 installed, save `ecosystem.config.cjs`:

```js
module.exports = {apps: [{name: 'example-app', script: 'bot.js', instances: 1, autorestart: true, kill_timeout: 10000}]};
```

```sh
pm2 start ecosystem.config.cjs
pm2 logs example-app
```

Provide DISCORD_TOKEN through your host environment. One instance prevents duplicate gateways unless using explicit sharding.

## Docker

Save in the bot project:

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY bot.js ./
COPY src ./src
USER node
CMD ["node", "bot.js"]
```

Add `.env`, `node_modules`, and `data` to `.dockerignore`. Pre-create data writable by the node user for a file store; mount it at `/app/data`.

```sh
docker build -t example-app .
docker run --rm --env DISCORD_TOKEN -v shiver-data:/app/data example-app
```

The volume needs suitable ownership. Include locale files/other loaded assets in your image.

## systemd

Install a unit on the target host, adjusting paths/user:

```ini
[Unit]
Description=Example Discord application
After=network-online.target
[Service]
Type=simple
User=shiver
WorkingDirectory=/srv/example-app
EnvironmentFile=/etc/example-app.env
ExecStart=/usr/bin/node /srv/example-app/bot.js
Restart=on-failure
TimeoutStopSec=15
[Install]
WantedBy=multi-user.target
```

The environment file contains DISCORD_TOKEN and should be readable only by the service administrator. Start with `systemctl enable --now example-app` after installing. Default SIGTERM handling flushes the store through `bot.stop()`.

## Sharding

Sharding is done via discord.js `ShardingManager`. Shiver has no separate sharding system. Save this 10-line `shard.js` beside `bot.js` and run `node shard.js`:

```js
import {ShardingManager} from 'discord.js';
import {fileURLToPath} from 'node:url';
const manager = new ShardingManager(
  fileURLToPath(new URL('./bot.js', import.meta.url)),
  {token: process.env.DISCORD_TOKEN, totalShards: 'auto'},
);
manager.on('shardCreate', shard => {
  console.log(`Started shard ${shard.id}`);
});
await manager.spawn();
```

Set `sync: false` in workers and sync commands once during deployment. MemoryStore, cooldowns, collectors, and tasks are process-local; tasks run on every worker unless restricted explicitly. Use a shared custom store for shared state and avoid multiple JsonStore writers. Client options can carry shard settings for custom orchestration.
