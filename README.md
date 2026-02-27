# Claude Session Analysis

A Claude Code skill for analyzing session files (`.jsonl`) to review past conversations, track file changes, and understand decision-making processes.

## Features

- **Timeline View**: See the flow of a session with User/Think/Read/Write markers
- **File Operations**: Track which files were read or modified
- **Version Diff**: Compare file versions across edits
- **Session Discovery**: Find and identify your current session

## Installation

```
claude plugin marketplace add kawaz/claude-session-analysis
claude plugin install claude-session-analysis@claude-session-analysis
```

## Usage

Once installed, Claude can use this skill to analyze sessions. Example prompts:

- "Analyze the current session"
- "Show me the timeline of this conversation"
- "What files did we modify in this session?"
- "Show the diff between v1 and v2 of that file"

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `timeline` | Display session events with filtering and formatting options |
| `summaries` | Extract summary information from a session |
| `file-ops` | Extract file operations from a session |
| `get-by-marker` | Retrieve session entries by marker with optional context |
| `file-diff` | Compare backup file versions or backup vs current file |
| `sessions` | List available Claude sessions with filtering and search |
| `resolve-session` | Resolve session ID prefix to full ID or file path |

## Why Use This?

### vs `/compact`

| Aspect | /compact | Session Analysis |
|--------|----------|------------------|
| Thinking process | Lost | Preserved |
| File versions | Lost | Trackable |
| Decision history | Summarized | Detailed |
| Retrieval | One-time | On-demand |

### Benefits

- **Lightweight**: 15MB session → 4KB timeline
- **Accurate**: Exact file paths and version numbers preserved
- **Flexible**: View overview first, drill down as needed
- **Recoverable**: Access previous file versions via `~/.claude/file-history/`

## Session File Structure

Claude Code stores sessions at:
```
~/.claude/projects/{project-path}/{session-id}.jsonl
```

File backups are stored at:
```
~/.claude/file-history/{session-id}/{hash}@v{version}
```

## License

MIT
