# Shiver Framework v3

Use Node 22.13+ and discord.js ^14.28. Shiver is ESM. Import runtime helpers from `shiver-framework` and offline runners from `shiver-framework/testing`.

## Project conventions

Keep the entry file `bot.js` outside `src/`. Put one feature in each file under `src/commands/`, `src/components/`, `src/modals/`, `src/events/`, or `src/tasks/`. Export the result of a `define*` call. The loader reads default and named exports and arrays. It skips hidden or underscore-prefixed paths, declarations, and test/spec files. Keep startup side effects out of definition modules.

Run `npm run check` after changes. The starter's check validates definitions offline. The framework repository's check runs runtime and TypeScript consumer tests. Keep API documentation in `docs/` and declarations in `types/`. Never commit credentials. Use `ephemeral` on Shiver payloads or definitions, never raw flags. Keep custom IDs within 100 characters. V2 messages cannot contain content, embeds, or polls. Place text in a `text()` component or in a container.

## Bot and registration

- `createBot(options?)` or `new Bot(options?)`. Common settings are `dir`, `token`, `env`, `sync`, `prefix`, `mentionPrefix`, `devGuild`, `intents`, `client`, `store`, `use`, `owners`, `ownersBypassCooldown`, `allowedMentions`, `validate`, `autoDefer`, `locales`, `defaultLocale`, `messages`, `onError`, `logLevel`, `logger`, `watch`, `signals`, and `catchUnhandled`.
- `bot.add(...definitions)`, `bot.use(...middleware)`, `bot.load(dir?, bust?)`, `bot.loadLocales(dir?)`, `bot.start(token?)`, `bot.stop()`. `start` resolves the token from its argument, options, or `DISCORD_TOKEN`. `loadDefinitions(dir, bust?)` returns `{definitions, errors}` without registering anything.
- `bot.prepareREST(token?)` loads definitions and plugins without opening a Gateway connection. Use `createInteractionHandler(bot, {publicKey, applicationId?, maxBodyBytes?, maxAge?})` for signed HTTP interactions in a long-running Node process. Mount it as a Fetch Request handler and supply the original raw request.
- `definePlugin({name, requires?, definitions?, use?, setup?})` creates a feature bundle for `createBot({plugins})`. Setup runs before Gateway login or during REST preparation. Return a cleanup callback for reverse-order teardown. `messageCache({maxPerChannel?, lifetime?, interval?})` returns cache and sweeper options for `client`.
- `bot.commandData()` returns a Map keyed by `global` or guild ID. `commandToJSON(def)` previews one definition. `bot.sync({force?, prune?, token?}?)` returns `{scope, count, changed}[]`. Default sync preserves remote-only commands. Prune replaces each selected scope with the local set. `--guild` or `devGuild` restricts the scope. An empty scope with prune clears it.
- `bot.getCommand(name, type?)` resolves same-name commands by type. `bot.planSync({prune?, token?}?)` or `shiver sync --prune --dry-run` reads a remote registration plan. `bot.manifest()` and `shiver manifest` show local registration and routing data. `bot.fetchPermissions({guildId|channelId, userId|roleId, implicit?})` queries Discord. `implicit` applies to channels.
- Use `shiver new <command|component|modal|event|task> <name>` to generate a feature. `bot.handleMessage(message)` dispatches a prefix message directly. `splitPrefix(text, message)` on the bot, root command, or leaf can replace argument tokenization.
- `bot.invoke(ctx, definition, {path?}?)` runs the handler pipeline. `bot.message(key, ...args)` reads built-in message templates. `bot.t(locale, key, vars?)` translates with locale, default locale, then key fallback.
- Inspect `bot.commands`, `owners`, `middleware`, `client`, `store`, `log`, `options`, `summary`, and `intents`. Listen for `ready`, `reload`, `handled(ctx)`, and `error({error, ctx?, id?, event?, task?})`. `createLogger(level?)` provides debug/info/warn/error methods.

## Definitions

