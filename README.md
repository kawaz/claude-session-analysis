# claude-session-analysis

A Claude Code plugin for analyzing session files (`.jsonl`) to review past conversations, track file changes, and understand decision-making processes.

## Installation

```bash
claude plugin install kawaz/claude-session-analysis
```

## Usage

```
$ claude-session-analysis --help
Usage: claude-session-analysis <command> [options]

Commands:
  sessions         List available Claude sessions with filtering and search
  timeline         Display session events with filtering and formatting options
  file-ops         Extract file operations from a session
  file-diff        Compare backup file versions or backup vs current file
  resolve-session  Resolve session ID prefix to full ID or file path

Run 'claude-session-analysis <command> --help' for more information on a command.
```

```
$ claude-session-analysis sessions --help
Usage: claude-session-analysis sessions [--grep <pattern>] [--path <pattern>] [--since <spec>] [--limit <N>]

Options:
  --grep <pattern>   Filter sessions by content (regex)
  --path <pattern>   Filter sessions by path (regex)
  --since <spec>     Time filter. Duration: 5m, 1h, 2d, 1h30m
                     or date string: 2024-01-01, 2024-01-01T12:00:00
                     (default: 2d)
  --limit <N>        Show last N sessions (default: 20)
  --help             Show this help
```

```
$ claude-session-analysis timeline --help
Usage: claude-session-analysis timeline [options] <session_id_or_file> [range]

Options:
  -t <types>                  Filter by type (default: UTRFWBGASQDI)
  --width <width>             Truncation width (default: 55)
  --timestamps                Show timestamps
  --no-timestamps             Disable timestamps (overrides md default)
  --color[=auto|always|none]  Color output (default: auto)
  --emoji                     Always show emoji
  --no-emoji                  Never show emoji
  --grep <pattern>            Filter events by desc (regex)
  -A N, --after N             Show N turns after grep match
  -B N, --before N            Show N turns before grep match
  -C N, --context N           Show N turns before and after grep match
  --since <spec>              Show events since (duration: 1h,30m,2d or date)
  --last-since <duration>     Show events since duration before session end
  --last-turn <N>             Show last N turns (U starts a turn)
                              Both: use whichever gives more events
  --md[=auto|source|render|none]  Full text for Q/T/R/U (default: none)
                              auto=render if tty, source otherwise
  --jsonl[=none|redact|full]  JSONL output (default: none)
                              redact: omit+redact, full: redact only
  --help                      Show this help

Types:
  U=User T=Think R=Response F=File W=Web B=Bash
  G=Grep/Glob A=Agent S=Skill Q=Question D=toDo I=Info

Range:
  ..marker    From start to marker
  marker..    From marker to end
  from..to    Between markers
  marker      Single marker only

Examples:
  claude-session-analysis timeline SID                                          Show timeline
  claude-session-analysis timeline /path/to/session.jsonl                       Show timeline from file
  claude-session-analysis timeline SID --md -t RU                               User & Response full text
  claude-session-analysis timeline SID --md -t RUT                              With Think for more context
  claude-session-analysis timeline SID --md -t TRU --last-since 2h --last-turn 10
                                                       Recent turns for context recovery
  claude-session-analysis timeline SID --timestamps                             Show with timestamps
  claude-session-analysis timeline SID --grep "README"                          Filter events matching pattern
  claude-session-analysis timeline SID --grep README -C 1                       Grep with 1 turn context
  claude-session-analysis timeline SID --since 1h                               Show events from last 1 hour
  claude-session-analysis timeline SID --last-turn 3                            Show last 3 turns
  claude-session-analysis timeline SID --last-since 30m                         Show events from last 30m of session
  claude-session-analysis timeline SID Uabc1234..Rabc5678                       Show range between markers
```

## License

MIT License
