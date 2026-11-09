Reply, edit, defer, and follow up from any handler with one context API, and send embeds, files, polls, confirmation prompts, and paged content.

# Messages

Every handler receives a context, `ctx`. Its reply methods work the same way for slash commands, chat commands, buttons, selects, and modals, so a handler does not need to know how it was invoked.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'ping',
  description: 'Check that the bot is alive',
  run: (ctx) => ctx.reply('Pong'),
});
```

## Choose what to send

Every method that sends or edits a message accepts the same four kinds of input:

| Input | Example |
| --- | --- |
| A string | `ctx.reply('Saved.')` |
| A component | `ctx.reply(container('Saved.'))` |
| An array of components | `ctx.reply([row(button({ id: 'a', label: 'A' }))])` |
| A payload object | `ctx.reply({ content: 'Saved.', ephemeral: true })` |

A payload object takes these fields. Anything else is passed through to discord.js unchanged.

| Field | Type | What it does |
| --- | --- | --- |
| `content` | `string` | Message text, up to 2000 characters |
| `embed` | object | One embed. See [Send an embed](#send-an-embed) |
| `embeds` | array | Several embeds, up to 10 |
| `components` | component or array | Buttons, selects, and layouts. See [Components](components.md) |
| `files` | array | Uploads, in any form discord.js accepts |
| `poll` | object | A poll. See [Send a poll](#send-a-poll) |
| `ephemeral` | `boolean` | Only the user sees the reply |
| `silent` | `boolean` | Send without a notification |
| `suppressEmbeds` | `boolean` | Do not expand links into embeds |
| `allowedMentions` | object | Which mentions may notify. See [Control mentions](#control-mentions) |
| `flags` | `number` | Extra Discord message flags, combined with the ones above |

## Reply privately

Set `ephemeral: true` on a reply, or on the definition to make it the default for every reply from that handler:

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'secret',
  description: 'Show your API key',
  ephemeral: true,
  run: async (ctx) => {
    await ctx.reply('Your key is `abc-123`.');
    await ctx.followUp({ content: 'This follow-up is public.', ephemeral: false });
  },
});
```

Ephemeral replies exist only for interactions. In a chat command the field is ignored and the reply is a normal message. A reply's visibility is fixed when it is first sent or deferred, and an edit cannot change it.

## Edit, follow up, and delete

| Method | Slash command, button, select, or modal | Chat command |
| --- | --- | --- |
| `ctx.reply(input)` | Sends the first reply. After a deferral, fills in the pending reply. After a reply, sends a follow-up | Replies to the user's message. Later calls send to the channel |
| `ctx.edit(input)` | Edits the reply. On a button or select that has not responded yet, updates the message the component is on | Edits the bot's reply |
| `ctx.update(input)` | Same as `edit`. Reads naturally in component handlers | Same as `edit` |
| `ctx.followUp(input)` | Sends an additional message | Sends to the channel |
| `ctx.delete()` | Deletes the reply | Deletes the bot's reply |

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'build',
  description: 'Run a build',
  run: async (ctx) => {
    await ctx.reply('Building...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await ctx.edit('Build finished.');
    await ctx.followUp('Artifacts are in the usual place.');
  },
});
```

`reply`, `edit`, and `followUp` resolve with the discord.js `Message` when Discord returns one. Calls on one context run in the order you make them, even if you do not await each one.

To remove buttons or embeds while editing, pass an empty array: `ctx.edit({ content: 'Done.', components: [] })`.

## Take longer than three seconds

> **Warning**
> Discord invalidates an interaction that receives no response within three seconds. The user sees "The application did not respond", and a late reply fails. The framework logs a warning that names the handler.

Acknowledge first, then do the work. A deferred reply shows a "thinking" state for up to fifteen minutes.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'report',
  description: 'Build the weekly report',
  defer: true,
  run: async (ctx) => {
    const lines = await new Promise((resolve) => setTimeout(() => resolve(42), 5000));
    await ctx.reply(`The report has ${lines} lines.`);
  },
});
```

There are three ways to defer:

