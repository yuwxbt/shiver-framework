Messages accept text, plain component JSON, or an object with Discord send fields and Shiver shortcuts.

# Messages

## Reply payloads

Save this in a starter feature file:

```js
import {defineCommand, embed} from 'shiver-framework';
export default defineCommand({
  name: 'report', description: 'Show a report', ephemeral: true,
  run: ctx => ctx.reply({
    content: 'Report ready',
    embeds: [embed({title: 'Daily report', description: 'All checks passed', color: 'green', footer: 'Shiver', timestamp: true})],
    files: [{attachment: Buffer.from('All checks passed'), name: 'report.txt'}],
    allowedMentions: {parse: [], repliedUser: false},
  }),
});
```

`ctx.reply(input)` sends an initial reply, edits a pending defer, or follows up. Prefix replies use the original message first and channel sends afterward. `ctx.edit`/`ctx.update` edit the reply or component message; `followUp` sends another; `delete` deletes the reply. Responses serialize to avoid auto-defer races. `defer({ephemeral: true})` acknowledges slow work; reply afterward fills that defer. Privacy is fixed at acknowledgement and cannot change by editing. Ephemeral has no effect on prefix messages.

Use `ctx.reply({content: 'Private', ephemeral: true})` or `ephemeral: true` on a definition. Never pass deprecated `ephemeral: true` directly to discord.js; Shiver converts its option to flags. `silent: true` suppresses notifications; `suppressEmbeds: true` suppresses link embeds; numeric `flags` adds bits. Default allowed mentions: `{parse: ['users'], repliedUser: true}`. Override per message or in `createBot`.

Embeds accept normal title/description/url/fields and shortcuts: named/hex color, string footer/author, URL image/thumbnail, timestamp true/Date/string, icon/iconURL/icon_url. `embed: {...}` supplies one; `embeds: [...]` supplies several. Existing EmbedBuilder values work. Limits: content 2000; 10 embeds; title 256, description 4096, footer 2048, author 256, 25 fields per embed, field name 256/value 1024, 6000 total characters across embeds.

## Polls

Pass a poll configuration object for Shiver to normalize:

```js
import {defineCommand} from 'shiver-framework';
export const lunch = defineCommand({
  name: 'lunch', description: 'Vote on lunch',
  run: ctx => ctx.reply({poll: {question: 'Lunch?', answers: ['Pizza', 'Sushi'], duration: '1d', multi: false}}),
});
```

`poll(config)` returns discord.js poll data for direct discord.js use; duration accepts hours as a number or a duration string, rounded to hours with minimum one. Pass the original configuration to `ctx.reply({poll})`, since that path normalizes it itself.

Files use discord.js `files` inputs (paths, Buffers, attachment objects); retain existing uploads with `attachments`. V2 `file('attachment://report.txt')` displays an upload. V2 cannot have content, embeds, or polls: use `ctx.reply(container('Text'))` or `{components: [...]}`.

`resolveMessage(input, {mode: 'reply' | 'edit' | 'send', ephemeral, allowedMentions, validate})` produces discord.js options, wrapping components/embeds with `toJSON`. `validateMessage({content, embeds, components, v2})` checks raw JSON; `validateModal(form)` checks modal JSON. Local checks cover common limits, not every Discord rule.

## Acknowledgements and collectors

Use `defer: true` for a pending reply, `defer: 'ephemeral'` for a private pending reply, or `defer: 'update'` for a component acknowledgement without a new message. `autoDefer: true` schedules acknowledgement after two seconds. Set a duration to change the delay. It defers replies on commands and updates on interactions that support them. Set `defer: false` on a definition to opt out of auto-defer when opening a modal. Discord still expects an initial response within three seconds.

`ctx.confirm(container('Proceed?'))` adds a button row and removes it after a response or timeout. `ctx.paginate(['Overview', container('Details')])` renders both pages as Components V2, promoting plain text to a text display. Use V2-compatible pages throughout when any page is V2. Embeds and polls cannot share that paginator.

## Lazy pages and page selection

Pass a zero-based renderer to load pages only when they are displayed. Set `v2: true` on a lazy source when it uses Components V2. Shiver acknowledges subsequent page clicks before awaiting the renderer. Buttons support large page counts. `controls: 'select'` adds a direct page picker for up to 25 pages. `pageLabel(index)` supplies a custom label.

```js
import { container, defineCommand } from 'shiver-framework';
export default defineCommand({
  name: 'guide',
  description: 'Read the guide',
  run: (ctx) => ctx.paginate({
    count: 3,
    v2: true,
    async render(index) { return container(`Chapter ${index + 1}`); },
  }, { controls: 'select', pageLabel: (index) => `Chapter ${index + 1}` }),
});
```

## Interaction metadata and media scans

`ctx.attachmentSizeLimit` exposes the limit in bytes from Discord when it is supplied. `ctx.installationOwners` exposes Discord's installation map, and `ctx.entitlements` exposes the interaction's entitlement collection.

`contentScanFlags(attachmentOrEmbedOrMedia)` decodes the `explicit`, `gore`, and `selfHarm` flags supplied by Discord. It returns `null` when no flag field is available. Treat unset flags as no reported hit at the time of the read. Scan metadata may arrive later via `messageUpdate`. [Discord content scan metadata](https://docs.discord.com/developers/components/reference#unfurled-media-item)
