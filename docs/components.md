Build buttons, selects, Components V2 layouts, and modals as plain objects, and route their interactions to handlers by custom id.

# Components and modals

Component functions such as `button()` and `container()` return plain Discord API objects. You put them in a message, and you handle the resulting clicks and submissions with `defineComponent` and `defineModal`, matched by custom id.

```js
import { button, defineCommand, defineComponent, row } from 'shiver-framework';

export default defineCommand({
  name: 'greet',
  description: 'Show a greeting button',
  run: (ctx) => ctx.reply({
    content: 'Press the button.',
    components: [row(button({ id: 'greet:hello', label: 'Say hello', style: 'primary' }))],
  }),
});

export const hello = defineComponent({
  id: 'greet:hello',
  run: (ctx) => ctx.update({ content: `Hello, ${ctx.user.username}.`, components: [] }),
});
```

The handler is found by id, not by a listener attached to one message. It keeps working after a restart and for every message that carries the id.

## Handle a click

`defineComponent({ id, run })` handles buttons and selects. `defineButton` and `defineSelect` are the same function under clearer names.

Inside the handler:

| Call | Result |
| --- | --- |
| `ctx.update(message)` | Replaces the message the component is attached to |
| `ctx.reply(message)` | Sends a new message and leaves the original as it is |
| `ctx.deferUpdate()` | Acknowledges the click without changing anything yet |
| `ctx.showModal(modal)` | Opens a modal. It must be the first response |

`ctx.message` is the message that holds the component, and `ctx.user` is the person who clicked. Anyone who can see the message can click it.

> **Warning**
> Discord expects a response within three seconds. If the handler does slow work first, set `defer: 'update'` on the definition or call `ctx.deferUpdate()` at the top.

## Pass data through the custom id

Use `{name}` placeholders in the handler id to carry state in the button itself. The captured values arrive as the second argument and as `ctx.params`. They are always strings.

```js
import { button, container, defineCommand, defineComponent, separator } from 'shiver-framework';

const view = (count) => container(
  { accent: 'blurple' },
  `## Counter\nCurrent value: **${count}**`,
  separator(),
  button({ id: `counter:add:${count}`, label: '+1', style: 'primary' }),
  button({ id: 'counter:reset', label: 'Reset' }),
);

export default defineCommand({
  name: 'counter',
  description: 'A counter with buttons',
  run: (ctx) => ctx.reply(view(0)),
});

export const add = defineComponent({
  id: 'counter:add:{count}',
  run: (ctx, { count }) => ctx.update(view(Number(count) + 1)),
});

export const reset = defineComponent({
  id: 'counter:reset',
  run: (ctx) => ctx.update(view(0)),
});
```

`customId(pattern, values)` fills a pattern and checks the result: `customId('ticket:{id}:{action}', { id: 42, action: 'close' })` returns `'ticket:42:close'`. It throws when a value is missing or the result is too long.

> **Warning**
> A custom id holds at most 100 characters. Put short keys in it, such as IDs, and keep larger state in the [store](store.md).

When several handlers could match, an exact id wins over a pattern, and patterns are tried in the order they were registered. A placeholder matches any text, including colons.

### Match ids with a regular expression

Pass a `RegExp` when a placeholder is too permissive. Named groups become the parameters:

```js
import { defineComponent } from 'shiver-framework';

export default defineComponent({
  id: /^ticket:(?<number>\d+)$/,
  run: (ctx, { number }) => ctx.update(`Ticket ${number} selected.`),
});
```

Anchor the expression with `^` and `$` so that it matches the whole id.

### Let only one user click

Put the user ID in the custom id and compare it in the handler:

```js
import { button, container, defineCommand, defineComponent, UserError } from 'shiver-framework';

export default defineCommand({
  name: 'ticket',
  description: 'Open a ticket',
  run: (ctx) => ctx.reply(container(
    'Your ticket is open.',
    button({ id: `ticket:close:${ctx.user.id}`, label: 'Close', style: 'danger' }),
  )),
});

export const close = defineComponent({
  id: 'ticket:close:{owner}',
  run: (ctx, { owner }) => {
    if (ctx.user.id !== owner) throw new UserError('Only the ticket owner can close this.');
    return ctx.update(container('Ticket closed.'));
  },
});
```

A [`UserError`](errors.md#show-a-message-to-the-user) is shown privately to the person who clicked.

## Add a select menu

`select` takes a list of options. The handler reads the chosen values from `ctx.values`, which is always an array of strings:

```js
import { defineCommand, defineSelect, select } from 'shiver-framework';

