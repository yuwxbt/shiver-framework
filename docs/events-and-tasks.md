React to Discord gateway events with `defineEvent` and run recurring jobs with `defineTask`.

# Events and tasks

Commands and components respond to something a user did. Events respond to everything else Discord reports, such as a member joining, and tasks run on a timer.

```js
import { defineEvent } from 'shiver-framework';

export default defineEvent({
  name: 'guildMemberAdd',
  run: async (bot, member) => {
    await member.guild.systemChannel?.send(`Welcome, ${member.user.username}.`);
  },
});
```

Save the file under your `dir` folder. The bot requests the intent the event needs and attaches the listener when it starts.

## Listen to an event

`name` is any discord.js client event name. `run` receives the bot, followed by the arguments discord.js passes for that event:

```js
import { defineEvent } from 'shiver-framework';

export default defineEvent({
  name: 'messageDelete',
  run: async (bot, message) => {
    if (!message.guildId) return;
    await bot.store.set(`deleted:${message.channelId}`, { at: Date.now(), author: message.author?.id ?? null }, { ttl: '1h' });
  },
});
```

Several definitions may listen to the same event. Each runs independently.

> **Warning**
> `guildMemberAdd` and the other member events need the privileged `GuildMembers` intent, and `presenceUpdate` needs `GuildPresences`. Enable them on the Bot page of the Developer Portal, or login fails with `DISALLOWED_INTENTS`.

### Run once

`once: true` removes the listener after its first run. The name `ready` is accepted for discord.js's `clientReady` event:

```js
import { ActivityType } from 'discord.js';
import { defineEvent } from 'shiver-framework';

export default defineEvent({
  name: 'ready',
  once: true,
  run: (bot) => bot.client.user.setActivity('/help', { type: ActivityType.Listening }),
});
```

### Filter before running

`filter` receives the same arguments as `run` and returns whether to run. It may be async. With `once: true`, the listener stays attached until the filter accepts an event.

```js
import { defineEvent } from 'shiver-framework';

export default defineEvent({
  name: 'messageCreate',
  filter: (bot, message) => !message.author.bot && message.mentions.has(bot.client.user),
  run: (bot, message) => message.reply('Use `/help` to see what I can do.'),
});
```

