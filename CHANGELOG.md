# Changelog

## 3.0.1

### Changed

- Node 22.13 or later is required, because `SqliteStore` uses the built-in `node:sqlite` module.
- Guards run before `defer`, so a rejected user always gets a private reply.
- `defer` and `ephemeral` set on a subcommand group apply to the subcommands inside it.
- The starter project's `dev` and `start` scripts load `.env` before `bot.js` runs, so `DEV_GUILD` works from `.env`.
- The guides are rewritten with complete examples and reference tables, and three are new: CLI, events and tasks, and plugins.

### Fixed

- A prefix alias that matches another command's name is reported at load time.
- `runCommand` fills missing options with their default or `null`, and applies a subcommand's `ephemeral`, as a real interaction does.
- The CLI prints usage for an unknown flag.
- The startup log line uses singular and plural counts correctly.

## 3.0.0

### Added

- ESM feature loading and one command definition for slash and prefix use.
- Unified response context, modal and component collectors, and plain Discord JSON helpers.
- Components V2, message validation, localization, middleware, and async storage.
- Offline testing, standalone TypeScript declarations, and the `shiver` CLI and template.
- Scoped command pruning with `sync --prune`, and offline warnings for prefix commands that use slash autocomplete.
- Read-only command sync previews with `sync --dry-run` and `bot.planSync()`.
- Discord Activity Entry Points, `ctx.launchActivity()`, and effective permission lookups for channel and guild members or roles.
- Components V2 link-preview JSON, numeric component IDs, media scanning flags, and interaction upload limits.
- Select and lazy pagination, RegExp component/modal routes, and async event filters.
- DM, channel type, and role guards, concurrency limits, cooldown exemptions, and autocomplete middleware.
- Nested locale dictionaries, custom locale resolution, and offline prefix message dispatch.
- Reusable plugins with dependency validation, middleware, setup and reverse-order cleanup.
- Gateway-free REST preparation, signed HTTP interactions, and per-channel message cache controls.
- A feature generator, offline application manifests, and custom prefix splitters.

### Changed

- Node 22.12 or later and discord.js 14.28 are required.
- Registration preserves stale Discord commands unless pruning is requested.
- Version 3 is distributed under the Shiver Framework License 1.0.

### Fixed

- Failed reloads keep the previous command, component, event, and task registry.
- Slash commands and user/message context menus can share a name and dispatch by their type.
- Invalid option bounds, choices, and component layouts fail locally. File filters normalize and apply in prefix commands as well as Discord's upload UI.

### Removed

- v2 entry points, feature conventions, and store adapters. See the [migration guide](docs/migrating-from-v2.md).
