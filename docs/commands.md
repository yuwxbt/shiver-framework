Define a command once and run it as a slash command, a chat command, a subcommand tree, or a context menu entry.

# Commands

`defineCommand` describes a command: its name, its options, who may run it, and the function that handles it. The framework builds the Discord registration from the same object and, when a prefix is configured, parses chat messages into the same options.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'ping',
  description: 'Check that the bot is alive',
  run: (ctx) => ctx.reply('Pong'),
});
```

Save the file anywhere under your `dir` folder and it is loaded on start. `run` receives a [context](messages.md#context-reference) and the parsed options. A definition is validated the moment `defineCommand` is called, so a mistake fails at load time with the reason.

## Add options

Declare options as an object. The key is the option name and the value comes from an `opt` builder:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'echo',
  description: 'Repeat a message',
  options: {
    text: opt.string('Text to repeat', { required: true, max: 500 }),
    times: opt.integer('Number of copies', { min: 1, max: 3, default: 1 }),
  },
  run: (ctx, { text, times }) => ctx.reply(Array(times).fill(text).join('\n')),
});
```

Each builder takes a description and an optional configuration, or a single object: `opt.string({ description: 'Text to repeat', required: true })`.

An option the user leaves out is `null` in the handler, or its `default` when you set one. `default` is applied by the bot and is not sent to Discord.

| Builder | Value in the handler | Accepted in a chat command |
| --- | --- | --- |
| `opt.string` | `string` | A word, or a quoted phrase |
| `opt.integer` | `number` (whole) | A whole number |
| `opt.number` | `number` | A number |
| `opt.boolean` | `boolean` | `true`, `yes`, `y`, `on`, `1`, `false`, `no`, `n`, `off`, `0` |
| `opt.user` | discord.js `User` | A mention or an ID |
| `opt.member` | `GuildMember`, or `null` outside a server | A mention or an ID |
| `opt.channel` | Channel | A mention or an ID |
| `opt.role` | `Role` | A mention or an ID |
| `opt.mentionable` | Member, user, or role | A mention or an ID |
| `opt.attachment` | discord.js `Attachment` | The next file attached to the message |

Discord lists required options before optional ones. Chat commands read arguments in the order you declare them, so declare required options first to keep both forms consistent.

## Offer fixed choices

`choices` restricts a string, integer, or number option to a list of up to 25 values:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'units',
  description: 'Choose a unit system',
  options: {
    system: opt.string('Unit system', {
      required: true,
      choices: ['Metric', { name: 'Imperial (US)', value: 'imperial' }],
    }),
  },
  run: (ctx, { system }) => ctx.reply(`Units set to ${system}.`),
});
```

A plain value is used as both label and value. An object sets them separately and may carry `nameLocalizations`. The handler receives the value. In a chat command, a string choice matches its name or value without regard to case.

## Suggest values with autocomplete

For lists that are long or change at runtime, use `autocomplete` instead of `choices`. The function receives the context and what the user has typed so far, and returns up to 25 suggestions:

```js
import { defineCommand, opt } from 'shiver-framework';

const cities = ['Paris', 'Prague', 'Porto', 'Rome', 'Riga'];

export default defineCommand({
  name: 'weather',
  description: 'Show the weather for a city',
  options: {
    city: opt.string('City', {
      required: true,
      autocomplete: (ctx, typed) => cities.filter((city) => city.toLowerCase().startsWith(typed.toLowerCase())),
    }),
  },
  run: (ctx, { city }) => ctx.reply(`Weather for ${city}: sunny.`),
});
```

Return plain values or `{ name, value }` objects. The function may be async. `ctx.options` holds the other options the user has filled in so far.

Autocomplete requests do not run global middleware or the command's guards. To protect suggestions that reveal private data, set `autocompleteUse` on the option to a [middleware](middleware.md) or an array of them. If the middleware or the function throws, the user gets an empty list.

> **Note**
> Discord does not validate the submitted value against your suggestions. The handler can receive any text, so validate it there.

## Group commands with subcommands

Replace `run` with `subcommands`. Each key is a subcommand name, and each value has its own `description`, `options`, and `run`:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'tag',
  description: 'Manage saved replies',
  guildOnly: true,
  subcommands: {
    show: {
      description: 'Show a tag',
      options: { name: opt.string('Tag name', { required: true }) },
      run: async (ctx, { name }) => ctx.reply((await ctx.store.get(`tag:${ctx.guildId}:${name}`)) ?? 'No such tag.'),
    },
    admin: {
      description: 'Change tags',
      permissions: ['ManageMessages'],
      subcommands: {
        set: {
          description: 'Create or replace a tag',
          options: {
            name: opt.string('Tag name', { required: true }),
            text: opt.string('Tag text', { required: true }),
          },
          run: async (ctx, { name, text }) => {
            await ctx.store.set(`tag:${ctx.guildId}:${name}`, text);
            await ctx.reply(`Saved ${name}.`);
          },
        },
      },
    },
  },
});
```

