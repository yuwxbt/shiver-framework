import { ShiverError } from './errors.js';


export function definePlugin(plugin) {
  if (!plugin || typeof plugin.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(plugin.name)) {
    throw new ShiverError('INVALID_PLUGIN', 'A plugin needs a lowercase name using letters, digits and dashes.');
  }
  if (plugin.requires !== undefined && (!Array.isArray(plugin.requires) || !plugin.requires.every((name) => typeof name === 'string' && name))) {
    throw new ShiverError('INVALID_PLUGIN', `Plugin "${plugin.name}" requires an array of plugin names.`);
  }
  if (plugin.definitions !== undefined && !Array.isArray(plugin.definitions)) {
    throw new ShiverError('INVALID_PLUGIN', `Plugin "${plugin.name}" definitions must be an array.`);
  }
  if (plugin.use !== undefined && ![plugin.use].flat().every((fn) => typeof fn === 'function')) {
    throw new ShiverError('INVALID_PLUGIN', `Plugin "${plugin.name}" use must contain middleware functions.`);
  }
  if (plugin.setup !== undefined && typeof plugin.setup !== 'function') {
    throw new ShiverError('INVALID_PLUGIN', `Plugin "${plugin.name}" setup must be a function.`);
  }
  return Object.freeze({ ...plugin });
}

export class PluginSet {
  #cleanup = [];

  constructor(plugins) {
    const byName = new Map();
    for (const plugin of plugins.map(definePlugin)) {
      if (byName.has(plugin.name)) throw new ShiverError('INVALID_PLUGIN', `Duplicate plugin "${plugin.name}".`);
      byName.set(plugin.name, plugin);
    }
    const visiting = new Set();
    const ordered = new Map();
    const visit = (name) => {
      if (ordered.has(name)) return;
      if (visiting.has(name)) throw new ShiverError('INVALID_PLUGIN', `Plugin dependency cycle includes "${name}".`);
      const plugin = byName.get(name);
      if (!plugin) throw new ShiverError('INVALID_PLUGIN', `Required plugin "${name}" is missing.`);
      visiting.add(name);
      for (const required of plugin.requires ?? []) visit(required);
      visiting.delete(name);
      ordered.set(name, plugin);
    };
    for (const name of byName.keys()) visit(name);
    this.ordered = [...ordered.values()];
  }

  async start(bot, signal) {
    for (const plugin of this.ordered) {
      signal.throwIfAborted();
      const cleanup = await plugin.setup?.(bot);
      if (typeof cleanup === 'function') this.#cleanup.push(cleanup);
      else if (cleanup !== undefined) throw new ShiverError('INVALID_PLUGIN', `Plugin "${plugin.name}" setup must return a cleanup function or nothing.`);
    }
  }

  async stop() {
    const errors = [];
    for (const cleanup of this.#cleanup.splice(0).reverse()) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Plugin cleanup failed.');
  }
}