> **Note**
> A `messageCreate` event adds the `GuildMessages` intent but not `MessageContent`. Without it, `message.content` is empty for most messages. Add `GatewayIntentBits.MessageContent` to the [`intents` option](configuration.md#add-intents-and-client-options) if you read message text, or define a [command with a prefix](commands.md#run-a-command-from-chat) instead of parsing messages yourself.

## Run a recurring task

A task calls `run(bot)` every `every`:

```js
import { defineTask } from 'shiver-framework';

export default defineTask({
  name: 'expire-reminders',
  every: '1m',
  immediate: true,
  run: async (bot) => {
    for (const key of await bot.store.keys('reminder:')) {
      const reminder = await bot.store.get(key);
      if (reminder.due > Date.now()) continue;
      const channel = await bot.client.channels.fetch(reminder.channelId);
      await channel.send(`<@${reminder.userId}> ${reminder.text}`);
      await bot.store.delete(key);
    }
  },
});
```

| Behavior | Detail |
| --- | --- |
| Start | Tasks start after the bot has logged in and synced commands |
| First run | After one interval, or right away with `immediate: true` |
| Overlap | A tick is skipped while the previous run of the same task is still going |
| Interval | A number of milliseconds or a duration string. At least one second |
| Shutdown | Timers stop on `bot.stop()` and do not keep the process alive on their own |

Tasks are in-process timers. They do not run while the bot is down and do not catch up afterwards. For work that must happen at a set time, store the due time, as the example does, and check it on each tick.

## Send messages from events and tasks

Events and tasks have no context, so use discord.js directly. To use components, embed shortcuts, and the limit checks, convert the message with `resolveMessage`. See [Messages](messages.md#send-a-message-outside-a-handler).

## Handle failures

An error thrown by `run` or `filter` is caught. The bot logs it and emits `error` on the bot, and the next event or tick proceeds normally:

```js
import { createBot } from 'shiver-framework';

const bot = createBot({ dir: './src' });

bot.on('error', ({ error, event, task }) => {
  if (event) bot.log.warn(`event ${event} failed: ${error.message}`);
  if (task) bot.log.warn(`task ${task} failed: ${error.message}`);
});

await bot.start();
```

## Listen to bot lifecycle events

The bot object itself emits a few events. They are separate from Discord's and are attached with `bot.on`:

| Event | Argument | Emitted when |
| --- | --- | --- |
| `ready` | the bot | `start()` has finished: logged in, commands synced, tasks started |
| `reload` | the bot | A [watched reload](configuration.md#reload-on-file-changes) succeeded |
| `handled` | `ctx` | A command, component, or modal handler finished without throwing |
| `error` | `{ error, ctx?, id?, event?, task? }` | A handler, event listener, or task threw |

```js
import { createBot } from 'shiver-framework';

const bot = createBot({ dir: './src' });

const counts = new Map();
bot.on('handled', (ctx) => {
  const name = ctx.command?.name ?? ctx.interaction?.customId ?? ctx.kind;
  counts.set(name, (counts.get(name) ?? 0) + 1);
});

await bot.start();
```

## Reference

### defineEvent

| Field | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | `string` | required | A discord.js client event name, or `'ready'` |
| `run` | `(bot, ...args) => unknown` | required | Called for each event |
| `once` | `boolean` | `false` | Detach after the first run |
| `filter` | `(bot, ...args) => boolean \| Promise<boolean>` | none | Run only when it returns a truthy value |

### defineTask

| Field | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | `string` | required | Used in logs and in the `error` event |
| `every` | `number \| string` | required | Interval. At least `1000` or `'1s'` |
| `run` | `(bot) => unknown` | required | Called on each tick |
| `immediate` | `boolean` | `false` | Also run once when the task starts |

Durations combine the units `ms`, `s`, `m`, `h`, `d`, and `w`: `'30s'`, `'15m'`, `'1h30m'`, `'1d'`.

### Intents added for each event

`Guilds` is always requested. Defining an event whose name matches a row adds that row's intent. Events not listed here, such as `guildCreate`, `channelCreate`, `roleUpdate`, `threadCreate`, and `interactionCreate`, need only `Guilds` or no intent at all.

| Event names | Intent added | Privileged |
| --- | --- | --- |
| `guildMember...` (`guildMemberAdd`, `guildMemberRemove`, `guildMemberUpdate`, `guildMembersChunk`), `threadMembersUpdate` | `GuildMembers` | Yes |
| `presenceUpdate` | `GuildPresences` | Yes |
| `guildBan...`, `guildAuditLogEntry...` | `GuildModeration` | No |
| `emoji...`, `sticker...`, `guildSoundboard...`, `soundboard...` | `GuildExpressions` | No |
| `guildIntegrationsUpdate` | `GuildIntegrations` | No |
| `webhook...` | `GuildWebhooks` | No |
| `invite...` | `GuildInvites` | No |
| `voiceState...`, `voiceChannelEffect...` | `GuildVoiceStates` | No |
| `messageCreate`, `messageUpdate`, `messageDelete`, `messageBulkDelete`, `messageDeleteBulk` | `GuildMessages` | No |
| `messageReaction...` | `GuildMessageReactions` | No |
| `typingStart` | `GuildMessageTyping` | No |
| `guildScheduledEvent...` | `GuildScheduledEvents` | No |
| `autoModerationRule...` | `AutoModerationConfiguration` | No |
| `autoModerationAction...` | `AutoModerationExecution` | No |
| `messagePollVote...` | `GuildMessagePolls` | No |

Only server intents are added. For the same events in direct messages, add `DirectMessages`, `DirectMessageReactions`, or `DirectMessageTyping` with the [`intents` option](configuration.md#add-intents-and-client-options). `bot.intents.toArray()` and [`shiver check`](cli.md#shiver-check) show the final list.

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `INVALID_EVENT`: `defineEvent() needs a "name": defineEvent({ name: "guildMemberAdd", run(bot, member) {} }).` | No `name` | Add the event name |
| `INVALID_EVENT`: `Event "x" needs a "run(bot, ...args)" function.` | No `run` | Add the handler |
| `INVALID_TASK`: `Task "x": "every" must be at least 1 second.` | An interval below one second | Use `'1s'` or more |
| `INVALID_DURATION`: `Invalid duration "every minute".` | An unsupported duration string | Use a string such as `'1m'` |
| `DISALLOWED_INTENTS` at login | An event needs a privileged intent | Enable it in the Developer Portal |
| The listener never runs | The event name is misspelled, or it needs an intent the table does not add | Check the name against discord.js `Events`, and add the intent with `intents` |
| `message.content` is empty | `MessageContent` is not requested | Add it to `intents` and enable it in the portal |
| The first argument is not what you expected | `run` receives the bot first | Write `run(bot, member)`, not `run(member)` |
| A task runs once per shard | Each shard process starts its own timers | See [Deployment](deploy.md#shard-a-large-bot) |
