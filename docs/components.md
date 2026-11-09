Component helpers return plain Discord API JSON for message layouts, interactions, and modal inputs.

# Components and modals

| Type | Export | Placement |
| --- | --- | --- |
| 1 | `row(...children)` | Message row; legacy modal rows accepted for compatibility |
| 2 | `button(options)` | Message row or section accessory |
| 3 | `select(options)` | Message row or labelled modal field |
| 4 | `textInput(options)` | Modal field |
| 5 | `userSelect(options)` | Message row or labelled modal field |
| 6 | `roleSelect(options)` | Message row or labelled modal field |
| 7 | `mentionableSelect(options)` | Message row or labelled modal field |
| 8 | `channelSelect(options)` | Message row or labelled modal field |
| 9 | `section(options, ...texts)` | V2 message |
| 10 | `text(content)` | V2 message or modal text block |
| 11 | `thumbnail(url, options?)` | Message section accessory |
| 12 | `gallery(...items)` | V2 message |
| 13 | `file(url, options?)` | V2 message, uploaded attachment only |
| 14 | `separator(options?)` | V2 message |
| 15 | No helper | Unassigned in Shiver |
| 16 | No helper | Unassigned in Shiver |
| 17 | `container(options?, ...children)` | V2 message top level |
| 18 | `label(options, input)` | Modal wrapper |
| 19 | `fileUpload(options)` | Modal field |
| 20 | No helper | Unassigned in Shiver |
| 21 | `radioGroup(options)` | Modal field |
| 22 | `checkboxGroup(options)` | Modal field |
| 23 | `checkbox(options)` | Modal field |

`ComponentType` exposes the named numbers above. `emoji(value)` normalizes Unicode, custom markup, IDs, or emoji objects. Children flatten arrays, discard null/false/undefined/empty strings, and convert strings to `text()`. Loose buttons group five per row; selects receive their own rows. Input options use `id`; returned JSON uses `custom_id`.

`withComponentId(component, number)` copies a component with Discord's separate numeric ID. Positive IDs must be unique across the message or modal. Discord assigns an ID when it is omitted or zero. Continue routing clicks and modal submits by the string `custom_id`.

Save under the starter's `src/`:

```js
import {defineCommand, defineComponent, container, section, thumbnail, button, separator, gallery} from 'shiver-framework';
export const card = defineCommand({
  name: 'card', description: 'Show a card',
  run: ctx => ctx.reply(container({accent: 'blurple'},
    section({accessory: thumbnail('https://cdn.discordapp.com/embed/avatars/0.png')}, '**Profile**'),
    separator({spacing: 'small'}),
    gallery('https://cdn.discordapp.com/embed/avatars/0.png'),
    button({id: 'card:close', label: 'Close', style: 'danger'}),
  )),
});
export const close = defineComponent({id: 'card:close', run: ctx => ctx.update(container('Closed'))});
```

V2 is detected by layout/content components and flagged automatically. It cannot contain message `content`, embeds, or polls. Legacy messages permit five rows. A row holds up to five buttons or one select. V2 permits 40 components including nested rows, accessories, and containers; text displays share 4000 characters. Containers cannot nest. Sections have 1-3 texts and one thumbnail/button accessory. Galleries have 1-10 items. Button labels are at most 80 characters, URLs 512. Custom ids are 1-100 characters and unique within a message/modal. These are principal locally checked limits; Discord may reject other fields/placements.

Button options: `{id, label, style, emoji, disabled}`, `{url, label, emoji, disabled}` for links, or `{sku, disabled}` for purchases. Interactive styles: primary/secondary/success/danger or 1-4. Link/purchase buttons do not invoke handlers.

Select options share `{id, placeholder, min, max, disabled, required, label, description}`. `select` adds 1-25 `options`: strings or `{label, value, description, emoji, default}`. Auto selects use `defaults` IDs; mentionable defaults require `{id, type: 'user' | 'role'}`. `channelSelect` supports `channelTypes`. Handlers read selections from `ctx.values`.

`container` supports `accent`/`color`, `spoiler`, `raw`; `section` supports `accessory`, `raw`. Thumbnail/gallery items accept `description`/`alt`, `spoiler`. `separator` accepts `divider`, `spacing: 'small' | 'large' | 1 | 2`. `file('report.pdf')` means `attachment://report.pdf` and needs that upload in `files`. For new API fields, modify returned JSON or use supported `raw` layout options.

## Modals

Open a modal as the first interaction response, without reply/defer. Prefix commands cannot open modals. Modals have 1-5 top-level labels/text blocks, title 1-45 characters, labels 1-45, descriptions up to 100. Passing `label` to an input wraps it automatically; otherwise use `label({label: 'Name'}, input)`.

```js
import {defineCommand, defineModal, modal, textInput, select, checkbox, fileUpload} from 'shiver-framework';
export const form = defineCommand({
  name: 'feedback', description: 'Send feedback',
  run: ctx => ctx.showModal(modal({id: 'feedback', title: 'Feedback'},
    textInput({id: 'body', label: 'Message', style: 'paragraph', max: 4000}),
    select({id: 'topic', label: 'Topic', options: ['Bug', 'Idea']}),
    checkbox({id: 'contact', label: 'May we contact you?', default: false}),
    fileUpload({id: 'files', label: 'Evidence', required: false, max: 2}),
  )),
});
export const submitted = defineModal({id: 'feedback', run: ctx => ctx.reply({content: JSON.stringify(ctx.fields), ephemeral: true})});
```

`textInput`: short/paragraph (1/2), min/max length, required, placeholder (100), value (4000). `fileUpload`: min/max (up to 10), required, `types`. `radioGroup`: 2-10 string/object options; `checkboxGroup`: 1-10 plus min/max selections. Options are strings or `{label, value, description, default}`. `checkbox` has a boolean `default`.

`ctx.fields[id]` is text/radio string, select/checkbox-group string array, checkbox boolean, upload Attachment array, or null when absent. `await ctx.awaitModal(form, {time: '10m'})` returns a new Context or null. Reply on that context to acknowledge submission. `customId('ticket:{id}', {id: 42})` fills placeholders; component/modal handlers receive captured strings in their second argument and `ctx.params`.

## Route IDs with regular expressions

Use a RegExp for validation beyond a string placeholder. Named captures become `ctx.params`. Exact IDs are checked first, then patterns in registration order. Anchor the expression to match the whole ID.

```js
import { defineComponent } from 'shiver-framework';
export default defineComponent({
  id: /^ticket:(?<number>\d+)$/,
  run: (ctx, { number }) => ctx.update(`Ticket ${number}`),
});
```

## Website link previews

`componentEmbed(container(...))` serializes a display-only Components V2 preview for Discord. Put the result in a server-rendered `<script id="discord:component-embed" type="application/json">` element in the page head, or serve it as linked JSON. The helper escapes text for inline embedding and enforces Discord's 3,000-byte limit, supported components, absolute media URLs, and the combined gallery cap. Use link buttons and keep the page's Open Graph metadata for fallback. [Discord component embeds](https://docs.discord.com/developers/link-previews/component-embeds)

```js
import { button, componentEmbed, container } from 'shiver-framework';
const json = componentEmbed(container(
  '**Release notes**',
  button({ url: 'https://example.com/releases', label: 'Open' }),
));
console.log(json);
```
