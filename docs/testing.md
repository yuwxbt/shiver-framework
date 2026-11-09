The testing subpath runs real handlers, guards, middleware, and validation with fake Discord transport.

# Testing

## Run a handler offline

Run with `node --test example.test.js`:

```js
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defineCommand, opt} from 'shiver-framework';
import {runCommand} from 'shiver-framework/testing';
test('echo replies with text', async () => {
  const command = defineCommand({
    name: 'echo', description: 'Echo',
    options: {text: opt.string('Text', {required: true})},
    run: (ctx, {text}) => ctx.reply({content: text, ephemeral: true}),
  });
  const result = await runCommand(command, {options: {text: 'Hello'}});
  assert.equal(result.text, 'Hello');
  assert.equal(result.last.ephemeral, true);
  assert.equal(result.error, null);
});
```

## Simulate inputs and interactions

| Export | Signature |
| --- | --- |
| `createTestBot` | `(botOptions?) -> Bot`, env false, log silent, sync false by default |
| `runCommand` | `(definition, {options, sub, target, ...simulation}?)` |
| `runPrefix` | `(definition, {content, prefix, attachments, ...simulation}?)` |
| `runComponent` | `(definition, {id, values, ...simulation}?)` |
| `runModal` | `(definition, {id, fields, ...simulation}?)` |

Run helpers return `{ctx, replies, last, text, modal, error}` asynchronously. Replies include method, normalized payload, ephemeral, and visible text. `last` is null without replies. `error` captures pipeline errors; UserError becomes a reply and leaves it null. Bad definitions/unmatched routes can throw before the pipeline.

Simulation: `user`, `member`, `guildId` (null for DM), `permissions`, `botPermissions`, `locale`, `bot`, `clicks`, `submit`, plus runtime `guild`, `channel`, `entitlements`. `sub` is a name or array path. Supply parsed `options` to `runCommand`. Pass a full message such as `{content: '!echo "Hello there"'}` to `runPrefix` to exercise aliases, subcommands and actual option parsing. If supplying a custom bot to `runPrefix`, register the command on it and configure its prefix first. An unmatched prefix message returns `ctx: null`.

`clicks` contains IDs or `{id, values, user}` consumed in order by collectors. Rejected clicks are skipped; exhaustion simulates timeout. `submit` supplies `awaitModal` fields. Test persistent handlers separately through `runModal`. For RegExp component or modal routes, supply a concrete `id` to the runner.

```js
import {defineCommand, defineComponent, defineModal} from 'shiver-framework';
import {runCommand, runComponent, runModal} from 'shiver-framework/testing';
const confirm = defineCommand({name: 'delete', description: 'Confirm', async run(ctx) {
  await ctx.followUp(String(await ctx.confirm('Delete?')));
}});
console.log((await runCommand(confirm, {clicks: ['shiver:confirm:yes']})).text);
const component = defineComponent({id: 'item:{id}', run: (ctx, {id}) => ctx.update(id)});
console.log((await runComponent(component, {id: 'item:42'})).text);
const form = defineModal({id: 'form', run: ctx => ctx.reply(String(ctx.fields.name))});
console.log((await runModal(form, {fields: {name: 'Ada'}})).text);
```

This repository runs `npm test` for runtime tests and `npm run typecheck` for a strict consumer fixture against the declarations in `types/`. `npm run check` runs both. Transport tests exercise real discord.js classes and locally signed HTTP requests with mocked REST. A live application is needed to verify Discord's end-to-end behavior.