export default defineCommand({
  name: 'color',
  description: 'Pick your favorite colors',
  run: (ctx) => ctx.reply({
    content: 'Choose up to two.',
    components: [select({
      id: 'color:pick',
      placeholder: 'Colors',
      max: 2,
      options: ['Red', 'Green', { label: 'Blue', value: 'blue', description: 'The calm one' }],
    })],
  }),
});

export const pick = defineSelect({
  id: 'color:pick',
  run: (ctx) => ctx.update({ content: `You picked ${ctx.values.join(', ')}.`, components: [] }),
});
```

A string option is used as both label and value. `userSelect`, `roleSelect`, `mentionableSelect`, and `channelSelect` let the user pick from the server instead, and put the selected IDs in `ctx.values`.

You may pass buttons and selects without `row()`. Loose buttons are grouped into rows of five and each select gets its own row.

## Lay out a message with Components V2

`container`, `section`, `text`, `thumbnail`, `gallery`, `file`, and `separator` build rich layouts. Strings inside a container or section become `text()` components, and their content supports Markdown.

```js
import { button, container, defineCommand, gallery, section, separator, thumbnail } from 'shiver-framework';

export default defineCommand({
  name: 'profile',
  description: 'Show your profile card',
  run: (ctx) => ctx.reply(container(
    { accent: '#5865f2' },
    section(
      { accessory: thumbnail(ctx.user.displayAvatarURL(), { alt: 'Avatar' }) },
      `## ${ctx.user.username}`,
      'Member of the month',
    ),
    separator({ spacing: 'large' }),
    gallery('https://example.com/banner-1.png', 'https://example.com/banner-2.png'),
    button({ id: 'profile:refresh', label: 'Refresh' }),
    button({ url: 'https://example.com/profile', label: 'Open on the web' }),
  )),
});
```

The framework sets Discord's Components V2 flag when a message contains any of these components. You can pass the component directly to `ctx.reply`, or use `{ components: [...] }` when you also need `files` or `ephemeral`.

> **Warning**
> A Components V2 message cannot also have `content`, `embeds`, or a `poll`. Discord rejects the mix, and so does the framework with `INVALID_MESSAGE`. Put the text inside the layout with `text('...')` or a plain string.

To show an uploaded file in the layout, attach it with `files` and reference it by name:

```js
import { container, defineCommand, file } from 'shiver-framework';

export default defineCommand({
  name: 'export',
  description: 'Export your data',
  run: (ctx) => ctx.reply({
    components: [container('Your export is ready.', file('export.json'))],
    files: [{ attachment: Buffer.from(JSON.stringify({ user: ctx.user.id })), name: 'export.json' }],
    ephemeral: true,
  }),
});
```

## Collect input with a modal

Build a modal with `modal({ id, title }, ...inputs)` and open it with `ctx.showModal`. Handle the submission with `defineModal` and read the values from `ctx.fields`, keyed by input id:

```js
import { defineCommand, defineModal, modal, radioGroup, textInput } from 'shiver-framework';

export default defineCommand({
  name: 'feedback',
  description: 'Send feedback to the bot owner',
  run: (ctx) => ctx.showModal(modal(
    { id: 'feedback', title: 'Feedback' },
    radioGroup({ id: 'kind', label: 'What is this about?', options: ['Bug', 'Idea', 'Other'] }),
    textInput({ id: 'body', label: 'Details', style: 'paragraph', max: 1000 }),
  )),
});

export const submit = defineModal({
  id: 'feedback',
  ephemeral: true,
  run: async (ctx) => {
    const { kind, body } = ctx.fields;
    await ctx.store.set(`feedback:${Date.now()}`, { kind, body, user: ctx.user.id });
    await ctx.reply('Thanks. Your feedback was saved.');
  },
});
```

Every input needs a label. Pass `label` (and optionally `description`) to the input, or wrap it yourself with `label({ label: 'Name' }, textInput({ id: 'name' }))`. A plain string between inputs becomes a block of text.

> **Warning**
> `ctx.showModal` must be the first response to an interaction. It fails with `UNSUPPORTED` after a reply or a deferral, including one caused by `defer: true` on the definition. With the `autoDefer` option on, set `defer: false` on handlers that open a modal. Modals cannot be opened from chat commands or from a modal submission.

Modal ids accept the same `{name}` placeholders and regular expressions as component ids, so a modal can carry state too: `modal({ id: 'note:edit:42', title: 'Edit note' }, ...)` reaches `defineModal({ id: 'note:edit:{id}', run })`.

### Values in ctx.fields

| Input | Value |
| --- | --- |
| `textInput` | `string` |
| `radioGroup` | `string`, the chosen value |
| `checkbox` | `boolean` |
| `select`, `checkboxGroup` | `string[]` |
| `userSelect`, `roleSelect`, `mentionableSelect`, `channelSelect` | `string[]` of IDs |
| `fileUpload` | Array of discord.js `Attachment` |

A field the user left empty can be `null` or an empty string or array, depending on the input.

## Wait for a click or a submission inline

For short flows that belong to one command, wait inside the handler instead of defining a separate handler.

`ctx.awaitComponent` resolves with a new context when the invoking user clicks something on the reply, or `null` on timeout:

```js
import { button, defineCommand, row } from 'shiver-framework';

