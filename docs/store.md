Keep data between invocations and restarts with a small async key-value store that has memory, JSON file, and SQLite backends.

# Storage

Every bot has a store, available as `ctx.store` in handlers and `bot.store` elsewhere. It maps string keys to JSON values.

```js
import { defineCommand } from 'shiver-framework';

export default defineCommand({
  name: 'visits',
  description: 'Count how often you ran this command',
  run: async (ctx) => {
    const key = `visits:${ctx.user.id}`;
    const count = ((await ctx.store.get(key)) ?? 0) + 1;
    await ctx.store.set(key, count);
    await ctx.reply(`You have been here ${count} times.`);
  },
});
```

The default store keeps data in memory and loses it on restart. To keep it, [choose a persistent backend](#keep-data-across-restarts).

## Read, write, and delete

All methods are async.

```js
import { MemoryStore } from 'shiver-framework';

const store = new MemoryStore();

await store.set('settings:42', { prefix: '?', welcome: true });

const settings = await store.get('settings:42');   // { prefix: '?', welcome: true }
const missing = await store.get('settings:99');    // undefined
const keys = await store.keys('settings:');        // ['settings:42']
const removed = await store.delete('settings:42'); // true
```

`get` returns a copy, so changing the returned object does not change what is stored. Call `set` to save changes.

Store values that survive `JSON.stringify`: strings, numbers, booleans, `null`, arrays, and plain objects. Save IDs instead of discord.js objects such as users and channels.

## Expire values automatically

Pass `ttl` to `set`. After that time, the key reads as `undefined` and no longer appears in `keys()`:

```js
import { defineCommand, UserError } from 'shiver-framework';

export default defineCommand({
  name: 'daily',
  description: 'Claim your daily reward',
  run: async (ctx) => {
    const key = `daily:${ctx.user.id}`;
    if (await ctx.store.get(key)) throw new UserError('You already claimed today. Come back tomorrow.');
    await ctx.store.set(key, true, { ttl: '1d' });
    await ctx.reply('You claimed 100 coins.');
  },
});
```

`ttl` is a number of milliseconds or a duration string such as `'30s'`, `'10m'`, or `'1d'`. Setting a key again replaces its expiry, and setting it without `ttl` makes it permanent.

## Group keys under a prefix

`scope(store, prefix)` returns a view that adds `prefix:` to every key and removes it from the keys it returns:

```js
import { defineCommand, opt, scope } from 'shiver-framework';

export default defineCommand({
  name: 'note',
  description: 'Save a note for this server',
  guildOnly: true,
  options: {
    name: opt.string('Note name', { required: true }),
    text: opt.string('Note text', { required: true }),
  },
  run: async (ctx, { name, text }) => {
    const notes = scope(ctx.store, `notes:${ctx.guildId}`);
    await notes.set(name, text);
    await ctx.reply(`Saved. This server has ${(await notes.keys()).length} notes.`);
  },
});
```

A scope has `get`, `set`, `delete`, and `keys`. It has no `close`, because it shares the underlying store.

## Keep data across restarts

Pass a persistent store to `createBot`:

```js
import { createBot, JsonStore } from 'shiver-framework';

const bot = createBot({
  dir: './src',
  store: new JsonStore('./data/store.json'),
});

await bot.start();
```

| Backend | Create it with | Where data lives | Use it for |
| --- | --- | --- | --- |
| `MemoryStore` | `new MemoryStore()` | In the process | Tests, caches, and bots with no state worth keeping |
| `JsonStore` | `new JsonStore('./data/store.json')` | One JSON file, loaded into memory at startup | Small bots run by one process |
| `SqliteStore` | `new SqliteStore('./data/store.db')` | A SQLite database, through Node's built-in `node:sqlite` | Larger data sets on one machine |

`JsonStore` writes the whole file shortly after each change, by writing a temporary file and renaming it over the old one. Call `await store.flush()` to write immediately. `SqliteStore` writes each change as it happens and uses write-ahead logging. Pass `':memory:'` as the path for a throwaway database in tests.

Both create missing parent folders. `bot.stop()` closes the store, which flushes pending `JsonStore` writes, and the bot calls `stop()` for you on `SIGINT` and `SIGTERM`.

> **Note**
> `node:sqlite` is still marked experimental by Node, which prints an `ExperimentalWarning` the first time it is loaded. On Node versions before 22.13 the module also needs the `--experimental-sqlite` flag.

> **Warning**
> Do not point two processes at the same `JsonStore` file. Each keeps its own copy in memory and the last one to write wins. For sharded or multi-process bots, use a [custom store](#write-a-custom-store) backed by a shared database.

## Write a custom store

A store is any object with these methods. Implement them over your database client and pass the object as `store`:

```js
import { createBot, ms } from 'shiver-framework';

class MapStore {
  #entries = new Map();

  async get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expires !== null && entry.expires <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return JSON.parse(entry.json);
  }

  async set(key, value, options) {
    const expires = options?.ttl === undefined ? null : Date.now() + ms(options.ttl);
    this.#entries.set(key, { json: JSON.stringify(value), expires });
  }

  async delete(key) {
    return this.#entries.delete(key);
  }

  async keys(prefix = '') {
    const live = [];
    for (const key of this.#entries.keys()) {
      if (key.startsWith(prefix) && (await this.get(key)) !== undefined) live.push(key);
    }
    return live;
  }

  async close() {
    this.#entries.clear();
  }
}

const bot = createBot({ dir: './src', store: new MapStore() });

await bot.start();
```

`ms()` converts a duration string or number to milliseconds, so your store accepts the same `ttl` values as the built-in ones.

## Store reference

| Method | Returns | Behavior |
| --- | --- | --- |
| `get(key)` | `Promise<value \| undefined>` | The stored value, or `undefined` when the key is missing or expired |
| `set(key, value, { ttl? })` | `Promise<void>` | Stores the value, replacing any previous value and expiry |
| `delete(key)` | `Promise<boolean>` | Removes the key. `true` when it existed |
| `keys(prefix?)` | `Promise<string[]>` | Keys that start with `prefix` and have not expired. All keys when omitted |
| `close()` | `Promise<void>` | Optional. Called by `bot.stop()` |

`JsonStore` adds `flush(): Promise<void>`.

### Keys used by the framework

The bot stores one key per registration scope, named `shiver:sync:upsert:<application id>:<scope>`. It holds a hash of the commands last sent to Discord, which lets `start()` skip registration when nothing changed. Keep your own keys out of the `shiver:` prefix.

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Data is gone after a restart | The default `MemoryStore` is in use | Pass a `JsonStore` or `SqliteStore` to `createBot` |
| A change to a stored object is not saved | `get` returns a copy | Call `set` with the changed object |
| Two commands running at once lose an update | `get` followed by `set` is not atomic | Guard the handler with [`limitConcurrency`](middleware.md#limit-concurrent-runs), or use a database with atomic updates in a custom store |
| `INVALID_DURATION`: `Invalid duration "tomorrow".` | An unsupported `ttl` | Use milliseconds or a string such as `'1d'` |
| Every `JsonStore` call rejects with a `SyntaxError` | The file is not valid JSON | Restore or delete the file |
| `DataCloneError` from `MemoryStore.set` | The value contains a function or a class instance that cannot be copied | Store plain data |
| Commands are re-registered on every start | With a `MemoryStore`, the sync hash is lost on restart | Use a persistent store, or ignore it. Registration is safe to repeat |
