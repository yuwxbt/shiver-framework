Bundle definitions, middleware, and resource setup into a reusable plugin with `definePlugin`.

# Plugins

A plugin packages a feature so that it can be added to a bot with one line: the commands it provides, the middleware it needs, and code that opens and closes resources such as a database connection.

```js
import { createBot, defineCommand, definePlugin } from 'shiver-framework';

const health = definePlugin({
  name: 'health',
  definitions: [
    defineCommand({
      name: 'health',
      description: 'Show whether the bot is healthy',
      run: (ctx) => ctx.reply('All good.'),
    }),
  ],
});

const bot = createBot({ dir: './src', plugins: [health] });

await bot.start();
```

Use a plugin when a feature is shared between bots, published as a package, or owns a resource with a lifecycle. Features that live in one bot can stay as plain files under `dir`.

## Add commands and handlers

`definitions` is an array of anything the `define*` functions return. The definitions are registered when the bot is created, next to the ones loaded from `dir`, and they are kept across [watched reloads](configuration.md#reload-on-file-changes).

A plugin usually exports a function, so that the bot can configure it:

```js
import { defineCommand, defineComponent, definePlugin, button, container } from 'shiver-framework';

export function tickets({ category = 'Support' } = {}) {
  return definePlugin({
    name: 'tickets',
    definitions: [
      defineCommand({
        name: 'ticket',
        description: 'Open a support ticket',
        run: (ctx) => ctx.reply(container(
          `Ticket opened in ${category}.`,
          button({ id: `tickets:close:${ctx.user.id}`, label: 'Close', style: 'danger' }),
        )),
      }),
      defineComponent({
        id: 'tickets:close:{owner}',
        run: (ctx) => ctx.update(container('Ticket closed.')),
      }),
    ],
  });
}
```

```js
import { createBot } from 'shiver-framework';
import { tickets } from './plugins/tickets.js';

const bot = createBot({ plugins: [tickets({ category: 'Billing' })] });

await bot.start();
```

Prefix custom ids with the plugin name, as in `tickets:close:...`, so that they cannot collide with ids from the bot or from other plugins.

## Open and close resources

`setup(bot)` runs once while the bot starts, before it logs in. Return a function to have it called when the bot stops:

```js
import { definePlugin, SqliteStore } from 'shiver-framework';

export function audit({ path = './data/audit.db' } = {}) {
  let log;
  return definePlugin({
    name: 'audit',
    use: async (ctx, next) => {
      await next();
      await log.set(`${Date.now()}:${ctx.user.id}`, { kind: ctx.kind, name: ctx.command?.name ?? null });
    },
    setup(bot) {
      log = new SqliteStore(path);
      bot.log.info(`audit log opened at ${path}`);
      return () => log.close();
    },
  });
}
```

The plugin records every handled command, component, and modal in its own database, and closes the database when the bot stops.

| Phase | What happens |
| --- | --- |
| `createBot` | Plugins are validated and ordered. Their `definitions` and `use` middleware are registered |
| `start()` or `prepareREST()` | After definitions and locales are loaded, each `setup(bot)` runs in order and is awaited |
| `stop()` | Cleanup functions run in reverse order, before the client disconnects |

If a `setup` throws, startup fails, and the cleanup functions of the plugins that were already set up run. `setup` and cleanup may be async.

## Add middleware

`use` is a middleware or an array of them. It is added to the bot's global middleware and therefore wraps every command, component, and modal, not only the plugin's own. See [Middleware](middleware.md#choose-where-a-middleware-applies).

To limit a middleware to the plugin's own handlers, put it in `use` on those definitions instead.

## Depend on another plugin

`requires` lists plugin names that must be present. Required plugins are set up first, whatever order you list them in:

```js
import { createBot, definePlugin } from 'shiver-framework';

const database = definePlugin({
  name: 'database',
  setup(bot) {
    bot.log.info('database connected');
    return () => bot.log.info('database closed');
  },
});

const economy = definePlugin({
  name: 'economy',
  requires: ['database'],
  setup(bot) {
    bot.log.info('economy ready');
  },
});

const bot = createBot({ plugins: [economy, database] });

console.log(bot.plugins); // ['database', 'economy']
```

On stop, `economy` is cleaned up before `database`.

## Plugin reference

| Field | Type | Required | What it does |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Unique name. Lowercase letters, digits, and dashes, starting with a letter or digit |
| `definitions` | array | No | Commands, components, modals, events, and tasks to register |
| `use` | middleware or array | No | Global middleware |
| `requires` | `string[]` | No | Names of plugins that must be loaded, and set up first |
| `setup` | `(bot) => void \| (() => void)` | No | Runs at startup. May return a cleanup function. May be async |

`definePlugin` returns a frozen copy of the object. `bot.plugins` lists the names of the loaded plugins in setup order.

## Plugins and the CLI

`shiver check`, `shiver manifest`, and `shiver sync` build their own bot from the files under `--dir`. They do not run your entry file, so they do not see plugins or anything else registered in code.

- To inspect everything, call `bot.manifest()` in your own script.
- To register plugin commands, rely on the sync that runs on `bot.start()`, or call `bot.sync()`.
- Do not run `shiver sync --prune` on a bot with plugin commands. It deletes them, because they are not part of its local set.

## Common mistakes

Every message below has the code `INVALID_PLUGIN`.

| Message | Cause | Fix |
| --- | --- | --- |
| `A plugin needs a lowercase name using letters, digits and dashes.` | The name is missing, or has capitals, spaces, or other characters | Use a name such as `my-plugin` |
| `Duplicate plugin "x".` | Two plugins in `plugins` share a name | Remove one |
| `Required plugin "x" is missing.` | A name in `requires` is not in `plugins` | Add the plugin |
| `Plugin dependency cycle includes "x".` | Plugins require each other | Break the cycle |
| `Plugin "x" definitions must be an array.` | `definitions` is a single definition | Wrap it in an array |
| `Plugin "x" use must contain middleware functions.` | `use` contains something that is not a function | Pass functions |
| `Plugin "x" setup must return a cleanup function or nothing.` | `setup` returned a value such as a connection object | Return a function that closes it |

A plugin command that collides with a command from `dir` fails with `DUPLICATE` when the bot is created or loaded.
