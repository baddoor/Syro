# Syro

Syro is an Obsidian plugin for spaced repetition, flashcards, note review, and incremental learning. It helps you review cards and full notes from one workflow without leaving your vault.

- Documentation hub: [docs/docs/en/index.md](./docs/docs/en/index.md)
- Chinese documentation hub: [docs/docs/zh/index.md](./docs/docs/zh/index.md)
- Chinese repository README: [docs/README_ZH.md](./docs/README_ZH.md)
- Releases: <https://github.com/baddoor/Syro/releases>

## What Syro Does

- Review flashcards and full notes in one workflow
- Build incremental learning flows from notes, folders, and review groups
- Use FSRS and multiple queue strategies for spaced repetition
- Store review data in notes or in a separate data file
- Manage postponing, rescheduling, and review statistics from inside Obsidian

If you are looking for an Obsidian plugin for spaced repetition, flashcards, note review, or incremental learning, Syro is designed for that workflow.

## Install

### Community Plugins

Search for `Syro` in Obsidian Community Plugins after the plugin is published there.

### BRAT

Add `baddoor/Syro` in BRAT and install the latest release.

### Manual Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create the folder `.obsidian/plugins/syro` in your vault.
3. Copy those files into that folder.
4. Reload Obsidian and enable `Syro`.

Current manifest/plugin ID: `syro`. If the final public plugin ID changes before release packaging, the manual install folder name must change with it.

## Open Syro

You can start using Syro from:

- the command palette by searching `Syro`
- the status bar
- the sidebars
- note and folder context actions

For detailed walkthroughs, settings references, and troubleshooting guides, start at [docs/docs/en/index.md](./docs/docs/en/index.md) or jump directly to [docs/docs/zh/index.md](./docs/docs/zh/index.md).

## Migration Notes

- Back up the vault before changing storage mode or importing review data from another plugin.
- If you previously used an older internal or historical folder name, move the installed plugin to `.obsidian/plugins/syro`.
- `obsidian-Syro` is no longer the formal public plugin ID or install directory name.

## Commercial and Service Disclosure

This section is reserved for future monetization, CDK sales, account features, or network-dependent services. Current status:

- Paid license or CDK requirement: Not enabled yet
- Account sign-in requirement: Not enabled yet
- Cloud sync or required external service: Not enabled yet
- Data sent to third-party services for core review features: Not enabled yet

## Acknowledgements

Syro builds on open-source ideas and libraries from the Obsidian ecosystem.

- FSRS: <https://github.com/open-spaced-repetition/ts-fsrs>
- cMenu inspiration: <https://github.com/chetachiezikeuzor/cMenu-Plugin>
- Excalidraw release notes inspiration: <https://zsolt.blog>

For license details, see [LICENSE](./LICENSE).