| How | When to use it |
| --- | --- |
| `defer: true`, `'ephemeral'`, or `'update'` on the definition | The handler is always slow. `'update'` is for [components](components.md#guard-or-defer-a-handler) |
| `await ctx.defer()` or `await ctx.defer({ ephemeral: true })` in the handler | Only some paths are slow |
| The [`autoDefer` option](configuration.md#defer-slow-handlers-automatically) | A safety net for every handler |

`ctx.deferUpdate()` acknowledges a button or select without a visible change. In a chat command, `ctx.defer()` shows the typing indicator.

Do not defer a handler that opens a modal or launches an Activity. Both must be the first response.

## Send an embed

Pass a plain object as `embed`, or several as `embeds`:

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'status',
  description: 'Show service status',
  run: (ctx) => ctx.reply({
    embed: {
      title: 'Service status',
      description: 'All systems are running.',
      color: 'green',
      fields: [
        { name: 'API', value: 'Online', inline: true },
        { name: 'Queue', value: '3 jobs', inline: true },
      ],
      footer: 'Updated',
      timestamp: true,
    },
  }),
});
```

| Field | Accepts |
| --- | --- |
| `title`, `description`, `url` | Strings |
| `color` | A number, a hex string such as `'#57f287'` or `'#fff'`, or a [color name](components.md#options-for-each-function) |
| `timestamp` | `true` for now, a `Date`, or an ISO string |
| `author` | A name, or `{ name, url, icon }` |
| `footer` | Text, or `{ text, icon }` |
| `image`, `thumbnail` | A URL, or `{ url }` |
| `fields` | Array of `{ name, value, inline }`. Empty entries such as `null` are skipped, and values are converted to strings |

A discord.js `EmbedBuilder` works in the same place. The `embed()` function returns the normalized object if you need it outside a reply.

## Attach files

`files` takes whatever discord.js accepts: a path, a `Buffer`, or `{ attachment, name }`.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'log',
  description: 'Download the latest log',
  ephemeral: true,
  run: (ctx) => ctx.reply({
    content: 'Here is the log.',
    files: [{ attachment: Buffer.from('12:00 started\n12:01 ready\n'), name: 'bot.log' }],
  }),
});
```

`ctx.attachmentSizeLimit` holds the upload limit in bytes for the current interaction, or `null` when Discord did not provide one. To display an upload inside a Components V2 layout, see [Components](components.md#lay-out-a-message-with-components-v2).

## Send a poll

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'lunch',
  description: 'Vote on lunch',
  run: (ctx) => ctx.reply({
    poll: {
      question: 'Where do we eat?',
      answers: ['Pizza', 'Sushi', 'Salad'],
      duration: '1d',
      multi: false,
    },
  }),
});
```

| Field | Accepts |
| --- | --- |
| `question` | Text |
| `answers` | Strings, or `{ text, emoji }` |
| `duration` | Hours as a number, or a duration string. Rounded to whole hours, with a minimum of one |
| `multi` | `true` to allow several answers. Default `false` |

## Control mentions

By default a message may notify the users it mentions and the user it replies to. Role and `@everyone` mentions are shown but do not notify. Change the default with the [`allowedMentions` option](configuration.md#options-reference), or per message:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'announce',
  description: 'Post an announcement that notifies a role',
  guildOnly: true,
  permissions: ['MentionEveryone'],
  options: {
    role: opt.role('Role to notify', { required: true }),
    text: opt.string('Announcement', { required: true }),
  },
  run: (ctx, { role, text }) => ctx.reply({
    content: `${role} ${text}`,
    allowedMentions: { roles: [role.id] },
  }),
});
```

Use `silent: true` to deliver a message without a push or desktop notification.

## Ask for confirmation

`ctx.confirm(input, options)` sends the message with two buttons and resolves with `true`, `false`, or `null` when the user does not answer in time. The buttons are removed afterwards.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'reset',
  description: 'Delete all of your saved data',
  ephemeral: true,
  run: async (ctx) => {
    const confirmed = await ctx.confirm('Delete all of your saved data?', { yes: 'Delete', danger: true });
    if (confirmed === null) return ctx.followUp('No answer. Nothing was deleted.');
    if (!confirmed) return ctx.followUp('Canceled.');
    await ctx.store.delete(`profile:${ctx.user.id}`);
    return ctx.followUp('Your data was deleted.');
  },
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `yes` | `'Confirm'` | Label of the confirming button |
| `no` | `'Cancel'` | Label of the canceling button |
| `danger` | `false` | Makes the confirming button red instead of green |
| `time` | `'30s'` | How long to wait |

