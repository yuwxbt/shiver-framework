Run code before and after handlers, and restrict commands, components, and modals with built-in guards for permissions, roles, cooldowns, and purchases.

# Middleware

A middleware is a function that wraps a handler. It receives the context and a `next` function, and decides whether, when, and how the handler runs.

```js
import { createBot } from 'shiver-framework';

const bot = createBot({ dir: './src' });

bot.use(async (ctx, next) => {
  const started = Date.now();
  await next();
  ctx.log.info(`${ctx.kind} ${ctx.command?.name ?? ctx.interaction?.customId} took ${Date.now() - started} ms`);
});

await bot.start();
```

Guards such as `guildOnly` and `cooldown` are middleware that ship with the framework. Most of the time you enable them with a field on a definition and write no middleware of your own.

## Restrict a handler with guard fields

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'kick',
  description: 'Remove a member from the server',
  guildOnly: true,
  permissions: ['KickMembers'],
  botPermissions: ['KickMembers'],
  cooldown: '5s',
  options: {
    member: opt.member('Member to remove', { required: true }),
  },
  run: async (ctx, { member }) => {
    await member.kick(`Requested by ${ctx.user.username}`);
    await ctx.reply(`Removed ${member.user.username}.`);
  },
});
```

When a guard rejects, the user gets a short message and `run` is not called. The message is private for interactions. Guard fields work on commands, subcommands, groups, components, and modals. The full list is in the [guard reference](#guard-reference), and the texts can be changed with the [`messages` option](configuration.md#change-the-built-in-messages).

## Write your own middleware

```js
import { defineCommand, UserError } from 'shiver-framework';

const maintenance = async (ctx, next) => {
  const enabled = await ctx.store.get('maintenance');
  if (enabled && !ctx.bot.owners.has(ctx.user.id)) {
    throw new UserError('The bot is under maintenance. Try again later.');
  }
  return next();
};

export default defineCommand({
  name: 'daily',
  description: 'Claim your daily reward',
  use: [maintenance],
  run: (ctx) => ctx.reply('Reward claimed.'),
});
```

A middleware has three choices:

| To | Do this |
| --- | --- |
| Continue | `return next()` or `await next()` |
| Reject with a message | `throw new UserError('...')`. The text is sent to the user and nothing is logged |
| Stop without a message | Return without calling `next()`. Reply yourself first, or the interaction times out |

Code after `await next()` runs once the handler has finished. Always return or await `next()`. Otherwise an error thrown by the handler is not caught by the pipeline.

### Share data with the handler

`ctx.state` is an empty object created for each invocation. Fill it in a middleware and read it later:

```js
import { defineCommand } from 'shiver-framework';

const loadProfile = async (ctx, next) => {
  ctx.state.profile = (await ctx.store.get(`profile:${ctx.user.id}`)) ?? { coins: 0 };
  return next();
};

export default defineCommand({
  name: 'balance',
  description: 'Show your balance',
  use: loadProfile,
  run: (ctx) => ctx.reply(`You have ${ctx.state.profile.coins} coins.`),
});
```

## Choose where a middleware applies

| Scope | How |
| --- | --- |
| Every command, component, and modal | `createBot({ use: [...] })` or `bot.use(...)` |
| One definition | `use` on the definition. A function or an array |
| A command and all its subcommands | `use` or guard fields on the parent |
| Every handler, shipped as part of a plugin | `use` on the [plugin](plugins.md). It is global |
| Autocomplete suggestions for one option | `autocompleteUse` on the [option](commands.md#suggest-values-with-autocomplete) |

Autocomplete requests, [events, and tasks](events-and-tasks.md) do not pass through global middleware or guards.

## Rate limit with cooldowns

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'search',
  description: 'Search the knowledge base',
  cooldown: { duration: '1m', uses: 3, per: 'guild' },
  run: (ctx) => ctx.reply('Results: none yet.'),
});
```

This allows three runs per server in any one-minute window. The fourth is rejected with a message that shows when the user can try again.

| Field | Default | Meaning |
| --- | --- | --- |
| `duration` | required | Length of the window |
| `uses` | `1` | Runs allowed within the window |
| `per` | `'user'` | What shares the limit: `'user'`, `'guild'`, `'channel'`, or `'global'` |
| `exemptUsers` | `[]` | User IDs that are never limited |

`cooldown: '10s'` is short for `{ duration: '10s' }`. Bot owners skip cooldowns unless you set [`ownersBypassCooldown: false`](configuration.md#set-the-bot-owners).

Each definition with a `cooldown` field keeps its own count. To share one limit across several definitions, create the middleware once and add it to each with `use`:

```js
import { cooldown, defineCommand } from 'shiver-framework';

const shared = cooldown('30s', { per: 'user' });

export const fish = defineCommand({
  name: 'fish',
  description: 'Go fishing',
  use: [shared],
  run: (ctx) => ctx.reply('You caught a trout.'),
});

export const hunt = defineCommand({
  name: 'hunt',
  description: 'Go hunting',
  use: [shared],
  run: (ctx) => ctx.reply('You found tracks.'),
});
```

> **Note**
> Cooldowns are counted in memory. They reset when the process restarts and are not shared between shards or processes. A run is counted when it passes the cooldown, even if the handler fails afterwards.

## Limit concurrent runs

`limitConcurrency(limit, { per })` rejects a run while `limit` earlier runs are still in progress. Use it for handlers that must not overlap:

```js
import { defineCommand, limitConcurrency } from 'shiver-framework';

export default defineCommand({
  name: 'backup',
  description: 'Back up this server',
  guildOnly: true,
  defer: 'ephemeral',
  use: [limitConcurrency(1, { per: 'guild' })],
  run: async (ctx) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await ctx.reply('Backup complete.');
  },
});
```

`per` is `'global'` (default), `'user'`, `'guild'`, or `'channel'`. The slot is released when the handler finishes, including when it throws.

## Require a purchase

`entitlement` takes one SKU ID or an array. The handler runs when the interaction carries an active entitlement for any of them. Otherwise the user sees the `premium` message with Discord's purchase buttons.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'themes',
  description: 'Browse premium themes',
  entitlement: '1234567890123456789',
  prefix: false,
  run: (ctx) => ctx.reply('Here are your themes.'),
});
```

Chat messages carry no entitlements, so an entitlement guard always rejects a chat command. Set `prefix: false` on commands gated this way. To show a purchase button yourself, use `button({ sku: 'SKU_ID' })`.

## Check permissions yourself

Inside a handler, `ctx.memberPermissions` and `ctx.appPermissions` hold the permissions of the user and of the bot in the current channel as discord.js `PermissionsBitField` objects, or `null` when unknown:

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'whoami',
  description: 'Show what you can do here',
  guildOnly: true,
  run: (ctx) => ctx.reply(ctx.memberPermissions?.has('ManageGuild') ? 'You manage this server.' : 'You are a member.'),
});
```

