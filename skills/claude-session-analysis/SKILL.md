---
name: claude-session-analysis
description: Analyze Claude Code session files (.jsonl) to view timeline, file operations, and version diffs. Use this skill to review past sessions, track decision-making processes, or recover previous file versions.
---

# Claude Session Analysis

This is `{SKILL_DIR}/SKILL.md`. Scripts: `{SKILL_DIR}/scripts/`

| Script | Description |
|--------|-------------|
| `current-session.sh [--full] [dir] [sec]` | Find current session (compact output, use directly) |
| `sessions.sh [--full] [-g kw] [-mmin N] [-n N]` | List sessions (default: 1day, last 10) |
| `resolve-session.sh <id>` | Session ID → file path |
| `timeline.sh [-t <types>] [-w <width>] <id> [range]` | Timeline (default: all, 55 chars; range: `..m`, `m..`, `m..m`) |
| `get-by-marker.sh [--raw] [-A n] [-B n] [-C n] <id> <marker>` | Entry details (with context) |
| `file-ops.sh <id>` | Read/Write operations |
| `file-diff.sh <id> <hash> <v1> [v2]` | Diff versions (v2 omitted: vs current) |
| `summaries.sh <id>` | Session title history |

## Timeline Markers

Format: `{hash}-{type}` (e.g., `7e2451-U`) with `[+N]` for truncated chars

Types (all by default, filter with `-t`):
- **U**: User (includes /commands) | **T**: Think | **F**: File (Write: `{hash}@v{n}`)
- **W**: Web (no truncate) | **B**: Bash | **G**: Grep/Glob
- **A**: Agent | **S**: Skill | **Q**: Question | **D**: toDo

## Paths

- Sessions: `~/.claude/projects/{project-path}/{session-id}.jsonl`
- Backups: `~/.claude/file-history/{session-id}/{hash}@v{version}`

## Examples

```bash
current-session.sh                  # Find session
timeline.sh 3700ae13                # Full timeline
timeline.sh -w 100 3700ae13 7e24..  # From marker, wide
get-by-marker.sh -C 2 3700ae13 7e24-U  # With context
file-diff.sh 3700ae13 713b7a55 1 2  # v1 vs v2
```
