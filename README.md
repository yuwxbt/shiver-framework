# shiver-framework

Use, modify, and distribute Shiver freely, including in commercial bots and products. You may not sell or monetize the framework itself as a framework or hosted framework product. Keep attribution and the license notice. See [LICENSE](LICENSE).

Shiver v3 is an ESM Discord bot framework for Node >=22.12 and discord.js 14.28. Define a command once for slash and prefix messages. Export definitions from any file under your source directory; Shiver loads them automatically.

## 30-second start

```sh
npm i github:yuwxbt/shiver-framework discord.js@^14.28.0
npx shiver init my-bot
cd my-bot
npm install
npm run check
```

For deployment, copy `.env.example` to `.env`, set `DISCORD_TOKEN`, and run `npm start`. Create an application and bot in the Discord Developer Portal and install it with the `bot` and `applications.commands` scopes. Enable Message Content Intent if using a prefix. The GitHub install targets v3 once it reaches the main branch.

## A single-file example

Save as `bot.js` in a package with `"type": "module"`; set `DISCORD_TOKEN` before running `node bot.js`.

```js
import {
  createBot, defineCommand, defineComponent,
  opt, container, button,
} from 'shiver-framework';
const bot = createBot({ prefix: '!' });
const greeting = defineCommand({
  name: 'hello',
  description: 'Send a greeting',
  options: { name: opt.string('Your name', { required: true }) },
  run: (ctx, { name }) => ctx.reply(container(
    `Hello, ${name}!`,
    button({ id: 'hello:again', label: 'Again' }),
  )),
});
const again = defineComponent({
  id: 'hello:again',
  run: (ctx) => ctx.update(container('Hello again!')),
});
bot.add(greeting, again);
await bot.start();
```

## Exports

All names below come from `shiver-framework` unless a subpath is shown.

| Exports | Purpose |
| --- | --- |
| `Bot`, `createBot`, `createLogger`, `loadDefinitions`, `definePlugin` | Bot lifecycle, logging, feature loading, and plugin bundles |
| `messageCache`, `createInteractionHandler` | Cache controls and signed HTTP interaction transport |
| `Context` | Unified interaction and prefix handler context |
| `defineCommand`, `defineComponent`, `defineButton`, `defineSelect`, `defineModal`, `defineEvent`, `defineTask` | Frozen definitions; button/select are aliases of component |
| `commandToJSON`, `customId` | Registration JSON and filled custom id patterns |
| `opt` | string, integer, number, boolean, user, member, channel, role, mentionable, attachment options |
| `compose`, `cooldown`, `limitConcurrency`, `guildOnly`, `dmOnly`, `channelOnly`, `ownerOnly`, `nsfwOnly` | Middleware composition and guards |
| `requirePermissions`, `requireBotPermissions`, `requireRoles`, `requireEntitlement` | Permission, role, and SKU guards |
| `MemoryStore`, `JsonStore`, `SqliteStore`, `scope` | Async key-value storage |
| `ComponentType`, `emoji`, `withComponentId` | Component constants, emoji normalization, and numeric component IDs |
| `row`, `button`, `select`, `userSelect`, `roleSelect`, `mentionableSelect`, `channelSelect` | Interactive message components |
| `container`, `section`, `text`, `thumbnail`, `gallery`, `file`, `separator` | Components V2 layout and content |
| `modal`, `label`, `textInput`, `fileUpload`, `radioGroup`, `checkboxGroup`, `checkbox` | Modal dialogs and fields |
| `embed`, `poll`, `componentEmbed`, `contentScanFlags`, `resolveMessage`, `validateMessage`, `validateModal` | Message construction, website previews, media flags, and validation |
| `ShiverError`, `UserError` | Developer errors and user-facing rejections |
| `ms`, `resolveColor`, `chunk` | Duration, color, and array utilities |
| `shiver-framework/testing`: `createTestBot`, `runCommand`, `runPrefix`, `runComponent`, `runModal` | Offline handler and prefix parser tests |
| `shiver-framework/package.json` | Package metadata subpath |

## Components, modals, and V2

Components are plain API JSON. `ctx.reply(container('Hello'))` detects Components V2 and sets its flag. V2 messages cannot contain `content`, embeds, or polls: use `text()` inside the components. Loose buttons/selects are wrapped in rows. Legacy messages can combine content, embeds, and button/select rows.

Use `defineComponent({ id: 'ticket:{id}', run(ctx, params) {} })` for persistent handlers. Open a `modal({ id, title }, textInput({ id, label }))` with `ctx.showModal()` as the first response; `defineModal` receives submitted values in `ctx.fields`. Passing `label` to an input wraps it in a modal label. See [components](docs/components.md) for all types and limits.

## Testing and deployment

Use `runCommand` and `runPrefix` from `shiver-framework/testing` to exercise handlers without connecting to Discord. They return replies, visible text, modal data, and errors. Run `npm run check` in this repository for runtime tests and the TypeScript consumer check. Public declarations ship in `types/`.

Use `shiver new command ping` to scaffold a feature, `shiver check` to validate definitions, and `shiver manifest` to inspect the registration JSON offline. Preview remote changes with `shiver sync --prune --dry-run`. See [deployment](docs/deploy.md) for Gateway, signed HTTP interactions, and sharding.

The documentation website renders the Markdown files in [docs/](docs/) from this repository. Edit those files to update both presentations.

[Documentation](docs/getting-started.md) ? [Complete agent API](AGENTS.md) ? [Migration](docs/migrating-from-v2.md)