To ask Discord for the effective permissions of another member or a role, call `bot.fetchPermissions`:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'cansend',
  description: 'Check whether a member can send messages here',
  guildOnly: true,
  options: { member: opt.user('Member', { required: true }) },
  run: async (ctx, { member }) => {
    const permissions = await ctx.bot.fetchPermissions({ channelId: ctx.channelId, userId: member.id });
    await ctx.reply(permissions.has('SendMessages') ? 'Yes.' : 'No.');
  },
});
```

| Field | Meaning |
| --- | --- |
| `guildId` or `channelId` | Exactly one. The scope to evaluate |
| `userId` or `roleId` | Exactly one. The subject |
| `implicit` | Channel scope only. A boolean passed to Discord as the `implicit` query parameter |

The result is a frozen `PermissionsBitField`.

## Execution order

For every command, component, and modal interaction, and every chat command:

1. The deferral from `defer` on the definition, if any.
2. Global middleware: first the `use` option, then plugin middleware, then anything added with `bot.use()`.
3. For a command with subcommands, each level from the command down to the subcommand. Within one level:
   1. Guard fields in this order: `guildOnly`, `dmOnly`, `channelTypes`, `roles`, `ownerOnly`, `nsfw`, `permissions`, `botPermissions`, `entitlement`, `cooldown`.
   2. The `use` middleware of that level.
4. The handler.

Because the deferral comes first, a rejection after `defer: true` edits the public pending reply. Use `defer: 'ephemeral'` to keep rejections private.

## Guard reference

Every guard exists as a definition field and as an exported function that returns a middleware. The two forms behave the same.

| Field | Function | Passes when | In a direct message | Message key |
| --- | --- | --- | --- | --- |
| `guildOnly: true` | `guildOnly()` | The context is in a server | Rejects | `guildOnly` |
| `dmOnly: true` | `dmOnly()` | The context is not in a server | Passes | `dmOnly` |
| `channelTypes: [...]` | `channelOnly(...types)` | The channel type is one of the discord.js `ChannelType` values | Passes if the DM type is listed | `channelOnly` |
| `roles: [...]` | `requireRoles(...ids)` | The member has every listed role | Rejects with `guildOnly` | `roles` |
| `ownerOnly: true` | `ownerOnly()` | The user is a [bot owner](configuration.md#set-the-bot-owners) | Same check | `ownerOnly` |
| `nsfw: true` | `nsfwOnly()` | The channel is age-restricted | Passes | `nsfw` |
| `permissions: [...]` | `requirePermissions(...permissions)` | The user has every permission in the channel, or is an administrator | Rejects with `guildOnly` | `userPermissions` |
| `botPermissions: [...]` | `requireBotPermissions(...permissions)` | The bot has every permission in the channel, or is an administrator | Passes | `botPermissions` |
| `entitlement: 'SKU'` | `requireEntitlement(...skus)` | The interaction has an active entitlement for one of the SKUs | Same check | `premium` |
| `cooldown: '10s'` | `cooldown(duration, options?)` | Fewer than `uses` runs in the window | Same check | `cooldown` |
| none | `limitConcurrency(limit, options?)` | Fewer than `limit` runs in progress | Same check | `busy` |

Permissions are discord.js permission names such as `'ManageMessages'`, or any other `PermissionResolvable`.

`compose(stack, handler)` is also exported. It returns a function that runs an array of middleware around a handler, for use in your own tools.

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `INVALID_GUARD`: `limitConcurrency() needs a positive integer limit.` | The limit is zero, negative, or not a whole number | Pass `1` or more |
| `INVALID_GUARD`: `cooldown() needs a positive integer uses value.` | `uses` is zero, negative, or not a whole number | Pass `1` or more |
| `INVALID_DURATION`: `Invalid duration "10 seconds". Use milliseconds or a string like "5s", "10m", "1h30m".` | An unsupported duration string | Use the units `ms`, `s`, `m`, `h`, `d`, `w` |
| The user sees the generic error message and the log shows `next() called more than once in a middleware.` | A middleware called `next()` twice | Call it once |
| "The application did not respond" after a middleware | The middleware returned without calling `next()` and without replying | Throw a `UserError`, or reply before returning |
| Errors in a handler are logged as unhandled rejections | A middleware called `next()` without returning or awaiting it | `return next()` |
| A premium command always rejects from chat | Chat messages carry no entitlements | Set `prefix: false` |
| A guard rejection is visible to everyone | The definition has `defer: true` | Use `defer: 'ephemeral'` |
| Suggestions are shown to users the command would reject | Autocomplete skips guards | Add `autocompleteUse` to the option |
