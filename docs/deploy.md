Register commands, run the bot as a long-lived service with systemd, PM2, or Docker, serve interactions over HTTP, and shard.

# Deployment

A shiver.js bot is a Node process that holds a gateway connection. Deploying it means starting `node bot.js` on a machine that stays on, with the token in the environment.

```sh
npm ci --omit=dev
DISCORD_TOKEN=your-token node bot.js
```

## Check before you deploy

Run these on your machine or in CI. Neither needs a token.

```sh
npx shiver check
npm test
```

Then confirm:

| Item | Why |
| --- | --- |
| Node 22.13 or later on the server | The framework's minimum version |
| `DISCORD_TOKEN` comes from the environment or a secret store | A token in the repository or image is compromised |
| Privileged intents are enabled in the Developer Portal | Login fails with `DISALLOWED_INTENTS` otherwise |
| `devGuild` and `watch` are not set | Both are development aids |
| The store path is on a disk that survives restarts | See [Storage](store.md#keep-data-across-restarts) |
| Exactly one process runs per token | Two processes both answer every interaction. To scale, [shard](#shard-a-large-bot) |

## Register commands

Discord must know your commands before users can run them. There are two ways to tell it.

**On start.** With the default `sync: true`, `bot.start()` registers after login. It creates or updates each command and leaves everything else in place. A hash of each scope is kept in the [store](store.md), and a scope that has not changed since the last successful sync is skipped. This is enough for most bots.

**From the CLI.** Run the registration as a deploy step and start the bot with `sync: false`. Sharded bots should do this, so that every shard does not register on its own.

```sh
npx shiver sync
```

```text
Synced 4 command(s) to global
```

The CLI reads `DISCORD_TOKEN` from the environment or `.env`. It only sees definitions in files under `--dir`. Commands added in code with `bot.add()` or by [plugins](plugins.md) are unknown to it. For those, call `bot.sync()` from your own script.

A scope is either `global` or one server ID. A command lands in the servers listed in its `guilds` field, or globally when it has none.

### Remove commands you deleted

A normal sync never deletes. A command you removed from the code stays registered until you prune:

```sh
npx shiver sync --prune --dry-run
```

```text
global
    create: tag (type 1)
    upsert: ping (type 1)
    upsert: echo (type 1)
    delete: oldcommand (type 1)
```

`--dry-run` only reads from Discord. Its output groups commands by `create`, `upsert` (already registered, will be overwritten), `delete`, and `keep` (registered remotely and left alone because `--prune` is off). When the plan looks right, run it without `--dry-run`.

> **Warning**
> `--prune` replaces the complete command list of each scope with your local definitions. Run it with the full set of definitions for the application. Commands that the CLI cannot see, such as plugin commands, are deleted.

Pruning touches the global scope and the servers named by your current definitions. A server that no definition mentions anymore is not visited.

`--guild SERVER_ID` redirects every local command to that one server, the same way the `devGuild` option does. To remove all commands from a server, for example leftovers from development, prune it against an empty folder:

```sh
mkdir empty
npx shiver sync --prune --guild SERVER_ID --dir empty
```

### Sync from code

```js
import { createBot } from 'shiver-framework';

const bot = createBot({ dir: './src', sync: false });

await bot.start();

const results = await bot.sync({ prune: true });
for (const { scope, count, changed } of results) {
  bot.log.info(`${scope}: ${count} commands, ${changed ? 'updated' : 'unchanged'}`);
}
```

| Option | Effect |
| --- | --- |
| `force: true` | Register even when the stored hash says nothing changed |
| `prune: true` | Replace each scope with the local commands. Implies a write |
| `token` | Use this token instead of the logged-in client's |

`bot.planSync({ prune })` returns the dry-run plan as data.

## Run as a service

Use a supervisor that restarts the process when it exits and stops it with `SIGTERM`. On `SIGTERM` and `SIGINT` the bot disconnects, runs plugin cleanup, and closes the store before exiting.

### systemd

Save as `/etc/systemd/system/my-bot.service` and adjust the paths and user:

```ini
[Unit]
Description=my-bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bot
WorkingDirectory=/srv/my-bot
EnvironmentFile=/etc/my-bot.env
ExecStart=/usr/bin/node bot.js
Restart=on-failure
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

Put `DISCORD_TOKEN=...` in `/etc/my-bot.env`, readable only by root, then start the service:

```sh
sudo systemctl enable --now my-bot
journalctl -u my-bot -f
```

### PM2

Save as `ecosystem.config.cjs`:

```js
module.exports = {
  apps: [{
    name: 'my-bot',
    script: 'bot.js',
    instances: 1,
    autorestart: true,
    kill_timeout: 10000,
  }],
};
```

```sh
pm2 start ecosystem.config.cjs
pm2 logs my-bot
```

Keep `instances` at 1. PM2's cluster mode would start several copies of the same bot.

### Docker

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY bot.js ./
COPY src ./src
RUN mkdir -p data && chown node:node data
USER node
CMD ["node", "bot.js"]
```

Add `.env`, `node_modules`, and `data` to `.dockerignore`. Copy any other folders the bot reads, such as `locales`. Pass the token at run time and mount a volume for the store:

```sh
docker build -t my-bot .
docker run -d --restart unless-stopped -e DISCORD_TOKEN -v my-bot-data:/app/data my-bot
```

`-e DISCORD_TOKEN` forwards the variable from your shell without writing it into the image.

## Serve interactions over HTTP

Discord can deliver interactions to an HTTPS endpoint instead of the gateway. `createInteractionHandler` verifies each request and feeds it into the same handlers. Call `bot.prepareREST()` instead of `bot.start()`. It loads definitions, locales, and plugins without opening a gateway connection.

```js
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createBot, createInteractionHandler } from 'shiver-framework';

const bot = createBot({ dir: './src', sync: false });
await bot.prepareREST();

const handle = createInteractionHandler(bot, {
  publicKey: process.env.DISCORD_PUBLIC_KEY,
  applicationId: process.env.DISCORD_APPLICATION_ID,
});

createServer(async (req, res) => {
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
    duplex: 'half',
  });
  const response = await handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(3000);
```

The handler takes a Fetch `Request` and returns a `Response`, so frameworks that already use those types can call it directly. Give it the raw body. A body that was parsed and serialized again fails signature verification.

Copy the public key and application ID from the General Information page of the Developer Portal, put the server behind HTTPS, and enter its URL as the Interactions Endpoint URL. Register commands with `npx shiver sync`.

| Option | Default | Meaning |
| --- | --- | --- |
| `publicKey` | required | The application's public key, 64 hex characters |
| `applicationId` | none | When set, requests for any other application are rejected |
| `maxBodyBytes` | `1048576` | Largest accepted request body |
| `maxAge` | `300000` | Largest accepted difference, in milliseconds, between the request timestamp and now |

| Response | When |
| --- | --- |
| `200` with `{"type":1}` | Discord's verification ping |
| `202`, empty | The interaction was accepted. Your handler replies through Discord's REST API, as it does with the gateway |
| `400` | The body is not a valid interaction |
| `401` | The signature is missing or wrong, the timestamp is too old, or the application ID does not match |
| `405` | The method is not `POST` |
| `413` | The body is larger than `maxBodyBytes` |

A repeated delivery of the same interaction ID is acknowledged with `202` and not run again.

What changes without a gateway connection:

- [Events and tasks](events-and-tasks.md) do not run, and neither do chat commands.
- Bot owners are not looked up automatically. Set the [`owners` option](configuration.md#set-the-bot-owners) if you use `ownerOnly`.
- The discord.js cache is empty, so `ctx.guild` and `ctx.channel` can be `null`. `ctx.guildId`, `ctx.channelId`, `ctx.member`, `ctx.memberPermissions`, and `ctx.appPermissions` come from the interaction itself and still work.

Inline waits such as `ctx.awaitComponent` and `ctx.confirm` keep working, because the clicks arrive through the same endpoint. They live in the memory of one process, so the process must keep running while handlers reply and wait. This suits a long-lived server, not a function that is frozen after each response. Call `await bot.stop()` on shutdown.

## Shard a large bot

Discord requires sharding from 2,500 servers. The framework adds nothing of its own here: use the discord.js `ShardingManager` with your `bot.js` as the shard file.

```js
import { fileURLToPath } from 'node:url';
import { ShardingManager } from 'discord.js';

const manager = new ShardingManager(fileURLToPath(new URL('./bot.js', import.meta.url)), {
  token: process.env.DISCORD_TOKEN,
  totalShards: 'auto',
});

manager.on('shardCreate', (shard) => console.log(`Started shard ${shard.id}`));

await manager.spawn();
```

Save it as `shard.js` and run `node shard.js` instead of `node bot.js`. Each shard is a separate process, which has consequences:

| Area | With several shards |
| --- | --- |
| Command registration | Set `sync: false` in `bot.js` and run `npx shiver sync` once per deploy |
| Tasks | Every shard runs every task. Check `bot.client.shard.ids` inside the task if it must run once |
| Cooldowns and concurrency limits | Counted per shard |
| `MemoryStore` | Separate per shard |
| `JsonStore` | Not safe to share. Use a [custom store](store.md#write-a-custom-store) on a shared database |

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `NO_TOKEN` on the server | `.env` is not deployed, which is correct | Set `DISCORD_TOKEN` in the service's environment |
| `DISALLOWED_INTENTS` after deploying to a second application | Privileged intents are enabled per application | Enable them for the production application too |
| A deleted command still appears in Discord | Sync does not delete | `npx shiver sync --prune`, after checking with `--dry-run` |
| Commands appear twice | The same command is registered globally and in a server, usually from an earlier `devGuild` | Clear the server: `npx shiver sync --prune --guild SERVER_ID --dir empty`, where `empty` is an empty folder |
| Every interaction is answered twice | Two processes run with one token | Stop one, or shard |
| Data disappears on redeploy | The store file is inside the container or release folder | Mount a volume, or store it outside the release |
| `INVALID_HTTP_CONFIG`: `createInteractionHandler() needs the application’s 32-byte hex public key.` | `publicKey` is missing or is not the 64-character hex key | Copy the Public Key from the portal, not the token |
| Discord refuses the Interactions Endpoint URL | The handler received a re-serialized body, or the wrong public key | Pass the raw request through, and check the key |
