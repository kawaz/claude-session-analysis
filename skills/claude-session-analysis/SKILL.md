---
name: claude-session-analysis
description: Analyze Claude Code session files. Find current session ID, view timeline (tl), or search past chats.
---

# Claude Session Analysis

This is `{SKILL_DIR}/SKILL.md`. CLI: `{SKILL_DIR}/bin/claude-session-analysis`

My session ID: `${CLAUDE_SESSION_ID}`

| Subcommand | Description |
|--------|-------------|
| `sessions [--grep kw] [--since spec] [--limit N]` | Search sessions by keyword/time |
| `timeline [-t <types>] [--width <n>] [--md[=auto\|source\|render\|none]] <id> [range]` | Timeline (default: all, 55 chars) |
| `get-by-marker [--jsonl[=redact\|full]\|--raw\|--raw2] [-A n] [-B n] [-C n] <id> <marker>` | Entry details (with context) |
| `file-ops <id>` | Read/Write operations |
| `file-diff <id> <hash> <v1> [v2]` | Diff versions (v2 omitted: vs current) |
| `summaries <id>` | Session title history |
| `resolve-session [--path] <id_prefix>` | Resolve prefix to full session ID or path |

## Timeline Options

- `-t <types>`: Filter by type (default: all)
- `--width <n>`: Truncation width (default: 55)
- `--timestamps` / `--no-timestamps`: Show timestamps
- `--color[=auto|always|none]`: Color output (default: auto)
- `--emoji` / `--no-emoji`: Emoji display (default: auto, follows color)
- `--grep <pattern>`: Filter events by desc (regex)
- `--md[=auto|source|render|none]`: Show QTRU full text (default: none; auto: render if tty, source otherwise)
- `--jsonl[=none|redact|full]`: JSONL output (default: none; redact: omit+redact, full: redact only)
- Range: `..m` (start to m), `m..` (m to end), `from..to`, `m` (single)

## Timeline Markers

Format: `{type}{hash}` (e.g., `U7e2451`) with `[+N]` for truncated chars

Types (all by default, filter with `-t`):
- **U**: User (includes /commands) | **T**: Think | **R**: Response | **F**: File (Write: `{hash}@v{n}`)
- **W**: Web (no truncate) | **B**: Bash | **G**: Grep/Glob
- **A**: Agent | **S**: Skill | **Q**: Question | **D**: toDo | **I**: Info

## Paths

- Sessions: `~/.claude/projects/{project-path}/{session-id}.jsonl`
- Backups: `~/.claude/file-history/{session-id}/{hash}@v{version}`

## Usage Tips

1. **Start with full timeline** (default width is enough for overview)
2. **Dive deeper** with `get-by-marker` or `-w` for specific entries
3. **Read full context** with `--md` for QTRU entries

⚠️ **Sandbox**: Pipes (`|`) don't work. Use `dangerouslyDisableSandbox: true` when piping output.