This registers `/tag show` and `/tag admin set`. A subcommand that has its own `subcommands` is a group. Groups nest one level: command, group, subcommand.

Guards and `use` middleware on a parent apply to everything below it. In the example, `guildOnly` covers the whole command and `permissions` covers the `admin` group.

## Run a command from chat

Set the [`prefix` option](configuration.md#enable-prefix-commands) and every slash command definition also answers messages:

```text
!echo "hello there" 2
!tag admin set rules Be kind to each other.
```

The first word after the prefix is matched against command names and `aliases`, ignoring case. Following words select subcommands. The rest is parsed into options by position:

| Rule | Example |
| --- | --- |
| Arguments are separated by spaces | `!ban @user 7` |
| Double quotes group words into one argument | `!echo "hello there" 2` |
| The last string option takes the rest of the line as typed | `!tag admin set rules Be kind to each other.` |
| Attachment options take attached files in order and use no text | `!upload` with a file attached |
| Arguments beyond the last option are ignored | |

The same `min`, `max`, `choices`, and attachment `types` checks apply. When an argument is missing or invalid, the bot replies with the reason and a usage line:

```text
`times`: must be at most 3.
Usage: `!echo <text> [times]`
```

A command with subcommands that is called without one replies with ``Usage: `!tag <show | admin>` ``.

Three fields control the two forms:

| Field | Effect |
| --- | --- |
| `aliases: ['say']` | Extra names for the chat form only |
| `prefix: false` | Slash only. The command ignores chat messages |
| `slash: false` | Chat only. The command is not registered with Discord |

Messages from bots are ignored. Autocomplete does not exist in chat, so users type the value themselves.

### Parse arguments your own way

`splitPrefix(text, message)` replaces the tokenizer. It receives the text after the command and subcommand names and returns the arguments as an array of strings:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'compare',
  description: 'Compare two phrases',
  options: {
    left: opt.string('First phrase', { required: true }),
    right: opt.string('Second phrase', { required: true }),
  },
  splitPrefix: (text) => text.split(';').map((part) => part.trim()),
  run: (ctx, { left, right }) => ctx.reply(left === right ? 'Same.' : 'Different.'),
});
```

`!compare one two; one two` now yields `left: 'one two'` and `right: 'one two'`. Set `splitPrefix` on a subcommand, on the command, or on `createBot`. The most specific one is used. Type checks still run on the returned strings.

## Add a context menu command

A context menu command appears when a user right-clicks a user or a message. Set `type` and read the target from the second argument:

```js
import { defineCommand } from 'shiver-framework';

export const report = defineCommand({
  name: 'Report message',
  type: 'message',
  ephemeral: true,
  run: (ctx, message) => ctx.reply(`Reported a message from ${message.author.username}.`),
});

export const joined = defineCommand({
  name: 'Show join date',
  type: 'user',
  guildOnly: true,
  run: (ctx, member) => ctx.reply(`Joined <t:${Math.floor(member.joinedTimestamp / 1000)}:D>.`),
});
```

| `type` | Target passed to `run` |
| --- | --- |
| `'message'` | The `Message` |
| `'user'` | The `GuildMember` when Discord sends one, otherwise the `User` |

Context menu names are 1 to 32 characters and may contain spaces and capitals. They have no description, options, or subcommands, and they never run from chat. A slash command, a user command, and a message command may share one name.

## Restrict who can run a command

Add guard fields to the definition. A user who fails a guard gets a short reply, private for interactions, and the handler does not run:

```js
import { defineCommand, opt } from 'shiver-framework';

