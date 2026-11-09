Move a v2 bot to v3 one feature at a time: what was removed, what replaces it, and how to verify each step.

# Migrating from v2

Version 3 is a rewrite with a new API. No v2 entry point, feature convention, or store adapter carries over, so a migration is a port and not an upgrade in place. v3 features are small, self-contained files, which lets you port and test them one at a time.

## What changed

| Area | v2 | v3 |
| --- | --- | --- |
| Runtime | Lower minimum versions | Node 22.13 or later, discord.js 14.28 or later, ESM only |
| Features | Framework base classes and loader conventions | Plain objects from `defineCommand`, `defineComponent`, `defineModal`, `defineEvent`, and `defineTask`, exported from any file under `dir` |
| Slash and prefix commands | Separate implementations | One `run(ctx, options)` serves both |
| Replies | Different code for interactions and messages | One context: `ctx.reply`, `ctx.edit`, `ctx.defer`, `ctx.followUp` |
| UI | Builder abstractions | Functions that return plain Discord JSON: `button()`, `container()`, `modal()` |
| Configuration and plugins | v2 configuration and plugin APIs | `createBot` options, middleware, and `definePlugin` |
| Storage | v2 store adapters | An async `get` / `set` / `delete` / `keys` store |
| Command registration | v2 registration steps | Automatic on start, or `shiver sync` |
| Commands you delete from the code | Not preserved | Stay registered until you run a sync with `--prune` |
| License | MIT | Shiver Framework License 1.0. See [the license](../LICENSE) |

## 1. Prepare a v3 project

Start from a fresh scaffold next to the old bot instead of editing it in place:

```sh
npm i github:yuwxbt/shiver-framework discord.js@^14.28.0
npx shiver init my-bot-v3
cd my-bot-v3
npm install
npm run check
```

Use the same application and token as the old bot only when you are ready to switch. Two processes with one token both receive every interaction, so stop the v2 process before you start the v3 one. For side-by-side testing, create a second application in the Developer Portal.

## 2. Port commands

For each v2 command, create one file under `src/` and express its inputs as options:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'warn',
  description: 'Warn a member',
  guildOnly: true,
  permissions: ['ModerateMembers'],
  options: {
    member: opt.user('Member to warn', { required: true }),
    reason: opt.string('Reason', { default: 'No reason given' }),
  },
  run: async (ctx, { member, reason }) => {
    await ctx.store.set(`warn:${ctx.guildId}:${member.id}:${Date.now()}`, { reason, by: ctx.user.id });
    await ctx.reply(`Warned ${member.username}: ${reason}`);
  },
});
```

Points that differ from typical v2 code:

- **Arguments.** Chat commands no longer receive a raw string or an array of words. Declare options, and the handler gets typed values whether it was invoked as `/warn` or `!warn`. An option the user omits is `null` or its `default`.
- **Permissions.** Move checks out of the handler body and into guard fields such as `permissions`, `guildOnly`, and `cooldown`. See [Middleware](middleware.md#guard-reference).
- **Replies.** Replace `interaction.reply`, `message.reply`, and `message.channel.send` with `ctx.reply`. Replace raw `ephemeral` flags with `ephemeral: true` in the payload or on the definition.
- **Prefix.** Chat commands are off until you set the [`prefix` option](configuration.md#enable-prefix-commands). A command that should stay chat-only takes `slash: false`.

## 3. Port buttons, selects, and modals

Listeners and collectors that matched on custom ids become `defineComponent` and `defineModal` handlers. Keep the custom ids of components that are already posted in your servers, so that old messages continue to work:

```js
import { container, defineComponent } from 'shiver-framework';

export default defineComponent({
  id: 'ticket:close:{ticket}',
  guildOnly: true,
  run: async (ctx, { ticket }) => {
    await ctx.store.delete(`ticket:${ticket}`);
    await ctx.update(container(`Ticket ${ticket} is closed.`));
  },
});
```

If an old id used another separator or layout, match it with a regular expression instead. See [Components](components.md#match-ids-with-a-regular-expression).

Messages built with v2 UI builders become calls to `embed`, `row`, `button`, `container`, and the other [component functions](components.md#component-reference). Components V2 layouts cannot share a message with `content` or embeds, so port a message either as text and embeds with rows, or as a layout.

## 4. Port events and scheduled work

Client event listeners become [`defineEvent`](events-and-tasks.md) files, and intervals become `defineTask` files. Intents for the events you define are added automatically, so remove hand-maintained intent lists and keep only extras in the `intents` option.

```js
import { defineEvent } from 'shiver-framework';

export default defineEvent({
  name: 'guildMemberAdd',
  run: async (bot, member) => {
    await member.guild.systemChannel?.send(`Welcome, ${member.user.username}.`);
  },
});
```

## 5. Move configuration and data

- Translate the v2 configuration into [`createBot` options](configuration.md#options-reference). Cross-cutting behavior that lived in v2 hooks or plugins becomes [middleware](middleware.md) or a [plugin](plugins.md).
- Pick a [store](store.md#keep-data-across-restarts). v2 data is not converted. Write a one-off script that reads the old data and calls `store.set` for each record:

```js
import { readFile } from 'node:fs/promises';
import { JsonStore } from 'shiver-framework';

const old = JSON.parse(await readFile('./old-data.json', 'utf8'));
const store = new JsonStore('./data/store.json');

for (const [guildId, settings] of Object.entries(old.guilds ?? {})) {
  await store.set(`settings:${guildId}`, settings);
}

await store.close();
```

## 6. Verify before switching

1. `npm run check` loads and validates every definition offline.
2. Cover the ported features with [offline tests](testing.md). `runPrefix` is the quickest way to confirm that a chat command still parses its arguments the way your users type them.
3. Start the v3 bot against a test application, with `devGuild` set to a test server.
4. Compare the registration with what Discord has: `npx shiver sync --prune --dry-run` lists what would be created, overwritten, and deleted.

## 7. Switch over

1. Stop the v2 process.
2. Remove `devGuild`, set the production token, and start the v3 bot. It registers its commands on start.
3. Remove v2 commands that no longer exist: `npx shiver sync --prune`. Read [the warning about pruning](deploy.md#remove-commands-you-deleted) first.

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `SyntaxError: Cannot use import statement outside a module` | The project is still CommonJS | Set `"type": "module"` in `package.json` and use `import` |
| `INVALID_DEFINITION`: `bot.add() takes values created by defineCommand, defineComponent, defineModal, defineEvent or defineTask.` | A v2 class or plain object was registered | Wrap the feature in the matching `define*` function |
| `LOAD_FAILED` naming a helper file | The loader imports every file under `dir` | Move helpers to a path that starts with `_`, such as `src/_lib/` |
| Old buttons answer `This has expired. Run the command again.` | No v3 handler matches the old custom id | Add a `defineComponent` with the old id or a matching pattern |
| Chat commands stopped working | `prefix` is not set, or Message Content Intent is off for the application | Set `prefix` and enable the intent |
| Old slash commands are still listed | Sync does not delete | `npx shiver sync --prune` |
| Both bots answer | The v2 process is still running | Stop it |