Only the user who invoked the handler can answer. It works in chat commands too.

## Split content into pages

`ctx.paginate(pages)` sends the first page with previous and next buttons and handles the clicks:

```js
import { chunk, defineCommand } from 'shiver-framework';

const members = Array.from({ length: 45 }, (_, index) => `Member ${index + 1}`);

export default defineCommand({
  name: 'members',
  description: 'List members',
  run: (ctx) => ctx.paginate(chunk(members, 20).map((group) => group.join('\n'))),
});
```

Each page is any message input. `chunk(array, size)` splits an array into groups. The promise resolves when nobody has clicked for `time`, at which point the controls are disabled. A single page is sent without controls.

| Option | Default | Meaning |
| --- | --- | --- |
| `time` | `'5m'` | Idle time before the controls are disabled |
| `start` | `0` | Index of the first page shown |
| `controls` | `'buttons'` | `'select'` shows a menu of pages instead, for up to 25 pages |
| `pageLabel` | ``(index) => `Page ${index + 1}` `` | Menu label for each page when `controls` is `'select'` |

### Render pages on demand

When pages are expensive to build, pass a source with `count` and `render` instead of an array. `render` receives a zero-based index and may be async:

```js
import { container, defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'guide',
  description: 'Read the guide',
  run: (ctx) => ctx.paginate({
    count: 3,
    v2: true,
    render: async (index) => container(`## Chapter ${index + 1}`, 'Text of the chapter.'),
  }, { controls: 'select', pageLabel: (index) => `Chapter ${index + 1}` }),
});
```

Set `v2: true` when `render` returns Components V2 layouts.

> **Note**
> Pages cannot mix styles. When any page uses Components V2, plain text pages are converted to text components, and pages with embeds or polls throw `INVALID_MESSAGE`.

## Send a message outside a handler

Events and tasks have no context. `resolveMessage` converts any message input into discord.js options, with the same shortcuts and checks:

```js
import { container, defineEvent, resolveMessage } from 'shiver-framework';