export default defineCommand({
  name: 'purge',
  description: 'Delete recent messages',
  guildOnly: true,
  permissions: ['ManageMessages'],
  botPermissions: ['ManageMessages'],
  cooldown: '10s',
  options: {
    count: opt.integer('How many messages', { required: true, min: 1, max: 100 }),
  },
  run: async (ctx, { count }) => {
    await ctx.channel.bulkDelete(count);
    await ctx.reply({ content: `Deleted ${count} messages.`, ephemeral: true });
  },
});
```

| Field | Requires |
| --- | --- |
| `guildOnly: true` | A server |
| `dmOnly: true` | A direct message |
| `channelTypes: [...]` | One of the listed discord.js channel types |
| `roles: [...]` | Every listed role ID |
| `ownerOnly: true` | A bot owner |
| `nsfw: true` | An age-restricted channel, when used in a server |
| `permissions: [...]` | The user has these permissions in the channel |
| `botPermissions: [...]` | The bot has these permissions in the channel |
| `entitlement: 'SKU_ID'` | An active entitlement for the SKU |
| `cooldown: '10s'` | The user has not run it within the window |
| `use: [...]` | Your own [middleware](middleware.md) |

The same fields work on subcommands, [components, and modals](components.md#guard-or-defer-a-handler). Behavior, failure messages, and execution order are listed in the [guard reference](middleware.md#guard-reference).

`permissions` on a command does two things: it checks the user at runtime, and it sets the command's default member permissions so that Discord hides the command from members who lack them. Server admins can change that visibility, which is why the runtime check exists.

## Reply privately or defer

| Field | Effect on interactions |
| --- | --- |
| `ephemeral: true` | Replies are visible only to the user, unless a reply sets `ephemeral: false` |
| `defer: true` | The bot acknowledges before `run` starts. Your first `ctx.reply` fills in the pending reply |
| `defer: 'ephemeral'` | The same, with a private pending reply |
| `defer: false` | Opts out of the [`autoDefer` option](configuration.md#defer-slow-handlers-automatically) |

Set `defer` on any command that can take longer than three seconds. Do not set it on a command that opens a modal. Neither field has an effect on chat commands. A value on a subcommand or a group overrides the value above it.

> **Note**
> Guards run before the deferral, so a rejected user always gets a private reply. An error thrown later, inside `run`, edits the pending reply. Use `defer: 'ephemeral'` when those errors should stay private.

## Control where a command appears

By default a command is registered globally. These fields change the registration:

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'bonjour',
  description: 'Say hello',
  nameLocalizations: { 'en-US': 'hello' },
  descriptionLocalizations: { fr: 'Dire bonjour' },
  install: ['guild', 'user'],
  contexts: ['guild', 'botDM', 'privateChannel'],
  run: (ctx) => ctx.reply(ctx.locale === 'fr' ? 'Bonjour.' : 'Hello.'),
});
```

| Field | Values | Effect |
| --- | --- | --- |
| `guilds` | A server ID or an array of IDs | Registers the command only in those servers |
| `contexts` | `'guild'`, `'botDM'`, `'privateChannel'` | Where Discord shows the command. `guildOnly: true` sets `['guild']` unless you set `contexts` |
| `install` | `'guild'`, `'user'` | Whether servers, users, or both can install the command. User install must be enabled in the Developer Portal |
| `defaultMemberPermissions` | discord.js permissions | Who sees the command by default. Overrides the value derived from `permissions`, and adds no runtime check |
| `nsfw` | `true` | Marks the command age-restricted in Discord and adds the runtime guard |
| `nameLocalizations`, `descriptionLocalizations` | `{ locale: text }` | Translations shown in Discord's UI. Also available on subcommands, options, and choices |

`contexts` and `install` apply to global commands. They are left out of server-scoped registrations.

