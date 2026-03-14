# Syro Usage Guide

## Quick Start

Recommended baseline setup:

- Data Location: choose a separate file if you want cleaner notes
- Algorithm: FSRS
- Review entry: command palette, status bar, or sidebar

After enabling the plugin, search for `Syro` in the command palette and configure the storage mode before large-scale use.

## Core Workflows

### Review notes

You can start note review from the command palette, status bar, or sidebar. During review, Syro can show interval feedback through its floating controls and related UI entry points.

### Review flashcards

You can review flashcards from the command palette or the flashcard sidebar. Syro supports normal review and cram-style review flows.

### Add review content

- Tag or organize notes so they participate in review
- Convert notes or folders into review groups where supported
- Create flashcards using the syntax supported by the plugin

### Maintenance tools

Syro includes commands for:

- viewing statistics
- postponing notes or cards
- rescheduling scheduled items
- inspecting item review metadata

## Migration Advice

If you are migrating from another plugin:

1. Back up the vault first.
2. Disable the old plugin before testing Syro on the same vault.
3. Decide whether review data should stay inside notes or move to a separate storage file.
4. Test migration on a copy of the vault before using it in production.

If you are carrying over an older internal install, make sure the plugin folder is `.obsidian/plugins/syro`. Do not keep using `.obsidian/plugins/obsidian-Syro` as the public install path.

## Algorithms

Syro supports multiple scheduling strategies, including FSRS. If you are tuning parameters, avoid switching algorithms frequently on the same dataset.

- FSRS reference: <https://github.com/open-spaced-repetition/ts-fsrs>

## Debug and Recovery

Some maintenance commands are intended for debugging or data repair. Use them carefully, and keep a backup before bulk operations such as reset, prune, or mass reschedule.
