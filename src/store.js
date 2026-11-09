import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ms } from './util.js';


const expiry = (o) => (o?.ttl === undefined ? null : Date.now() + ms(o.ttl));

export class MemoryStore {
  map = new Map();

  #live(key) {
    const entry = this.map.get(key);
    if (entry && entry.expires !== null && entry.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key) { return structuredClone(this.#live(key)?.value); }
  async set(key, value, o) { this.map.set(key, { value: structuredClone(value), expires: expiry(o) }); }
  async delete(key) { return this.map.delete(key); }
  async keys(prefix = '') { return [...this.map.keys()].filter((key) => key.startsWith(prefix) && this.#live(key)); }
  async close() {}
}

export class JsonStore extends MemoryStore {
  #path;
  #ready;
  #timer = null;
  #writing = Promise.resolve();

  constructor(path) {
    super();
    this.#path = path;
    this.#ready = readFile(path, 'utf8').then(
      (text) => { this.map = new Map(Object.entries(JSON.parse(text))); },
      (error) => { if (error.code !== 'ENOENT') throw error; },
    );
    this.#ready.catch(() => {});
  }

  #schedule() {
    this.#timer ??= setTimeout(() => { this.#timer = null; this.flush().catch(() => {}); }, 200);
  }

  flush() {
    const write = this.#writing.then(async () => {
      await this.#ready;
      await mkdir(dirname(this.#path), { recursive: true });
      const temp = `${this.#path}.tmp`;
      await writeFile(temp, JSON.stringify(Object.fromEntries(this.map)));
      await rename(temp, this.#path);
    });
    this.#writing = write.catch(() => {});
    return write;
  }

  async get(key) { await this.#ready; return super.get(key); }
  async keys(prefix) { await this.#ready; return super.keys(prefix); }
  async set(key, value, o) { await this.#ready; await super.set(key, value, o); this.#schedule(); }
  async delete(key) { await this.#ready; const had = await super.delete(key); if (had) this.#schedule(); return had; }
  async close() { clearTimeout(this.#timer); this.#timer = null; await this.flush(); }
}

export class SqliteStore {
  #db;
  #ready;

  constructor(path) {
    this.#ready = (async () => {
      const { DatabaseSync } = await import('node:sqlite');
      if (path !== ':memory:') await mkdir(dirname(path), { recursive: true });
      this.#db = new DatabaseSync(path);
      this.#db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER) WITHOUT ROWID;');
    })();
    this.#ready.catch(() => {});
  }

  async get(key) {
    await this.#ready;
    const row = this.#db.prepare('SELECT value, expires FROM kv WHERE key = ?').get(key);
    if (!row) return undefined;
    if (row.expires !== null && row.expires <= Date.now()) { await this.delete(key); return undefined; }
    return JSON.parse(row.value);
  }

  async set(key, value, o) {
    await this.#ready;
    this.#db.prepare('INSERT INTO kv (key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires').run(key, JSON.stringify(value), expiry(o));
  }

  async delete(key) {
    await this.#ready;
    return this.#db.prepare('DELETE FROM kv WHERE key = ?').run(key).changes > 0;
  }

  async keys(prefix = '') {
    await this.#ready;
    const escaped = prefix.replace(/[\\%_]/g, '\\$&');
    return this.#db.prepare("SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' AND (expires IS NULL OR expires > ?)").all(`${escaped}%`, Date.now()).map((row) => row.key);
  }

  async close() { await this.#ready; this.#db.close(); }
}

export function scope(store, prefix) {
  const p = `${prefix}:`;
  return {
    get: (key) => store.get(p + key),
    set: (key, value, o) => store.set(p + key, value, o),
    delete: (key) => store.delete(p + key),
    keys: async (inner = '') => (await store.keys(p + inner)).map((key) => key.slice(p.length)),
  };
}
