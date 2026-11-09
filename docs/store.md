Stores expose an async JSON-value key-value interface with optional expiry and namespace views.

# Storage

## Read and write values

```js
import {MemoryStore, scope} from 'shiver-framework';
const store = new MemoryStore();
const guild = scope(store, 'guild:123');
await guild.set('settings', {prefix: '!'}, {ttl: '1h'});
console.log(await guild.get('settings'));
console.log(await guild.keys());
console.log(await guild.delete('settings'));
await store.close();
```

`createBot({store})` exposes the instance as `bot.store`/`ctx.store`. Default: `new MemoryStore()`. Values must be JSON serializable; avoid Discord objects, BigInt, and undefined. Missing/expired keys return undefined. `set` returns void, `delete` reports whether a key existed, and `keys(prefix?)` returns live matching keys. TTL accepts milliseconds or duration strings. A scoped view prefixes keys with `prefix + ':'` and strips it from returned keys; it does not close the parent.

## Choose a backend

| Store | Construction | Persistence |
| --- | --- | --- |
| MemoryStore | `new MemoryStore()` | Process-local; copies values |
| JsonStore | `new JsonStore('./data/store.json')` | In memory, atomically replaces JSON file after changes |
| SqliteStore | `new SqliteStore('./data/store.db')` | Node built-in SQLite, WAL; `':memory:'` for tests |

```js
import {JsonStore, SqliteStore} from 'shiver-framework';
const json = new JsonStore('./data/example.json');
await json.set('ready', true);
await json.flush();
await json.close();
const sqlite = new SqliteStore(':memory:');
await sqlite.set('ready', true);
console.log(await sqlite.get('ready'));
await sqlite.close();
```

Parents are created as needed. `bot.stop()` closes the store, flushing JSON writes. Do not give multiple processes one JSON file. SQLite may emit Node's experimental warning. Back up persistent files and mount durable container volumes.

A custom store implements `get(key): Promise<value | undefined>`, `set(key, value, {ttl}?): Promise<void>`, `delete(key): Promise<boolean>`, `keys(prefix?): Promise<string[]>`, and optional `close(): Promise<void>`. Use a shared database adapter for state spanning processes. Read/modify/write sequences are not atomic transactions through this interface.