| Function | Signature |
| --- | --- |
| `defineCommand` | `({name, description, options?, run(ctx, options), ...metadata, ...guards})`; or `subcommands` instead of `run`; or `{name, type: 'user' \| 'message', run(ctx, target), ...guards}`; or a global `type: 'entryPoint'` definition with an app or Discord handler |
| `defineComponent` | `({id: string \| RegExp, run(ctx, params), ...guards})`; `defineButton` and `defineSelect` are aliases |
| `defineModal` | `({id: string \| RegExp, run(ctx, params), ...guards})`; read inputs in `ctx.fields` |
| `defineEvent` | `({name, once?, filter?(bot, ...discordArgs), run(bot, ...discordArgs)})` |
| `defineTask` | `({name, every, immediate?, run(bot)})`; minimum interval one second |
| `customId` | `(pattern, {placeholder: stringOrNumber}?)`; capture values are strings in handlers |

Guards include `guildOnly`, `dmOnly`, `channelTypes`, `roles`, `ownerOnly`, `nsfw`, `permissions`, `botPermissions`, `entitlement`, `cooldown`, `use`, `defer`, and `ephemeral`. Command metadata includes `type`, `aliases`, `prefix`, `slash`, `guilds`, `defaultMemberPermissions`, `contexts`, `install`, `nameLocalizations`, and `descriptionLocalizations`. Contexts are guild/botDM/privateChannel. Install types are guild/user. Slash names are 1–32 lowercase characters. Groups can nest one level above their subcommands. Runtime permission checks are separate from registration defaults.

Every option builder takes `(description, config?)` or `({description, ...config})`. Use `required`, `default`, choices or autocomplete for string/integer/number, `min/max` for length/numeric bounds, `channelTypes` for channels, `types` for attachments, and localized names/descriptions. An absent option is null or its local default. Prefix parsing is positional and attachments consume files instead of text.

| Builders | Values |
| --- | --- |
| `opt.string`, `opt.integer`, `opt.number`, `opt.boolean` | String, integer, number, boolean |
| `opt.user`, `opt.member`, `opt.channel`, `opt.role`, `opt.mentionable` | Discord objects or resolved API data |
| `opt.attachment` | Discord Attachment |

## Context

`new Context(bot, {interaction?, message?}, data?)` is normally constructed by Shiver. Inspect `bot`, `client`, `store`, `log`, `kind`, `command`, `options`, `params`, `values`, `fields`, `target`, `state`, `ephemeral`, `interaction`, `message`, `isInteraction`, `user`, `member`, `guild`, `guildId`, `channel`, `channelId`, `locale`, `deferred`, and `replied`.

| Method | Behavior |
| --- | --- |
| `reply(input)` | Initial reply, fill a deferred reply, or follow up |
| `edit(input)` | Edit the original reply, or reply/update if unacknowledged |
| `update(input)` | Alias for edit, typically used on component interactions |
| `defer({ephemeral?}?)` | Acknowledge now. Prefix context sends a typing indicator |
| `deferUpdate()` | Acknowledge a component without changing its message |
| `followUp(input)` | Send an additional message |
| `delete()` | Delete the original reply |
| `showModal(modal)` | Open a modal as the first interaction response |
| `awaitModal(modal, {time?}?)` | Open and collect a modal. Return submit context or null |
| `awaitComponent({message?, time?, filter?, anyone?}?)` | Collect a click or selection. Return its context or null |
| `confirm(input, {yes?, no?, danger?, time?}?)` | Append buttons and return true, false, or null on timeout |
| `paginate(pages, {time?, start?, controls?, pageLabel?}?)` | Use an array or lazy `{count, v2?, render(index)}` source with buttons or a select |
| `launchActivity()` | Launch the application's Activity as the first response |
| `t(key, vars?)` | Translate in the context locale |

Message input is a string, component, array of components, or payload object. Use `embed`, `embeds`, `files`, `poll`, `allowedMentions`, `ephemeral`, `silent`, and `suppressEmbeds` as needed. Modal fields are text/radio strings, arrays of selected IDs/values or attachments, checkbox booleans, or null. A deferred response cannot open a modal. Give a collector its message if it isn't the initial reply. Use all V2-compatible content in a paginator when any page uses V2.

Interaction metadata is available through `attachmentSizeLimit`, `installationOwners`, `entitlements`, `memberPermissions`, and `appPermissions`. Use `resolveLocale(ctx, fallback)` to override the language and `ctx.t('group.key')` with flat or nested dictionaries.

