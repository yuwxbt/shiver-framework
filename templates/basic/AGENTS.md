# Agent guide

This bot uses shiver-framework. Before changing code, read
`node_modules/shiver-framework/AGENTS.md` — it is the complete, current API in one file.

- Every file under `src/` is loaded automatically. Export values created with
  `defineCommand`, `defineComponent`, `defineModal`, `defineEvent` or `defineTask`.
- After every change run `npm run check`. It loads and validates everything without
  connecting to Discord and prints exactly what to fix.
- Never commit `.env`.