export default defineCommand({
  name: 'coin',
  description: 'Call a coin toss',
  run: async (ctx) => {
    await ctx.reply({
      content: 'Heads or tails?',
      components: [row(
        button({ id: 'coin:heads', label: 'Heads' }),
        button({ id: 'coin:tails', label: 'Tails' }),
      )],
    });
    const click = await ctx.awaitComponent({ time: '30s' });
    if (!click) return ctx.edit({ content: 'Too slow.', components: [] });
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = click.interaction.customId === `coin:${result}`;
    return click.update({ content: `It was ${result}. You ${won ? 'win' : 'lose'}.`, components: [] });
  },
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `time` | `'5m'` | How long to wait |
| `message` | the reply | The message to listen on. Pass it when you are not waiting on the first reply |
| `filter` | none | `(ctx) => boolean`, called with a context for each click |
| `anyone` | `false` | Accept clicks from other users. Otherwise they are told the component is not theirs |

Respond on the returned context right away. A click that no `defineComponent` handles receives the `expired` message after 2.5 seconds unless something has acknowledged it.

`ctx.awaitModal(modal, { time })` opens a modal and resolves with the submission context, or `null` when the user does not submit within `time` (default `'10m'`):

```js
import { defineCommand, modal, textInput } from 'shiver-framework';

export default defineCommand({
  name: 'rename',
  description: 'Rename this channel',
  guildOnly: true,
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  run: async (ctx) => {
    const form = modal(
      { id: 'rename', title: 'Rename channel' },
      textInput({ id: 'name', label: 'New name', max: 100, value: ctx.channel.name }),
    );
    const submitted = await ctx.awaitModal(form, { time: '2m' });
    if (!submitted) return;
    await ctx.channel.setName(submitted.fields.name);
    await submitted.reply(`Renamed to ${submitted.fields.name}.`);
  },
});
```

Reply on the returned context to acknowledge the submission. For yes or no questions and paging, use the ready-made [`ctx.confirm`](messages.md#ask-for-confirmation) and [`ctx.paginate`](messages.md#split-content-into-pages).

Inline waits live in memory and end when the process restarts. Use `defineComponent` and `defineModal` for anything that must survive a restart.

## Guard or defer a handler

Component and modal definitions accept the same guard fields as commands, plus `ephemeral` and `defer`:

```js
import { defineComponent } from 'shiver-framework';

export default defineComponent({
  id: 'mod:slowmode:{seconds}',
  guildOnly: true,
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  cooldown: '5s',
  defer: 'update',
  run: async (ctx, { seconds }) => {
    await ctx.channel.setRateLimitPerUser(Number(seconds));
    await ctx.edit({ content: `Slow mode set to ${seconds} seconds.`, components: [] });
  },
});
```

| `defer` value | Acknowledgement before `run` |
| --- | --- |
| `'update'` | Deferred update. `ctx.edit` or `ctx.update` then changes the original message |
| `true` | Deferred new reply. `ctx.reply` fills it in |
| `'ephemeral'` | Deferred private reply |

The guard fields are described in [Middleware](middleware.md#guard-reference).

## Component reference

### Where each component is allowed

The limits column lists what the framework checks before a message or modal is sent. Violations throw `INVALID_MESSAGE` with the path of the component.

| Function | Type | In a message | In a modal | Limits checked |
| --- | --- | --- | --- | --- |
| `row(...children)` | 1 | Top level or inside a container | Only as a legacy row holding one text input | At least 1 child. Up to 5 buttons, or exactly 1 select |
| `button(options)` | 2 | Inside a row, or as a section accessory | No | Label up to 80 characters. Link URL up to 512. Custom id 1 to 100, unique in the message |
| `select(options)` | 3 | Inside a row | Inside a label | 1 to 25 options. Option label 1 to 100, value up to 100, description up to 100. Custom id 1 to 100, unique |
| `textInput(options)` | 4 | No | Inside a label | Value up to 4000 characters. Placeholder up to 100. Custom id 1 to 100, unique |
| `userSelect(options)` | 5 | Inside a row | Inside a label | Custom id 1 to 100, unique |
| `roleSelect(options)` | 6 | Inside a row | Inside a label | Custom id 1 to 100, unique |
| `mentionableSelect(options)` | 7 | Inside a row | Inside a label | Custom id 1 to 100, unique |
| `channelSelect(options)` | 8 | Inside a row | Inside a label | Custom id 1 to 100, unique |
| `section(options, ...texts)` | 9 | Top level or inside a container (V2) | No | 1 to 3 text children. Requires a thumbnail or button accessory |
| `text(content)` | 10 | Top level, in a container, or in a section (V2) | Top level | Message: not empty, and 4000 characters across all text in the message. Modal: 1 to 4000 characters per block |
| `thumbnail(url, options?)` | 11 | Only as a section accessory | No | None beyond placement |
| `gallery(...items)` | 12 | Top level or inside a container (V2) | No | 1 to 10 items |
| `file(name, options?)` | 13 | Top level or inside a container (V2) | No | Must reference an upload as `attachment://name` |
| `separator(options?)` | 14 | Top level or inside a container (V2) | No | None |
| `container(options?, ...children)` | 17 | Top level only (V2) | No | Cannot be nested |
| `label(options, input)` | 18 | No | Top level | Label 1 to 45 characters. Description up to 100. Wraps exactly one input |
| `fileUpload(options)` | 19 | No | Inside a label | `max` up to 10 files. Custom id 1 to 100, unique |
| `radioGroup(options)` | 21 | No | Inside a label | 2 to 10 options, with the same option limits as `select` |
| `checkboxGroup(options)` | 22 | No | Inside a label | 1 to 10 options, with the same option limits as `select` |
| `checkbox(options)` | 23 | No | Inside a label | Custom id 1 to 100, unique |

`ComponentType` exports these numbers by name, for example `ComponentType.Container`.

### Limits for a whole message or modal

| Scope | Limit |
| --- | --- |
| Message without V2 components | Top-level components must be rows. At most 5 rows |
| Message with V2 components | At most 40 components, counting nested ones. At most 4000 characters of text in total |
| Modal | Custom id 1 to 100 characters. Title 1 to 45. 1 to 5 top-level components |
| Numeric component ids | Whole numbers from 0 to 4294967295, unique when set |

These checks cover the common limits, not every Discord rule. Turn them off with the [`validate` option](configuration.md#options-reference).

### Options for each function

`id` is always the custom id that your handler matches.

| Function | Options |
| --- | --- |
| `button` | `id`, `label`, `emoji`, `style` (`'primary'`, `'secondary'`, `'success'`, `'danger'`, default `'secondary'`), `disabled`. A button needs a `label` or an `emoji` |
| `button` (link) | `url`, `label`, `emoji`, `disabled`. Opens the URL and calls no handler |
| `button` (purchase) | `sku`, `disabled`. Opens the store page for the SKU |
| `select` | `id`, `options`, `placeholder`, `min`, `max`, `disabled`, `required`. Each option is a string or `{ label, value, description, emoji, default }` |
| `userSelect`, `roleSelect`, `channelSelect` | `id`, `placeholder`, `min`, `max`, `disabled`, `required`, `defaults` (array of IDs). `channelSelect` also takes `channelTypes` |
| `mentionableSelect` | The same, with `defaults` written as `{ id, type: 'user' \| 'role' }` |
| `container` | `accent` or `color` (number, hex string, or color name), `spoiler`, `raw` |
| `section` | `accessory` (a `thumbnail`, a `button`, or an image URL), `raw` |
| `thumbnail` | Second argument: `alt` or `description`, `spoiler` |
| `gallery` | Each item is a URL or `{ url, alt, spoiler }` |
| `file` | A file name from `files`, or a full `attachment://` URL. Second argument: `spoiler` |
| `separator` | `divider` (boolean), `spacing` (`'small'` or `'large'`) |
| `modal` | `id`, `title` |
| `label` | `label`, `description` |
| `textInput` | `id`, `style` (`'short'` or `'paragraph'`, default `'short'`), `min`, `max`, `required`, `value`, `placeholder` |
| `fileUpload` | `id`, `min`, `max`, `required`, `types` (`'image'`, `'video'`, `'audio'`, or extensions such as `'.pdf'`, at most 10) |
| `radioGroup` | `id`, `options`, `required`. Each option is a string or `{ label, value, description, default }` |
| `checkboxGroup` | `id`, `options`, `min`, `max`, `required` |
| `checkbox` | `id`, `default` |

Every modal input and every select also accepts `label` and `description`, which wrap it in a `label` for use in a modal. Do not set `label` on a select that goes in a message.

Color names are `blurple`, `green`, `yellow`, `fuchsia`, `red`, `white`, `black`, `gray`, `grey`, `orange`, `blue`, `purple`, `pink`, and `teal`.

`raw` on `container` and `section` is merged into the returned object, for Discord fields the function does not cover. Every function returns a plain object, so you can also edit the result directly.

### Other exports

| Export | Purpose |
| --- | --- |
| `customId(pattern, values)` | Fills `{name}` placeholders and enforces the 100-character limit |
| `emoji(value)` | Turns a Unicode emoji, `<:name:id>` markup, or an emoji ID into the object Discord expects. `button` and `select` call it for you |
| `withComponentId(component, number)` | Returns a copy with Discord's numeric `id` set |
| `resolveColor(color)` | Converts a color name, hex string, or number to the integer Discord expects. Throws `INVALID_COLOR` for anything else |
| `validateMessage(payload)`, `validateModal(modal)` | Run the limit checks yourself |
| `componentEmbed(container)` | Serializes a container as link-preview JSON. See below |

## Publish a link preview

Discord can render a Components V2 layout as the preview of a web page. `componentEmbed(container(...))` returns the JSON to embed in the page head:

```js
import { button, componentEmbed, container } from 'shiver-framework';

const json = componentEmbed(container(
  '**Release notes**',
  button({ url: 'https://example.com/releases', label: 'Open' }),
));

const html = `<script id="discord:component-embed" type="application/json">${json}</script>`;
```

The function escapes `<` for safe inlining and throws `INVALID_MESSAGE` when the layout is not displayable as a preview: only containers, sections, text, thumbnails, galleries, separators, and link buttons are allowed, media and link URLs must be absolute `http` or `https` URLs of at most 2048 characters, a preview holds at most 10 gallery items, and the JSON may not exceed 3000 bytes. See Discord's [component embeds](https://docs.discord.com/developers/link-previews/component-embeds) documentation for how pages are discovered.

## Common mistakes

| Error | Cause | Fix |
| --- | --- | --- |
| `INVALID_MESSAGE`: `This message uses Components V2 (container, section, text, gallery, file or separator), so it cannot also have "content", "embeds" or "poll".` | A V2 component next to `content`, an embed, or a poll | Move the text into the layout with `text()` |
| `INVALID_MESSAGE`: `custom id "x" is used twice in one message. Each component needs a unique id.` | Two components share an id | Add a distinguishing part, such as an index |
| `INVALID_MESSAGE`: `a row holds either up to 5 buttons or exactly 1 select, not both. Put the select in its own row().` | A select and a button in one `row()` | Use two rows, or pass them loose |
| `INVALID_MESSAGE`: `a message holds at most 5 rows, got 6. Use Components V2 (container/text) for up to 40 components.` | More than 25 buttons without V2 | Wrap the components in a `container` |
| `INVALID_MESSAGE`: `modal components cannot appear in a message.` | A `textInput`, a `checkbox`, or a select with a `label` was put in a message | Remove `label`, or move the input to a modal |
| `INVALID_MESSAGE`: `file() only shows uploaded attachments: file("attachment://name.ext") with the file in "files".` | `file()` was given a web URL | Upload the file with `files` and reference its name |
| `INVALID_COMPONENT`: `button({ id: "x" }) needs a "label" or an "emoji".` | A button with neither | Add one |
| `INVALID_COMPONENT`: `section() needs an accessory` | A section without a thumbnail or button | Add `accessory`, or use `text()` |
| `INVALID_COMPONENT`: `Modal "x": inputs need a label.` | A modal input without `label` | Pass `label` to the input |
| `INVALID_COMPONENT`: `customId("...") produced 120 characters; Discord allows 100. Store the data and pass a short key.` | Too much state in the id | Save the state in the store and put its key in the id |
| `INVALID_HANDLER`: `defineComponent() needs a string or RegExp "id" pattern` | A handler without `id` | Add the id your component uses |
| `DUPLICATE`: `Two component handlers use the id "x"` | Two definitions with the same id or pattern | Keep one |
| `UNSUPPORTED`: `showModal() must be the first response.` | The interaction was already replied to or deferred | Remove the earlier reply, `defer: true`, or auto-defer for this handler |
| The user sees `This has expired. Run the command again.` | No handler matches the custom id, or an inline wait did not respond in time | Check the id against your `defineComponent` patterns |