The [`devGuild` option](configuration.md#register-commands-in-one-server-while-developing) overrides `guilds` for every command. To inspect what will be sent, call `commandToJSON(definition)` or run [`shiver manifest`](cli.md#shiver-manifest).

## Add an Activity entry point

An application with Activities enabled can replace the default launch command with one global entry point:

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'play',
  description: 'Open the game',
  type: 'entryPoint',
  run: (ctx) => ctx.launchActivity(),
});
```

With `handler: 'app'` (the default) your `run` is called, and it must call `ctx.launchActivity()` as its first response. With `handler: 'discord'` and no `run`, Discord launches the Activity itself. An application has one entry point. It is global, has no options, and is skipped while `devGuild` is set.

## defineCommand reference

### Fields

| Field | Type | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| `name` | `string` | required | all | Command name |
| `description` | `string` | required for slash and entry point | slash, entry point | Shown in Discord's command list |
| `type` | `'slash' \| 'user' \| 'message' \| 'entryPoint'` | `'slash'` | all | Kind of command |
| `options` | `Record<string, Option>` | none | slash | Options, built with `opt` |
| `run` | `(ctx, options) => unknown` | required unless `subcommands` | all | Handler. Context menus receive `(ctx, target)`, entry points `(ctx)` |
| `subcommands` | `Record<string, node>` | none | slash | Subcommands or groups. Cannot be combined with `run` |
| `aliases` | `string[]` | none | slash | Extra chat names |
| `prefix` | `boolean` | `true` | slash | `false` disables the chat form |
| `slash` | `boolean` | `true` | all | `false` skips Discord registration |
| `splitPrefix` | `(text, message) => string[]` | tokenizer | slash | Custom chat argument parser |
| `guilds` | `string \| string[]` | global | slash, context menus | Server IDs to register in |
| `contexts` | array | Discord default | all | Interaction contexts |
| `install` | array | Discord default | all | Installation types |
| `defaultMemberPermissions` | permissions | from `permissions` | all | Default visibility |
| `nameLocalizations`, `descriptionLocalizations` | `Record<string, string>` | none | all | Translations for Discord's UI |
| `handler` | `'app' \| 'discord'` | `'app'` | entry point | Who launches the Activity |
| `ephemeral` | `boolean` | `false` | all | Private replies by default |
| `defer` | `boolean \| 'ephemeral'` | none | all | Acknowledge before `run` |
| guard fields | | | all | See [Restrict who can run a command](#restrict-who-can-run-a-command) |

A subcommand node accepts `description`, `options`, `run`, `subcommands`, `splitPrefix`, `ephemeral`, `defer`, the localization fields, and the guard fields.

### Option configuration

| Field | Type | Applies to | What it does |
| --- | --- | --- | --- |
| `required` | `boolean` | all | The user must provide a value |
| `default` | value | all | Used when the option is left out |
| `choices` | array | string, integer, number | Fixed list of allowed values |
| `autocomplete` | `(ctx, typed) => array` | string, integer, number | Live suggestions. Cannot be combined with `choices` |
| `autocompleteUse` | middleware | options with `autocomplete` | Runs before the suggestion function |
| `min`, `max` | `number` | string, integer, number | Length bounds for strings, value bounds for numbers |
| `channelTypes` | `number[]` | channel | Channel types Discord offers in the picker |
| `types` | `string[]` | attachment | Allowed files: `'image'`, `'video'`, `'audio'`, or extensions such as `'.pdf'` |
| `nameLocalizations`, `descriptionLocalizations` | `Record<string, string>` | all | Translations for Discord's UI |

For attachments, Discord applies `types` in the slash command upload dialog. In chat commands the bot checks the file name for extensions and the reported media type for groups. Neither inspects file contents.

### Limits checked when you define a command

| Item | Limit |
| --- | --- |
| Command, subcommand, and option names | 1 to 32 characters, lowercase, no spaces |
| Context menu and entry point names | 1 to 32 characters |
| Descriptions | 1 to 100 characters |
| Options per command or subcommand | 25 |
| Subcommands per command or group | 1 to 25 |
| Nesting | command, group, subcommand |
| Choices per option | 1 to 25 |
| Choice name | 1 to 100 characters |
| String choice value | 100 characters |
| String `min` / `max` | whole numbers, `min` 0 to 6000, `max` 1 to 6000 |
| Integer bounds and choices | safe integers |
| Number bounds and choices | between -2^53 and 2^53 |
| Attachment `types` | 10 entries |

## Common mistakes

Every message below is a `ShiverError` with code `INVALID_COMMAND` unless noted. The text starts with the command it refers to, for example `Command "echo" option "text":`.

| Message | Cause | Fix |
| --- | --- | --- |
| `name "Echo" is invalid. Names are 1-32 characters, lowercase, with no spaces (letters, numbers, "-" and "_").` | Uppercase letters or spaces in a slash command, subcommand, or option name | Use a lowercase name such as `echo` or `user-info` |
| `description must be 1-100 characters, got undefined.` | A slash command, subcommand, or option without a description | Add a `description` |
| `use an option builder, e.g. { text: opt.string("Description") }.` | An option written as a plain object or string | Use `opt.string`, `opt.integer`, and so on |
| `a command with subcommands cannot also have "run". Discord never invokes the parent.` | Both `run` and `subcommands` on one node | Move the logic into a subcommand |
| `subcommands nest at most two levels (command → group → subcommand).` | A group inside a group | Flatten the tree |
| `use either choices or autocomplete, not both.` | Both fields on one option | Keep one |
| `choices must contain 1–25 items. Use autocomplete for longer lists.` | An empty list or more than 25 choices | Switch to `autocomplete` |
| `only string, integer and number options support min/max.` | `min` or `max` on another option kind | Remove the bounds |
| `context menu commands have no options or subcommands.` | `options` on a `user` or `message` command | Remove them, or open a modal to collect input |
| `DUPLICATE`: `Two commands are named "ping" with type slash` | Two files define the same name and type | Rename one |
| A chat command does nothing | No `prefix` option, the command has `prefix: false`, or Message Content Intent is off | Check all three |
| `/command` shows "The application did not respond" | `run` took more than three seconds before replying | Add `defer: true` |
