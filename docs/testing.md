Run commands, components, and modals through the real handler pipeline without a token or a network connection, and assert on what they reply.

# Testing

`shiver-framework/testing` exports runners that invoke a definition with a simulated interaction or message. Middleware, guards, option parsing, and message validation all run as they do in production. Only the transport to Discord is replaced by a recorder.

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineCommand, opt } from 'shiver-framework';
import { runCommand } from 'shiver-framework/testing';

const echo = defineCommand({
  name: 'echo',
  description: 'Repeat a message',
  options: { text: opt.string('Text to repeat', { required: true }) },
  run: (ctx, { text }) => ctx.reply({ content: text, ephemeral: true }),
});

test('echo repeats the text privately', async () => {
  const result = await runCommand(echo, { options: { text: 'Hello' } });

  assert.equal(result.text, 'Hello');
  assert.equal(result.last.ephemeral, true);
  assert.equal(result.error, null);
});
```

Save it as `test/echo.test.js` and run `node --test`. In a real project, import the definition from your `src/` folder instead of declaring it in the test. Files with `.test.` or `.spec.` in their name are never loaded as features, so tests may also live next to the code.

## Read the result

Every runner resolves with the same object:

| Field | Type | Meaning |
| --- | --- | --- |
| `replies` | array | Every response the handler made, in order |
| `last` | reply or `null` | The final entry of `replies` |
| `text` | `string` | The visible text of all replies, joined with newlines |
| `modal` | object or `null` | The modal passed to `ctx.showModal`, if any |
| `error` | `Error` or `null` | An unexpected error thrown by the handler or a middleware |
| `ctx` | `Context` | The context the handler received. `null` when a chat message matched no command |

Each reply records the method and the payload that would have been sent to Discord:

| Field | Meaning |
| --- | --- |
| `method` | `'reply'`, `'defer'`, `'edit'`, `'followUp'`, `'update'`, `'deferUpdate'`, `'delete'`, `'modal'`, or `'launchActivity'` |
| `text` | Visible text: content, embed titles, descriptions, fields and footers, text components, and button labels |
| `ephemeral` | `true` when the payload carries the ephemeral flag |
| `content`, `embeds`, `components`, `files`, `flags` | The resolved payload, with components and embeds as plain objects |

A `UserError`, including a guard rejection, is recorded as a normal reply and leaves `error` as `null`. Any other error is stored in `error`, and the generic error message the user would see is recorded as a reply.

## Test options and guards

Pass parsed options with `options`. Describe who runs the command with the simulation fields:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineCommand, opt } from 'shiver-framework';
import { runCommand } from 'shiver-framework/testing';

const slowmode = defineCommand({
  name: 'slowmode',
  description: 'Set the slow mode of this channel',
  guildOnly: true,
  permissions: ['ManageChannels'],
  options: { seconds: opt.integer('Seconds between messages', { required: true, min: 0, max: 21600 }) },
  run: (ctx, { seconds }) => ctx.reply(`Slow mode set to ${seconds} seconds.`),
});

test('members without permission are rejected', async () => {
  const result = await runCommand(slowmode, { options: { seconds: 5 } });
  assert.equal(result.text, 'You need these permissions: Manage Channels.');
  assert.equal(result.last.ephemeral, true);
});

test('moderators can set slow mode', async () => {
  const result = await runCommand(slowmode, { options: { seconds: 5 }, permissions: ['ManageChannels'] });
  assert.equal(result.text, 'Slow mode set to 5 seconds.');
});

test('it does not work in direct messages', async () => {
  const result = await runCommand(slowmode, { options: { seconds: 5 }, guildId: null });
  assert.equal(result.text, 'This only works in a server.');
});
```

For a command with subcommands, name the one to run with `sub`. Use an array for a subcommand inside a group: `runCommand(tag, { sub: ['admin', 'set'], options: { name: 'rules', text: 'Be kind.' } })`.

For a context menu command, pass the user, member, or message as `target`.

> **Note**
> `runCommand` hands `options` to the handler exactly as you wrote them. Options you leave out are `undefined`, defaults are not applied, and `min`, `max`, and `choices` are not checked, because Discord does that for slash commands. Pass every option the handler reads, or use `runPrefix` to exercise parsing.

## Test chat commands

`runPrefix` sends a message through the prefix parser, so aliases, subcommands, quoting, type checks, and usage errors are all covered:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineCommand, opt } from 'shiver-framework';
import { runPrefix } from 'shiver-framework/testing';

const echo = defineCommand({
  name: 'echo',
  description: 'Repeat a message',
  aliases: ['say'],
  options: {
    times: opt.integer('Number of copies', { required: true, min: 1, max: 3 }),
    text: opt.string('Text to repeat', { required: true }),
  },
  run: (ctx, { times, text }) => ctx.reply(Array(times).fill(text).join(' ')),
});

test('parses arguments by position', async () => {
  const result = await runPrefix(echo, { content: '!say 2 hello there' });
  assert.equal(result.text, 'hello there hello there');
});