## Component and message signatures

| Export | Call |
| --- | --- |
| `ComponentType`, `emoji` | Named numeric constants and `emoji(value)` normalization |
| `text`, `row` | `text(content)`, `row(...children)` |
| `container`, `section` | `container({accent?, color?, spoiler?, raw?}?, ...children)`, `section({accessory, raw?}, ...texts)` |
| `thumbnail`, `gallery` | `thumbnail(url, {alt?, description?, spoiler?}?)`, `gallery(...urlsOrItems)` |
| `file`, `separator` | `file(urlOrUploadName, {spoiler?}?)`, `separator({divider?, spacing?}?)` |
| `button` | `({id, label?, emoji?, style?, disabled?})`, `({url, label?, emoji?, disabled?})`, or `({sku, disabled?})` |
| `select` | `({id, options, placeholder?, min?, max?, disabled?, required?, label?, description?})` |
| `userSelect`, `roleSelect`, `mentionableSelect`, `channelSelect` | Select options without `options`; use `defaults` and `channelTypes` for channels |
| `modal`, `label` | `modal({id, title}, ...children)`, `label({label, description?}, input)` |
| `textInput` | `({id, label?, description?, style?, required?, min?, max?, placeholder?, value?})` |
| `fileUpload` | `({id, label?, description?, min?, max?, required?, types?})` |
| `radioGroup`, `checkboxGroup` | `({id, label?, description?, options, required?})`; checkbox group adds `min/max` |
| `checkbox` | `({id, label?, description?, default?})` |
| `embed`, `poll` | `embed(options?)`, `poll({question, answers, duration?, multi?, allowMultiselect?})` |
| `resolveMessage` | `(input, {mode?, ephemeral?, allowedMentions?, validate?}?)` |
| `validateMessage`, `validateModal` | `validateMessage({content?, embeds?, components?, v2?})`, `validateModal(form)` |
| `componentEmbed`, `withComponentId`, `contentScanFlags` | `componentEmbed(container)` returns inline-safe preview JSON. `withComponentId(component, number)` copies a numeric ID. `contentScanFlags(source)` reads Discord scan flags |

A row holds up to five buttons or one select. A modal accepts up to five top-level blocks. A `label` option on an input wraps it automatically. A section needs an accessory. A file references an actual upload supplied through `files`.

## Stores and middleware

- `new MemoryStore()`, `new JsonStore(path)`, `new SqliteStore(path)`, `scope(store, prefix)`. Stores implement async `get(key)`, `set(key, value, {ttl}?)`, `delete(key)`, `keys(prefix?)`, and optionally `close()`. JSON adds `flush()`. Missing keys return undefined. Store JSON values and use unique keys. SQLite accepts `:memory:`. A scoped view doesn't close its parent.
- `compose(stack, handler)`, `guildOnly()`, `ownerOnly()`, `nsfwOnly()`, `requirePermissions(...permissions)`, `requireBotPermissions(...permissions)`, `requireEntitlement(...skus)`, and `cooldown(duration, {per?, uses?}?)`. Middleware takes `(ctx, next)` and should await `next()` once. Entitlements are checked on Discord interactions. Cooldowns are process-local. `ms(duration)`, `resolveColor(color)`, and `chunk(items, size)` are also exported.
- `dmOnly()`, `channelOnly(...types)`, `requireRoles(...ids)`, and `limitConcurrency(limit, {per}?)` cover direct messages, channel types, all specified roles, and simultaneous handler runs. `cooldown` also accepts `exemptUsers`. Use `autocompleteUse` for middleware on a suggestion callback.

## Offline examples

Save the following as an ESM test module. The runners return `{ctx, replies, last, text, modal, error}`. `runCommand(def, {options?, sub?, target?, clicks?, submit?, ...simulation}?)`, `runPrefix(def, {content?, prefix?, attachments?, ...simulation}?)`, `runComponent(def, {id?, values?, ...simulation}?)`, `runModal(def, {id?, fields?, ...simulation}?)`, and `createTestBot(options?)` use the real handler pipeline and simulated transport.

