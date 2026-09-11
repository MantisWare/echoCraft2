---
name: echocraft-cli
description: Use this skill whenever the user wants to operate on EchoCraft notes, folders, transcriptions, or audio from a terminal or shell. The EchoCraft CLI (`echocraft` binary) talks to the running desktop app over a loopback HTTP bridge and exposes every operation needed for managing notes, folders, transcriptions, and audio, plus config. Trigger this skill when the user mentions "echocraft cli", running shell commands against EchoCraft, automating note workflows, cleaning up a transcription, building agent integrations against EchoCraft, or scripting any EchoCraft operation — even if they don't say "CLI" explicitly.
---

# EchoCraft CLI

Use this reference when running the `echocraft` command-line tool. The CLI is a single binary that operates against the local desktop app via a loopback HTTP bridge.

EchoCraft is local-first and has no hosted backend. Every command reads and writes the desktop app's own SQLite database, so **the desktop app must be running** for the CLI to work.

## Backend

| Backend   | What it talks to                                  | Requirement                                                   |
| --------- | ------------------------------------------------- | ------------------------------------------------------------- |
| **local** | Desktop app's loopback HTTP bridge on `127.0.0.1` | The desktop app is running. Authoritative during a recording. |

When the desktop app starts, it writes `{version, port, token}` to `~/.echocraft/cli-bridge.json` with mode `0600`, picking a free port in the range `8260–8279`. The CLI reads that file automatically. If the file is missing or stale, the bridge is unavailable and commands exit with code 2.

The bridge binds to `127.0.0.1` only and requires the bearer token from that file, so it is not reachable from other machines.

## Output

The CLI auto-detects whether stdout is a TTY:

- TTY → human-readable (table for lists, markdown or text for single resources)
- Pipe/redirect → JSON

Override with `--format <fmt>`. Supported values vary by command:

- Lists (`notes list`, `notes search`, `folders list`, `transcriptions list`): `json|table`
- `notes get`: `json|markdown`
- `transcriptions get`: `json|text`
- `notes create`, `notes update`, `folders create`: no `--format` flag — always emit the full JSON of the created/updated resource on stdout
- Delete-style mutations (`notes delete`, `transcriptions delete`, `audio delete`) and status commands (`config get`, `doctor`, `version`): `--format json` for machine output; otherwise human-readable text

Always pass `--format json` when parsing CLI output programmatically.

## Exit codes

Honor these exit codes when scripting or recovering from errors:

| Code | Meaning                                      | Recovery                                  |
| ---- | -------------------------------------------- | ----------------------------------------- |
| 0    | Success                                      | Continue                                  |
| 1    | User error (bad args, missing required flag) | Fix the command and rerun                 |
| 2    | Bridge unreachable                           | Start the desktop app, then rerun         |
| 3    | Auth failure (stale or rejected token)       | Restart the desktop app to reissue a token |
| 4    | Not found (no such note/transcription/folder) | Check the ID and rerun                    |

## Commands

Noun-verb syntax: `echocraft <noun> <verb>`. Same convention as `gh`, `kubectl`, `aws`, `stripe`.

### Notes

```bash
echocraft notes list [--folder <id>] [--limit N] [--format json|table]
echocraft notes get <id> [--format json|markdown]
echocraft notes create --content <text> | --content-file <path>
                       [--title <t>] [--folder <id>]
echocraft notes update <id> [--content <t>] [--folder <id>] [--title <t>]
echocraft notes delete <id> [--dry-run] [--format json]
echocraft notes search <query> [--limit N] [--format json|table]
```

### Folders

```bash
echocraft folders list [--format json|table]
echocraft folders create --name <name> [--sort-order <n>]
```

Folder names must be unique. Create fails on duplicates (exit code 1 with a clear message).

### Transcriptions

```bash
echocraft transcriptions list [--limit N] [--format json|table]
echocraft transcriptions get <id> [--format json|text]
echocraft transcriptions delete <id> [--dry-run] [--format json]
```

`--format text` returns the plain transcript text body. SRT/VTT export is not currently exposed by the CLI; use `--format json` and post-process if you need timestamped subtitle formats.

### Audio

```bash
echocraft audio delete <transcription-id> [--format json]
```

Deletes the stored recording for a transcription while leaving the transcript itself intact.

### Config

```bash
echocraft config get [--format json]
```

### Doctor

```bash
echocraft doctor [--format json]
```

Probes the desktop bridge and reports what it finds. Run this first when the user reports "the CLI isn't working" — it isolates whether the problem is the desktop app being closed, a stale token file, or something else.

### Version

```bash
echocraft --version    # or: echocraft version
```

## Workflows

### Bulk note operations

Pipe `notes list --format json` through `jq` for filtering, then iterate:

```bash
echocraft notes list --limit 100 --format json | \
  jq -r '.[] | select(.title | contains("draft")) | .id' | \
  while read id; do
    echocraft notes delete "$id"
  done
```

### Searching for context before writing a note

```bash
echocraft notes search "quarterly budget" --format json | jq '.[].id'
```

Use the IDs returned to read related notes with `notes get` before composing the new note's content.

## Configuration files

| File                           | Written by                 | Contains                                         |
| ------------------------------ | -------------------------- | ------------------------------------------------ |
| `~/.echocraft/cli-bridge.json` | The desktop app at startup | `{version, port, token}` for the loopback bridge |

The desktop app writes this file with `0600`. If you see it with looser permissions (e.g., after manual editing), tighten it with `chmod 0600 ~/.echocraft/cli-bridge.json`.

## Troubleshooting

| Symptom                                          | Likely cause                             | Fix                                         |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------------------- |
| `Bridge unreachable` (exit 2) on every command   | Desktop app is not running               | Start the desktop app                       |
| `Auth failed` (exit 3)                           | Token file is stale from a previous run  | Restart the desktop app to reissue a token  |
| `Not found` (exit 4) on a known-existing note    | Wrong ID, or the note was already deleted | Re-list to confirm the ID                   |
| Bridge file readable by other users              | File created or edited outside the app   | `chmod 0600 ~/.echocraft/cli-bridge.json`   |

## Programmatic invocation

When invoking from another program, always pass `--format json` and parse stdout. Inspect the exit code first — non-zero codes (1–4) follow the table above. On error, the CLI writes a plain-text message to **stderr** (not JSON) and exits with the relevant code; capture stderr separately to surface it to users.

Successful list/search responses print a bare JSON array, so `jq '.[]'` is correct. Single-resource gets print the bare object.