test('explains what is wrong', async () => {
  const result = await runPrefix(echo, { content: '!echo 9 hi' });
  assert.equal(result.text, '`times`: must be at most 3.\nUsage: `!echo <times> <text>`');
});
```

`content` defaults to the prefix followed by the command name. The default prefix is `'!'`, and you can change it with `prefix`. Pass `attachments` as an array of objects with `id`, `name`, and optionally `contentType` to test attachment options.

User, member, channel, and role arguments are looked up through the simulated server, which is empty unless you fill it. Provide what the parser reads with the `guild` field, for example `guild: { roles: { cache: new Map([[roleId, role]]) } }` for a role option.

## Test components and modals

`runComponent` and `runModal` take the custom id the user would have triggered. Parameters are extracted with the same matcher the bot uses:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineComponent, defineModal } from 'shiver-framework';
import { runComponent, runModal } from 'shiver-framework/testing';

const close = defineComponent({
  id: 'ticket:{id}:close',
  run: (ctx, { id }) => ctx.update(`Ticket ${id} closed by ${ctx.user.username}.`),
});

const pick = defineComponent({
  id: 'color:pick',
  run: (ctx) => ctx.update(`You picked ${ctx.values.join(', ')}.`),
});

const feedback = defineModal({
  id: 'feedback',
  ephemeral: true,
  run: (ctx) => ctx.reply(`Thanks for the ${ctx.fields.kind.toLowerCase()} report.`),
});

test('button with a parameter', async () => {
  const result = await runComponent(close, { id: 'ticket:42:close', user: { username: 'ada' } });
  assert.equal(result.last.method, 'update');
  assert.equal(result.text, 'Ticket 42 closed by ada.');
});

test('select values', async () => {
  const result = await runComponent(pick, { values: ['red', 'blue'] });
  assert.equal(result.text, 'You picked red, blue.');
});

test('modal fields', async () => {
  const result = await runModal(feedback, { fields: { kind: 'Bug', body: 'It broke.' } });
  assert.equal(result.text, 'Thanks for the bug report.');
  assert.equal(result.last.ephemeral, true);
});
```

`id` defaults to the definition's id, which is enough for ids without placeholders. For a `RegExp` route you must pass `id`.

To check that a command opens the right modal, read `result.modal`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineCommand, modal, textInput } from 'shiver-framework';
import { runCommand } from 'shiver-framework/testing';

const report = defineCommand({
  name: 'report',
  description: 'Report a problem',
  run: (ctx) => ctx.showModal(modal(
    { id: 'report', title: 'Report a problem' },
    textInput({ id: 'details', label: 'What happened?', style: 'paragraph' }),
  )),
});

test('report opens a modal', async () => {
  const result = await runCommand(report);
  assert.equal(result.modal.custom_id, 'report');
  assert.equal(result.modal.components[0].component.custom_id, 'details');
});
```

## Script clicks and submissions

Handlers that wait with `ctx.confirm`, `ctx.paginate`, `ctx.awaitComponent`, or `ctx.awaitModal` take their answers from `clicks` and `submit`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineCommand, modal, textInput } from 'shiver-framework';
import { runCommand } from 'shiver-framework/testing';

const reset = defineCommand({
  name: 'reset',
  description: 'Delete your saved data',
  run: async (ctx) => {
    const confirmed = await ctx.confirm('Delete your saved data?');
    await ctx.followUp(confirmed === null ? 'No answer.' : confirmed ? 'Deleted.' : 'Canceled.');
  },
});

const rename = defineCommand({
  name: 'rename',
  description: 'Rename your profile',
  run: async (ctx) => {
    const form = modal({ id: 'rename', title: 'Rename' }, textInput({ id: 'name', label: 'New name' }));
    const submitted = await ctx.awaitModal(form);
    if (submitted) await submitted.reply(`Renamed to ${submitted.fields.name}.`);
  },
});

test('confirm, cancel, and timeout', async () => {
  assert.equal((await runCommand(reset, { clicks: ['shiver:confirm:yes'] })).last.text, 'Deleted.');
  assert.equal((await runCommand(reset, { clicks: ['shiver:confirm:no'] })).last.text, 'Canceled.');
  assert.equal((await runCommand(reset)).last.text, 'No answer.');
});

test('modal submission', async () => {
  const result = await runCommand(rename, { submit: { name: 'Ada' } });
  assert.equal(result.last.text, 'Renamed to Ada.');
});
```

`clicks` is a list of custom ids, or objects of the form `{ id, values, user }` for selects and for clicks by other users. Each wait consumes the next click that its filter accepts. When the list is empty, the wait times out at once, so tests never sleep.

| Built-in control | Custom id |
| --- | --- |
| `ctx.confirm` yes / no | `shiver:confirm:yes`, `shiver:confirm:no` |
| `ctx.paginate` previous / next | `shiver:page:prev`, `shiver:page:next` |
| `ctx.paginate` with `controls: 'select'` | `{ id: 'shiver:page:select', values: ['2'] }` for the third page |

Without `submit`, `ctx.awaitModal` resolves with `null`.

