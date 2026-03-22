# 0.0.4

- Align local reviewer linting with `eslint-plugin-obsidianmd` via `pnpm lint:review`.
- Fix reviewer-blocking Obsidian API, Promise callback, DOM rendering, and typing issues across sync, data, and React review UI paths.
- Remove the direct `moment` package dependency and rely on Obsidian-provided imports.
