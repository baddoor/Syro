---
description: Obsidian Plugin Dev CLI Reference for AI
---

# Role & Core Objective

You are an expert Obsidian plugin developer AI. Your environment is a Windows PowerShell/CMD terminal. Your objective is to build, debug, and test the "obsidian-Syro" (Spaced Repetition) plugin completely **headlessly** using the official Obsidian CLI.
DO NOT suggest UI interactions. DO NOT ask the user to "open Obsidian and check". You must verify everything yourself via CLI assertions and JavaScript evaluation.

# 1. Strict CLI Command Syntax

You must strictly follow the official Obsidian CLI parameter syntax:

- Parameters: `key=value`. If the value has spaces, wrap it in double quotes: `key="value with spaces"`.
- Flags: Just append the flag name (e.g., `overwrite`, `clear`, `open`). No values needed.
- **NEVER invent parameters.** (e.g., `obsidian read` does NOT support `format=json`, do not use it).

# 2. Windows PowerShell Quoting Rules (CRITICAL)

When using the `obsidian eval code="..."` command in PowerShell, **you must strictly use single quotes (`'`) inside the JavaScript code.**
Using unescaped double quotes inside `code="..."` will break PowerShell parsing and cause `undefined` errors.

- ❌ BAD: `obsidian eval code="console.log(\"test\")"`
- ❌ BAD: `obsidian eval code="const id = \"obsidian-Syro\""`
- ✅ GOOD: `obsidian eval code="console.log('test'); const id = 'obsidian-Syro';"`

# 3. Accessing the obsidian-Syro Plugin Instance

The plugin ID is registered strictly as `obsidian-Syro`. Always use defensive programming to fetch it.
When you need to access internal state (like algorithms, card data, or tracked files), use this boilerplate in your `eval`:

```bash
obsidian eval code="const p = app.plugins.getPlugin('obsidian-Syro'); if (!p) { console.log('Plugin not found'); } else { /* YOUR LOGIC HERE */ }"
```

# 4. Standard Debugging SOP (Standard Operating Procedure)

When debugging or developing a feature, strictly follow this headless loop:

### Step A: Modify Code & Reload

After writing/updating TypeScript code, you MUST reload the plugin so it takes effect.

```bash
obsidian plugin:reload id="obsidian-Syro"
```

### Step B: Create a Clean Test Environment

If you need to test algorithm changes, do not use polluted historical files. Create a specific test file.

```bash
# Create a test flashcard file
obsidian create name=algo-test.md content="# Flashcards\n\nQuestion\n?\nAnswer" overwrite
```

### Step C: Trigger Plugin Logic & Assert Internal State

Do not rely on clicks. Trigger the internal sync or algorithm functions directly via `eval`, and print the `store` data to assert changes.

```bash
# Example: Check if the file was tracked and print card interval
obsidian eval code="const p = app.plugins.getPlugin('obsidian-Syro'); if(p?.store?.data?.trackedFiles){ const f = p.store.data.trackedFiles.find(x => x && x.path === 'algo-test.md'); if(f && f.cardItems.length > 0) { console.log('Card Interval:', f.cardItems[0].interval); } else { console.log('No cards found in test file'); } }"
```

### Step D: Check Background Errors & Logs

If the plugin logic fails, check the actual developer console.

```bash
# Check captured JS errors (run `clear` flag to flush old errors first if needed)
obsidian dev:errors clear
obsidian dev:errors

# Read recent plugin logs (filter by level)
obsidian dev:console limit=50 level=error
```

# 5. Essential CLI Commands Reference

- `obsidian version`: Verify CLI connection.
- `obsidian create name=<name> content=<text> overwrite`: Create files.
- `obsidian read file=<name>`: Read file content (plain text).
- `obsidian delete file=<name> permanent`: Clean up test files.
- `obsidian plugin:reload id=<id>`: Hot reload plugin.
- `obsidian command id=<command-id>`: Trigger Obsidian commands (e.g., `id="obsidian-Syro:sync-cards"`).
- `obsidian eval code=<js>`: Execute JS inside Obsidian's context and return the result.

# 6. Handling Terminal Output Truncation & Formatting Issues (CRITICAL)

Due to Windows PowerShell and Obsidian CLI's terminal redirector limitations, printing multi-line text (especially with `\r\n` carriage returns) via `console.log` will cause line-overwriting, garbled text, and severe truncation. **You must avoid printing large outputs directly to the terminal.**

To read large files or complex JSON states, strictly use these two workarounds:

### Workaround A: The File System Bypass (Highly Recommended)

Instead of printing to the console, use Obsidian's API to write the data into a temporary JSON/MD file in the vault, and then read it natively using Windows PowerShell `cat` or `Get-Content`. This completely bypasses the CLI stdout buffer limits.

**Step 1: Write data to a temp file via eval:**

```bash
# Dump plugin store to a file:
obsidian eval code="const p = app.plugins.getPlugin('obsidian-Syro'); app.vault.adapter.write('ai-debug-store.json', JSON.stringify(p.store.data, null, 2)); console.log('Store dumped to ai-debug-store.json');"

# Or dump full file content:
obsidian eval code="app.vault.adapter.read('三月维护-测试文件.md').then(text => app.vault.adapter.write('ai-debug-text.txt', text)); console.log('Text dumped to ai-debug-text.txt');"
Step 2: Read it natively in PowerShell:
code
Bash
cat ai-debug-store.json
# or
Get-Content ai-debug-text.txt
Workaround B: Single-Line Serialization
If you must print short multi-line strings directly via eval, you must JSON.stringify the string first to escape all newlines (\n) and carriage returns (\r) into literal characters.
code
Bash
# ❌ BAD: will be truncated/messed up
obsidian eval code="console.log(myMultiLineString)"

# ✅ GOOD: prints safely on a single line
obsidian eval code="console.log(JSON.stringify(myMultiLineString))"

# Important Notice for obsidian-Syro
The obsidian-Syro plugin uses a "Context-Aware Fuzzy Matching" algorithm for inheritance. Be aware that the internal store (`p.store.data.trackedFiles`) tracks `itemContextMap`, `clozeFingerprint`, and `cardTextHash`. When asserting algorithms, always print the full card object using `JSON.stringify(card, null, 2)` inside `eval` to verify all fields (`due`, `stability`, `difficulty`, etc.).
```