export default defineEvent({
  name: 'guildMemberAdd',
  run: async (bot, member) => {
    await member.guild.systemChannel?.send(resolveMessage(
      container({ accent: 'green' }, `Welcome, ${member.user.username}.`),
      { mode: 'send' },
    ));
  },
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `'reply'` | `'reply'` for interaction replies, `'send'` for channel messages, `'edit'` for edits. `ephemeral` applies only in `'reply'` mode, and `silent` does not apply in `'edit'` mode |
| `ephemeral` | `false` | Default visibility when the input does not set it |
| `allowedMentions` | none | Used when the input does not set its own |
| `validate` | `true` | Run the limit checks |

## Context reference

### Properties

| Property | Type | Meaning |
| --- | --- | --- |
| `kind` | `'command' \| 'prefix' \| 'component' \| 'modal' \| 'autocomplete'` | How the handler was invoked |
| `user` | `User` | Who invoked it |
| `member` | `GuildMember \| null` | The user as a server member |
| `guild`, `guildId` | `Guild \| null`, `string \| null` | The server, or `null` in direct messages |
| `channel`, `channelId` | channel, `string \| null` | Where it was invoked |
| `locale` | `string` | The user's locale. See [Translate replies](configuration.md#translate-replies) |
| `options` | object | Parsed command options |
| `params` | object | Values captured from a custom id |
| `values` | `string[]` | Selected values of a select |
| `fields` | object | Submitted modal values |
| `target` | user, member, or message | Target of a context menu command |
| `command` | definition or `null` | The command definition |
| `state` | object | Scratch space shared by [middleware](middleware.md) and the handler |
| `ephemeral` | `boolean` | Default visibility for replies. You may change it before replying |
| `interaction` | discord.js interaction or `null` | The raw interaction |
| `message` | `Message \| null` | The user's message in a chat command, or the message a component is on |
| `isInteraction` | `boolean` | `false` for chat commands |
| `deferred`, `replied` | `boolean` | Response state |
| `memberPermissions`, `appPermissions` | `PermissionsBitField \| null` | Permissions of the user and of the bot in this channel |
| `entitlements` | collection or `null` | Entitlements sent with the interaction |
| `installationOwners` | object or `null` | Who installed the application, for user-installed commands |
| `attachmentSizeLimit` | `number \| null` | Upload limit in bytes |
| `bot`, `client`, `store`, `log` | | The bot, its discord.js client, its store, and its logger |

### Methods

| Method | Returns | What it does |
| --- | --- | --- |
| `reply(input)` | `Promise<Message \| null>` | Replies, fills in a deferred reply, or follows up |
| `edit(input)`, `update(input)` | `Promise<Message \| null \| void>` | Edits the reply or the component's message |
| `followUp(input)` | `Promise<Message \| null>` | Sends an additional message |
| `delete()` | `Promise<void>` | Deletes the reply |
| `defer({ ephemeral? })` | `Promise<void>` | Acknowledges with a pending reply |
| `deferUpdate()` | `Promise<void>` | Acknowledges a component without a visible change |
| `showModal(modal)` | `Promise<void>` | Opens a modal as the first response |
| `awaitModal(modal, { time? })` | `Promise<Context \| null>` | Opens a modal and waits for the submission |
| `awaitComponent({ message?, time?, filter?, anyone? })` | `Promise<Context \| null>` | Waits for a click on the reply |
| `confirm(input, options?)` | `Promise<boolean \| null>` | Asks a yes or no question |
| `paginate(pages, options?)` | `Promise<void>` | Sends paged content |
| `launchActivity()` | `Promise<void>` | Launches the application's Activity as the first response |
| `t(key, vars?)` | `string` | Translates a key in the context's locale |

## Limits checked before sending

The framework checks these before calling Discord and throws `INVALID_MESSAGE` with the offending path, for example `embeds[0].fields[2]`. Component limits are listed in [Components](components.md#component-reference).

| Item | Limit |
| --- | --- |
| `content` | 2000 characters |
| Embeds per message | 10 |
| Embed title | 256 characters |
| Embed description | 4096 characters |
| Embed footer text | 2048 characters |
| Embed author name | 256 characters |
| Fields per embed | 25 |
| Field name | 1 to 256 characters |
| Field value | 1 to 1024 characters |
| All embeds of a message together | 6000 characters |

Turn the checks off with `validate: false` in [`createBot`](configuration.md#options-reference). Discord still enforces its own limits.

## Read media scan results

`contentScanFlags(source)` decodes the content scan flags Discord attaches to an attachment, an embed, or a media item. It returns `{ explicit, gore, selfHarm }` as booleans, or `null` when the source carries no flags.

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| "The application did not respond", and a log line `Interaction expired before a reply was sent` | No response within three seconds | Add `defer: true`, call `ctx.defer()` first, or enable `autoDefer` |
| `INVALID_MESSAGE`: `content is 2143 characters, max is 2000. Split it, attach a file, or use an embed description (4096).` | The text is too long | Use `ctx.paginate`, a file, or an embed |
| `INVALID_MESSAGE`: `This message uses Components V2 ... so it cannot also have "content", "embeds" or "poll".` | A layout component next to `content` or an embed | Put the text in the layout with `text()` |
| `INVALID_MESSAGE`: `A message must be a string or an object like { content, embeds, components }, got undefined.` | `ctx.reply()` was called with `undefined`, a number, or a class instance | Pass a string or a plain object |
| `INVALID_MESSAGE`: `Set v2: true on the pagination source when it renders Components V2.` | A lazy page source returned a layout | Add `v2: true` next to `count` |
| `INVALID_MESSAGE`: `paginate() select controls support at most 25 pages. Use buttons for longer lists.` | `controls: 'select'` with more than 25 pages | Remove `controls` |
| `UNSUPPORTED`: `awaitComponent() needs a message: reply first, or pass { message }.` | Waiting before anything was sent | Call `ctx.reply` first |
| A reply meant to be private is public | `ephemeral` was set on an edit, on a reply after a public `defer: true`, or in a chat command | Use `defer: 'ephemeral'`, or set `ephemeral` on the definition |
| A role mention does not notify | The default `allowedMentions` only notifies users | Pass `allowedMentions: { roles: [id] }` |