## Share a bot between calls

Each runner creates a fresh bot unless you pass one. Create your own with `createTestBot` to test global middleware, owners, translations, custom messages, or data in the store:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineCommand } from 'shiver-framework';
import { createTestBot, runCommand } from 'shiver-framework/testing';

const visits = defineCommand({
  name: 'visits',
  description: 'Count how often you ran this command',
  run: async (ctx) => {
    const key = `visits:${ctx.user.id}`;
    const count = ((await ctx.store.get(key)) ?? 0) + 1;
    await ctx.store.set(key, count);
    await ctx.reply(`You have been here ${count} times.`);
  },
});

test('visits are counted per user', async () => {
  const bot = createTestBot();
  await bot.store.set('visits:100000000000000001', 4);

  const first = await runCommand(visits, { bot });
  const other = await runCommand(visits, { bot, user: { id: '100000000000000002' } });

  assert.equal(first.text, 'You have been here 5 times.');
  assert.equal(other.text, 'You have been here 1 times.');
});
```

`createTestBot(options)` accepts every [`createBot` option](configuration.md#options-reference) and changes three defaults: `env: false`, `logLevel: 'silent'`, and `sync: false`. A cooldown is counted per definition, so reuse the same definition object across calls to test it.

When you pass your own bot to `runPrefix`, give it a `prefix` and register the command with `bot.add()` first.

To verify that a whole project loads, load it into a test bot:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestBot } from 'shiver-framework/testing';

test('every definition under src loads', async () => {
  const bot = createTestBot({ dir: './src' });
  await bot.load();
  assert.ok(bot.summary.commands > 0);
});
```

## Runner reference

### Functions

| Function | Options besides the simulation fields |
| --- | --- |
| `runCommand(definition, options?)` | `options` (parsed option values), `sub` (subcommand name or path), `target` (context menu target) |
| `runPrefix(definition, options?)` | `content` (message text), `prefix` (default `'!'`), `attachments` |
| `runComponent(definition, options?)` | `id` (custom id), `values` (selected values) |
| `runModal(definition, options?)` | `id` (custom id), `fields` (submitted values by input id) |
| `createTestBot(options?)` | Any `createBot` option |

### Simulation fields

| Field | Default | Meaning |
| --- | --- | --- |
| `user` | `{ id: '100000000000000001', username: 'tester', bot: false }` | Merged over the default user |
| `guildId` | `'200000000000000001'` | Server ID. `null` simulates a direct message |
| `member` | `{ id, user }` | Extra member fields, such as `roles: ['ROLE_ID']` for the `roles` guard |
| `guild` | `{ id }` | Extra fields on `ctx.guild` |
| `channel` | `{ id: '400000000000000001', nsfw: false }` | Extra fields on `ctx.channel`, such as `nsfw: true` or `type` |
| `permissions` | none | The user's permissions in the channel |
| `botPermissions` | `['Administrator']` | The bot's permissions in the channel |
| `locale` | `'en-US'` | The interaction locale |
| `entitlements` | `[]` | Entitlements, for example `[{ skuId: 'SKU_ID' }]` |
| `bot` | a new test bot | The bot to run against |
| `clicks` | `[]` | Scripted component interactions |
| `submit` | none | Fields for `ctx.awaitModal` |

`ctx.guild`, `ctx.channel`, and `ctx.member` are plain objects that contain only these fields. If a handler calls a discord.js method such as `ctx.channel.send`, supply a stand-in through `channel`.

## What the runners do not cover

| Not simulated | How to test it |
| --- | --- |
| Autocomplete | Call the function directly: `definition.options.city.autocomplete(ctx, 'pa')` |
| Events and tasks | Call `definition.run(bot, ...args)` with a test bot |
| Discord's own validation of slash options | Covered by Discord. Test bounds through `runPrefix` if you rely on them in chat |
| `ephemeral` set on a subcommand | `runCommand` reads `ephemeral` from the command only |
| Discord API behavior, rate limits, and permissions enforced by Discord | Test against a real server |

## Common mistakes

| Error | Cause | Fix |
| --- | --- | --- |
| `NO_MATCH`: `The id "x" does not match the handler pattern "ticket:{id}".` | The `id` passed to `runComponent` or `runModal` does not fit the definition | Pass the id the component would really have |
| `NO_MATCH`: `Pass a concrete id when testing a RegExp route.` | A `RegExp` route was run without `id` | Pass `id` |
| `INVALID_DEFINITION`: `runCommand() takes a value created by defineCommand().` | A module object, or a component, was passed | Pass the command definition, for example the default export |
| `INVALID_DEFINITION`: `runPrefix() takes a slash command definition.` | A context menu command was passed | Context menus have no chat form |
| `result.ctx` is `null` and there are no replies | The `content` does not start with the prefix and command name | Check `content` and `prefix` |
| An option is `undefined` in the handler | `runCommand` does not apply defaults | Pass the option explicitly |
| `TypeError: ctx.channel.send is not a function` | The simulated channel has no methods | Pass `channel: { send: async () => {} }` |
