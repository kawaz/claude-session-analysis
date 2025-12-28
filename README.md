# Claude Session Analysis

A Claude Code skill for analyzing session files (`.jsonl`) to review past conversations, track file changes, and understand decision-making processes.

## Features

- **Timeline View**: See the flow of a session with User/Think/Read/Write markers
- **File Operations**: Track which files were read or modified
- **Version Diff**: Compare file versions across edits
- **Session Discovery**: Find and identify your current session

## Installation

### Via Plugin Marketplace (Recommended)

```
/plugin marketplace add kawaz/claude-plugins
/plugin install claude-session-analysis@kawaz-claude-plugins
```

### As a Standalone Skill

```bash
# Personal (user-level)
cd ~/.claude/skills
git clone https://github.com/kawaz/claude-session-analysis.git
cd claude-session-analysis
mv skills/claude-session-analysis/* .
rmdir skills/claude-session-analysis skills

# Project-level
cd your-project/.claude/skills
# (same steps as above)
```

## Usage

Once installed, Claude can use this skill to analyze sessions. Example prompts:

- "Analyze the current session"
- "Show me the timeline of this conversation"
- "What files did we modify in this session?"
- "Show the diff between v1 and v2 of that file"

## Scripts

| Script | Description |
|--------|-------------|
| `current-session.sh` | Get current session ID candidates |
| `timeline.sh` | Show session timeline (U/T/R/W) |
| `get-by-ref.sh` | Get details from timeline reference |
| `file-ops.sh` | List Read/Write operations |
| `file-diff.sh` | Show diff between file versions |
| `sessions.sh` | List sessions for a directory |
| `summaries.sh` | Show session title history |

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
