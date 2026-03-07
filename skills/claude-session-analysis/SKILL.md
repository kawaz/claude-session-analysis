---
name: claude-session-analysis
description: Analyze Claude Code session files. Find current session ID, view timeline (tl), or search past chats.
---

# Claude Session Analysis

This is `{SKILL_DIR}/SKILL.md`. CLI: `{SKILL_DIR}/bin/claude-session-analysis`

My session ID: `${CLAUDE_SESSION_ID}`

| Subcommand | Description |
|--------|-------------|
| `sessions [--since <=2d>] [--limit <N=20>] [--project REGEXP] [--grep REGEXP]` | Search sessions |
| `timeline <id> [--since 2h] [--md] [-t UTR] [--grep REGEXP]` | Timeline (比較的コンパクトなのでSubagentに全部確認させるのが楽) |
| `file-ops <id>` | Read/Write operations |
| `file-diff <id> <hash> <v1> [v2]` | Diff versions (v2 omitted: vs current) |
| `resolve-session [--path] <id_prefix>` | Resolve prefix to full session ID or path |

## Timeline Options

- `-t <types>`: Filter by type (default: all)
- `--width <n>`: Truncation width (default: 55)
- `--timestamps` / `--no-timestamps`: Show timestamps
- `--color[=auto|always|none]`: Color output (default: auto)
- `--emoji` / `--no-emoji`: Emoji display (default: auto, follows color)
- `--grep <pattern>`: Filter events by desc (regex)
- `-A N/--after N`, `-B N/--before N`, `-C N/--context N`: grep match context in turns
- `--since <spec>`: Show events since (duration: `1h`,`30m`,`2d` or date string)
- `--last-since <duration>`: Show events since duration before session end
- `--last-turn <N>`: Show last N turns (U starts a turn)
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
2. **Dive deeper** with `--jsonl` or `--width` for specific entries
3. **Read full context** with `--md` for QTRU entries
