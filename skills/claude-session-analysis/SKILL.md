---
name: claude-session-analysis
description: Analyze Claude Code session files (.jsonl) to view timeline, file operations, and version diffs. Use this skill to review past sessions, track decision-making processes, or recover previous file versions.
---

# Claude Session Analysis

`./` = directory of this SKILL.md

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/current-session.sh [sec]` | Get session candidates (default: 300s) |
| `./scripts/sessions.sh [--all] [dir]` | List sessions (time, size, ID) |
| `./scripts/timeline.sh <session-id>` | Timeline view (U/T/R/W markers) |
| `./scripts/get-by-ref.sh [--raw] <session-id> <marker>` | Get entry details |
| `./scripts/file-ops.sh <session-id>` | List Read/Write operations |
| `./scripts/file-diff.sh <session-id> <hash> <v1> [v2]` | Diff between versions (v2 omitted: vs current file) |
| `./scripts/summaries.sh <session-id>` | Session title history |

## Timeline Markers

Format: `{hash}-{type}` (e.g., `7e245120-U`)

- **U**: User message
- **T**: Think (AI reasoning)
- **R**: Read file
- **W**: Write file (with backup ref: `{hash}@v{version}`)

## Paths

- Sessions: `~/.claude/projects/{project-path}/{session-id}.jsonl`
- Backups: `~/.claude/file-history/{session-id}/{hash}@v{version}`

(`project-path` = path with `[^A-Za-z0-9]` → `-`)

## Workflow

```bash
./scripts/current-session.sh                    # Find current session
./scripts/timeline.sh 3700ae13                  # View timeline
./scripts/get-by-ref.sh 3700ae13 7e245120-U     # Get entry details
./scripts/file-diff.sh 3700ae13 713b7a55 1 2    # Compare backup v1 vs v2
./scripts/file-diff.sh 3700ae13 713b7a55 1      # Compare backup v1 vs current
```
