Middleware wraps commands, components, and modal handlers in an ordered asynchronous pipeline.

# Middleware

## Apply guards

```js
import {createBot, defineCommand, UserError, cooldown} from 'shiver-framework';
const bot = createBot({env: false});
bot.use(async (ctx, next) => {
  ctx.state.started = Date.now();
  await next();
  ctx.log.info('Handled in', Date.now() - Number(ctx.state.started), 'ms');
});
bot.add(defineCommand({
  name: 'admin', description: 'Admin status', guildOnly: true,
  permissions: ['ManageGuild'], use: [cooldown('5s')],
  run(ctx) {
    if (!ctx.guildId) throw new UserError('Run this in a server.');
    return ctx.reply('Ready');
  },
}));
await bot.client.destroy();
```

Call and await `next()` once to continue. Return without calling it to stop silently, or throw `UserError(textOrMessage)` to show a private rejection. Ordinary exceptions log a trace ID and go through `onError`. `ctx.state` passes data between middleware/handler. The example stays offline; call `bot.start()` with a configured token to connect.

Order: optional defer, global `use`, then each parent-to-leaf node's guildOnly, ownerOnly, nsfw, permissions, botPermissions, entitlement, cooldown, and `use`. Autocomplete, events, and tasks do not use this pipeline.

| Factory | Meaning |
| --- | --- |
| `guildOnly()` | Requires server |
| `dmOnly()` | Requires a direct message |
| `channelOnly(...types)` | Requires any of the given discord.js channel types |
| `requireRoles(...ids)` | Requires all listed guild role IDs |
| `ownerOnly()` | Requires application owner/team or explicit owners |
| `nsfwOnly()` | Age-restricted channel in servers; DMs allowed |
| `requirePermissions(...permissions)` | User channel permissions; requires server |
| `requireBotPermissions(...permissions)` | Bot channel permissions; DMs allowed |
| `requireEntitlement(...skus)` | Active interaction entitlement matching SKU; otherwise purchase buttons |
| `cooldown(duration, {per, uses})` | Process-local sliding window; per user, guild, channel, or global |
| `limitConcurrency(limit, {per}?)` | Caps simultaneous handler runs, globally by default or per user, guild, or channel |
| `compose(stack, handler)` | Returns context handler executing the stack |

Permissions use discord.js PermissionResolvable values. `cooldown('10s', {uses: 3, per: 'guild', exemptUsers: ['USER_ID']})` permits three uses in ten seconds and exempts the given user. Owners bypass cooldowns unless `ownersBypassCooldown: false`. Definition shorthand accepts duration or `{duration, per, uses, exemptUsers}`. Cooldowns and concurrency limits are per middleware instance and process. `limitConcurrency(1, {per: 'guild'})` releases the slot even if the handler throws.

## Permission queries

`ctx.memberPermissions` and `ctx.appPermissions` return the permissions available to this context, or null. To fetch Discord's current permissions for another member or role, call `bot.fetchPermissions({channelId, userId})`, `bot.fetchPermissions({guildId, roleId})`, or the other scope/subject combinations. Channel queries accept `implicit: false` to disable implicit masking. The result is a frozen discord.js `PermissionsBitField`. [Discord permission endpoints](https://docs.discord.com/developers/change-log)

## Discord entitlements

Use `entitlement: 'SKU_ID'` on an interaction definition, or apply `requireEntitlement('SKU_ID')` as middleware. It checks the active entitlements in the interaction payload and presents a Discord purchase button for a missing entitlement. A prefix message has no entitlement payload. Use `prefix: false` for a command gated this way. To build a purchase button yourself, call `button({sku: 'SKU_ID'})` with a configured Discord SKU.
