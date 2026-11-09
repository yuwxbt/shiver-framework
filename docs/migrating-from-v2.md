Version 3 replaces the previous framework structure with exported definitions, unified Context, and plain JSON UI helpers.

# Migrating from v2

## Update feature definitions

Migrate features into a new ESM Node >=22.12 project using discord.js 14.28. Stop the old process before opening a new gateway connection with the same application. Version 3 replaces the previous API.

| Previous approach | v3 replacement |
| --- | --- |
| Framework-specific base classes/loader conventions | Export defineCommand/Component/Modal/Event/Task from source files |
| Separate slash/prefix implementations | One run(ctx, options) with opt builders |
| Interaction/message-specific reply logic | ctx.reply/edit/defer/update/followUp |
| UI builder abstractions | Plain JSON button/container/modal helpers |
| Old plugin/configuration APIs | createBot options and ordinary middleware/modules |
| Legacy storage adapters | Async get/set/delete/keys Store interface |
| Old registration steps | bot.sync() or shiver sync |

## Verify the migrated feature

Runnable offline migration target:

```js
import {createBot, defineCommand, opt, container} from 'shiver-framework';
import {runCommand} from 'shiver-framework/testing';
export const echo = defineCommand({
  name: 'echo', description: 'Repeat text',
  options: {text: opt.string('Text', {required: true})},
  run: (ctx, {text}) => ctx.reply(container(text)),
});
console.log((await runCommand(echo, {options: {text: 'Migrated'}})).text);
const bot = createBot({env: false, prefix: '!'}).add(echo);
await bot.stop();
```

Keep startup outside the definition directory. Update component IDs and routes together. Prefix strings become parsed option objects; omitted values are null. Move runtime permissions to guards; defaultMemberPermissions only controls registration defaults. Replace raw Discord ephemeral booleans with Shiver's message option.

V2 components cannot combine with content/embeds/polls; legacy embeds can combine with rows. Port stores deliberately; v2 data is not converted automatically. Run `shiver check`, test features offline, then sync the intended scope. The new source-available license permits commercial bots and prohibits selling the framework itself.