```js
import assert from 'node:assert/strict';
import {
  defineCommand, defineButton, defineSelect, defineComponent, defineModal,
  defineEvent, defineTask, customId, commandToJSON, opt, row, button, select,
  userSelect, roleSelect, mentionableSelect, channelSelect, container, section,
  text, thumbnail, gallery, file, separator, modal, label, textInput,
  fileUpload, radioGroup, checkboxGroup, checkbox, embed, poll, emoji,
  ComponentType, resolveMessage, validateMessage, validateModal,
  MemoryStore, JsonStore, SqliteStore, scope, compose, guildOnly, ownerOnly,
  nsfwOnly, requirePermissions, requireBotPermissions, requireEntitlement,
  cooldown, chunk, ms, resolveColor, createLogger,
} from 'shiver-framework';
import { createTestBot, runCommand, runComponent, runModal } from 'shiver-framework/testing';

const bot = createTestBot();
const command = defineCommand({
  name: 'hello', description: 'Say hello',
  options: { name: opt.string('Name', { required: true }) },
  run: (ctx, { name }) => ctx.reply(container(text(name), button({ id: 'more:42', label: 'More' }))),
});
const more = defineButton({ id: 'more:{id}', run: (ctx, { id }) => ctx.update(container(id)) });
const pick = defineSelect({ id: 'pick', run: (ctx) => ctx.update(ctx.values.join(', ')) });
const form = defineModal({ id: 'form', run: (ctx) => ctx.reply(String(ctx.fields.name)) });
bot.add(command, more, pick, form, defineComponent({ id: 'close', run: (ctx) => ctx.delete() }),
  defineEvent({ name: 'ready', once: true, run() {} }),
  defineTask({ name: 'refresh', every: '1m', run() {} }));
assert.equal(commandToJSON(command).name, 'hello');
assert.match((await runCommand(command, { bot, options: { name: 'Ada' } })).text, /Ada/);
assert.equal((await runComponent(more, { bot, id: customId('more:{id}', { id: 42 }) })).text, '42');
assert.equal((await runComponent(pick, { bot, values: ['one'] })).text, 'one');
assert.equal((await runModal(form, { bot, fields: { name: 'Ada' } })).text, 'Ada');

const options = [
  opt.integer('Count'), opt.number('Ratio'), opt.boolean('Enabled'), opt.user('User'),
  opt.member('Member'), opt.channel('Channel'), opt.role('Role'), opt.mentionable('Target'),
  opt.attachment('File'),
];
assert.equal(options.length, 9);

const img = 'https://example.com/image.png';
const card = container(
  section({ accessory: thumbnail(img) }, 'Details'), gallery(img), separator(),
  file('report.txt'), row(button({ id: 'close', label: 'Close' })),
);
assert.equal(card.type, ComponentType.Container);
assert.ok(resolveMessage(card).flags);
validateMessage({ components: [card], v2: true });
const menus = [select({ id: 'pick', options: ['one'] }), userSelect({ id: 'u' }),
  roleSelect({ id: 'r' }), mentionableSelect({ id: 'm' }), channelSelect({ id: 'c' })];
assert.equal(menus.length, 5);
const dialog = modal({ id: 'form', title: 'Details' },
  label({ label: 'Name' }, textInput({ id: 'name' })),
  fileUpload({ id: 'files', label: 'Files', required: false }),
  radioGroup({ id: 'choice', label: 'Choice', options: ['One', 'Two'] }),
  checkboxGroup({ id: 'group', label: 'Group', options: ['One'] }),
  checkbox({ id: 'ok', label: 'OK' }));
validateModal(dialog);
assert.equal(embed({ title: 'Summary' }).title, 'Summary');
assert.equal(poll({ question: 'Lunch?', answers: ['A', 'B'] }).answers.length, 2);
assert.equal(emoji('123456789012345678').id, '123456789012345678');

const flow = defineCommand({ name: 'flow', description: 'Try replies', async run(ctx) {
  await ctx.defer({ ephemeral: true });
  await ctx.reply('Working');
  await ctx.edit('Ready');
  await ctx.followUp(ctx.t('Done'));
  await ctx.delete();
} });
assert.deepEqual((await runCommand(flow)).replies.map(({ method }) => method),
  ['defer', 'edit', 'edit', 'followUp', 'delete']);
const collect = defineCommand({ name: 'collect', description: 'Collect', async run(ctx) {
  const sent = await ctx.reply(row(button({ id: 'next', label: 'Next' })));
  const click = await ctx.awaitComponent({ message: sent, time: '5s' });
  if (click) {
    await click.deferUpdate();
    await click.update('Done');
  }
} });
assert.equal((await runCommand(collect, { clicks: ['next'] })).text, 'Next\nDone');
const ask = defineCommand({ name: 'ask', description: 'Ask', async run(ctx) {
  const submission = await ctx.awaitModal(dialog);
  if (submission) await submission.reply(String(submission.fields.name));
} });
assert.equal((await runCommand(ask, { submit: { name: 'Ada' } })).last.text, 'Ada');
const open = defineCommand({ name: 'open', description: 'Open', run: (ctx) => ctx.showModal(dialog) });
assert.equal((await runCommand(open)).modal.custom_id, 'form');
const confirm = defineCommand({ name: 'confirm', description: 'Confirm', run: (ctx) => ctx.confirm(container('Sure?')) });
assert.equal((await runCommand(confirm, { clicks: ['shiver:confirm:yes'] })).last.text, 'Sure?');
const pages = defineCommand({ name: 'pages', description: 'Pages', run: (ctx) => ctx.paginate(['First', container('Second')]) });
assert.match((await runCommand(pages, { clicks: ['shiver:page:next'] })).last.text, /Second/);

const store = scope(new MemoryStore(), 'app');
await store.set('enabled', true, { ttl: '1m' });
assert.deepEqual(await store.keys(), ['enabled']);
assert.equal(await store.get('enabled'), true);
assert.equal(await store.delete('enabled'), true);
assert.equal(typeof JsonStore, 'function');
const sqlite = new SqliteStore(':memory:');
await sqlite.set('enabled', true);
assert.equal(await sqlite.get('enabled'), true);
await sqlite.close();
const guards = [guildOnly(), ownerOnly(), nsfwOnly(), requirePermissions('ManageGuild'),
  requireBotPermissions('SendMessages'), requireEntitlement('100000000000000001'),
  cooldown('10s', { per: 'guild', uses: 2 })];
assert.equal(typeof compose(guards, () => {}), 'function');
assert.deepEqual(chunk([1, 2], 1), [[1], [2]]);
assert.equal(ms('2s'), 2000);
assert.equal(resolveColor('#fff'), 0xffffff);
assert.equal(typeof createLogger('silent').info, 'function');
await bot.stop();
```

