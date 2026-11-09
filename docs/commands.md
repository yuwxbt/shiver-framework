A command definition describes slash registration, prefix parsing, guards, and one handler.

# Commands

## Define a command

Save this feature in `src/echo.js` of the starter:

```js
import {defineCommand, opt} from 'shiver-framework';
export default defineCommand({
  name: 'echo', description: 'Repeat text', aliases: ['say'],
  options: {
    times: opt.integer('Copies', {required: true, min: 1, max: 3}),
    text: opt.string('Text', {required: true, max: 500}),
  },
  run: (ctx, {times, text}) => ctx.reply(Array(times).fill(text).join(' ')),
});
```

Slash names and option names are 1-32 lowercase characters without spaces; descriptions are 1-100 characters. There are at most 25 options per leaf. Required slash options are sorted before optional ones. `run(ctx, options)` receives inferred values in TypeScript; omitted optional options are `null`, or their configured `default`.

| Builder | Handler value |
| --- | --- |
| `opt.string` | string |
| `opt.integer`, `opt.number` | number |
| `opt.boolean` | boolean |
| `opt.user` | User |
| `opt.member` | GuildMember or API member, potentially null outside a guild |
| `opt.channel` | Resolved channel |
| `opt.role` | Resolved role |
| `opt.mentionable` | Member, user, or role |
| `opt.attachment` | Attachment |

Each builder accepts `(description, config?)` or `({description, ...config})`. Config fields: `required`, `default`, `choices`, `autocomplete(ctx, value)`, `min`, `max`, `channelTypes`, `types`, `nameLocalizations`, `descriptionLocalizations`. `min/max` mean string length or numeric value. Use `channelTypes` on channels and `types` on attachments for Discord registration. Choices are strings/numbers or `{name, value, nameLocalizations}` objects; use at most 25. Use choices/autocomplete only for string/integer/number options. Defaults apply locally when absent and do not change registration.

String length bounds range from 0 to 6000, with a maximum of at least 1. Integer values and bounds must be safe integers. Number values and bounds must be between `-(2 ** 53)` and `2 ** 53`. The minimum must be less than or equal to the maximum. Shiver checks choice values against the option type. A choice label is 1–100 characters and a string choice value is at most 100 characters.

Attachment filters accept up to 10 entries. Use `image`, `video`, `audio`, or extensions such as `.pdf`. Discord checks filenames for slash commands. For prefix commands Shiver checks the filename for extensions and the Discord-provided MIME type for groups. Validate file contents before trusting an upload. [Discord file filtering](https://docs.discord.com/developers/reference#file-type-filtering)

## Autocomplete

Autocomplete replaces choices for larger lists. Return up to 25 values or `{name, value}` objects. Set `autocompleteUse` on an option to run middleware before suggesting private data. Autocomplete has its own middleware stack. A rejected suggestion request receives an empty list.

```js
import {defineCommand, guildOnly, opt} from 'shiver-framework';
export const city = defineCommand({
  name: 'city', description: 'Choose a city',
  options: {name: opt.string('City', {
    autocomplete: (ctx, value) => ['Paris', 'Prague', 'Rome'].filter(c => c.toLowerCase().startsWith(value.toLowerCase())),
    autocompleteUse: guildOnly(),
  })},
  run: (ctx, {name}) => ctx.reply(name ?? 'Choose a city'),
});
```

## Subcommands and context menus

Subcommands use object keys as names. A parent with `subcommands` cannot also have `run`. One optional group level is allowed: command -> group -> subcommand. Each node has 1-25 children. Guards/middleware run from parent to leaf.

```js
import {defineCommand} from 'shiver-framework';
export const admin = defineCommand({
  name: 'admin', description: 'Administration', permissions: ['ManageGuild'],
  subcommands: {
    status: {description: 'Show status', run: ctx => ctx.reply('Ready')},
    tools: {description: 'Tools', subcommands: {
      ping: {description: 'Ping', run: ctx => ctx.reply('Pong')},
    }},
  },
});
```

Context menus use `type: 'user'` or `'message'`, accept names of 1-32 characters, and have no options/subcommands. The second handler argument is a member/user or message:

```js
import {defineCommand} from 'shiver-framework';
export const inspect = defineCommand({name: 'Inspect message', type: 'message', run: (ctx, target) => ctx.reply({content: target.content || '(empty)', ephemeral: true})});
```

Slash, user, and message commands may share a name. Use `bot.getCommand('inspect', 'user')` for a type-specific lookup. Each type has its own names.

## Activity Entry Points

An app with Activities enabled can register one global `type: 'entryPoint'` definition. Shiver updates an existing entry point by its Discord ID, even when renaming it. Guild-only development sync skips entry points.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'play',
  description: 'Open the Activity',
  type: 'entryPoint',
  defer: false,
  run: (ctx) => ctx.launchActivity(),
});
```

Use `handler: 'discord'` and omit `run` to let Discord launch the Activity automatically. With the default app handler, call `ctx.launchActivity()` as the initial response. [Discord Entry Points](https://docs.discord.com/developers/interactions/application-commands#entry-point-commands)

## Prefix parsing

Configure `createBot({prefix: '!'})`, an array of prefixes, or an async message-to-prefix function. This enables Message Content Intent, which must also be enabled in the portal. Mention prefixes work once a prefix is configured. `prefix: false` on a command disables its prefix form; `slash: false` disables registration. Context menus never run by prefix. Aliases affect prefix only.

Prefix options are positional in object order. Quotes preserve phrases; the final string consumes the remaining line. Boolean forms include yes/no, true/false, on/off, and 1/0. Entity options accept mentions or IDs. Attachments consume attached files without consuming text. Bounds and choices are checked. Type the numeric value for a numeric choice. Slash autocomplete does not run in chat.

Set `splitPrefix(text, message)` on the bot, command or subcommand for a custom argument format. The most specific splitter wins. It receives the text after the command and subcommand names and returns an array of strings, optionally asynchronously. For example, split `!compare one;two` with `splitPrefix: (text) => text.split(';').map((arg) => arg.trim())`. Option type checks still apply.

## Guards and registration

Definition guards: `guildOnly`, `dmOnly`, `channelTypes`, `roles`, `ownerOnly`, `nsfw`, `permissions`, `botPermissions`, `entitlement`, `cooldown`, `use`. `permissions` checks the user at runtime and supplies default Discord member permissions unless `defaultMemberPermissions` overrides registration. `defaultMemberPermissions` alone does not add a runtime guard. `defer: true | 'ephemeral' | 'update'` acknowledges slow handlers; never defer before opening a modal or launching an Activity. `ephemeral: true` defaults interaction replies to private.

Registration fields: `guilds` (string/array), `contexts: ['guild', 'botDM', 'privateChannel']`, `install: ['guild', 'user']`, `nameLocalizations`, `descriptionLocalizations`, `defaultMemberPermissions`, `nsfw`. `guildOnly` defaults contexts to guild unless explicitly supplied. Install/context restrictions are Discord metadata; use guards for runtime checks. `devGuild` overrides all command scopes. `commandToJSON(def)` previews registration JSON.

For a global user-installed command, enable User Install for the application in the Discord Developer Portal, then use `install: ['user']` and choose contexts such as `['guild', 'privateChannel']`. Installation type controls who can install the command. Interaction context controls where it appears. Use locale maps such as `nameLocalizations: { fr: 'bonjour' }` for Discord registration and `ctx.t()` for translated replies.