## Common errors

`ShiverError` has a stable `code`. `UserError(textOrPayload)` sends a controlled private interaction reply and skips generic error reporting.

| Code | Fix |
| --- | --- |
| `INVALID_COMMAND` | Fix command/option names, descriptions, builders, choices, or subcommand structure |
| `INVALID_HANDLER` | Supply a valid ID and handler function |
| `INVALID_EVENT`, `INVALID_TASK` | Supply name/run and a valid task interval |
| `INVALID_COMPONENT` | Fix missing label/accessory/input options, missing custom ID values, or an oversized generated ID |
| `INVALID_MESSAGE` | Correct the named payload or modal limit, or remove content/embeds/polls from a V2 message |
| `INVALID_DEFINITION`, `DUPLICATE`, `LOAD_FAILED` | Export valid, unique definitions and resolve the reported file errors |
| `INVALID_DURATION`, `INVALID_COLOR` | Use valid numeric or string durations and colors |
| `INVALID_PLUGIN`, `INVALID_CACHE`, `INVALID_HTTP_CONFIG` | Fix plugin dependencies or setup, cache limits, or interaction endpoint settings |
| `INVALID_GUARD`, `INVALID_PERMISSION_TARGET` | Correct middleware limits or the permission query scope and subject |
| `UNSUPPORTED` | Open the modal before acknowledgement from a supported interaction, or give the collector a reply to listen on |
| `NO_MATCH` | Match the test interaction ID against the definition |
| `ALREADY_STARTED`, `NO_TOKEN`, `DISALLOWED_INTENTS` | Correct lifecycle, token configuration, or privileged intents |

See `docs/` for examples by topic and `types/` for the public declarations.
