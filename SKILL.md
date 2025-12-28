---
name: claude-session-analysis
description: Analyze Claude Code session files (.jsonl) to view timeline, file operations, and version diffs. Use this skill to review past sessions, track decision-making processes, or recover previous file versions.
---

# Claude Session Analysis

Tools for analyzing Claude Code session files (`.jsonl`).

## Session File Location

```bash
~/.claude/projects/{project-path}/{session-id}.jsonl
```

`project-path` replaces all `[^A-Za-z0-9]` characters with `-`.

## Scripts

### current-session.sh - Get Current Session ID

Returns session candidates for Claude to identify its own session.

```bash
./scripts/current-session.sh              # Last 5 minutes, current directory
./scripts/current-session.sh /path/to     # Specified directory
./scripts/current-session.sh /path/to 600 # Last 10 minutes
```

Output:
```json
{"sessionId":"3700ae13-...","displays":["recent user","messages here"]}
{"sessionId":"841b0544-...","displays":["other session","messages"]}
```

Match the `displays` content with your conversation to identify the correct session.

### timeline.sh - Timeline View

Shows session flow with U/T/R/W markers.

```bash
./scripts/timeline.sh 3700ae13  # Session ID (prefix OK)
```

Output:
```
889ec8e3-U Show me the handoff prompt
3d274417-T User wants to see the handoff skill prompt...
176ecdae-R commands/handoff.md
038db204-W commands/handoff.md 43ce204d@v1
```

- U: User message
- T: Think (AI reasoning)
- R: Read file
- W: Write file (with backup reference)

### get-by-ref.sh - Get Details by Reference

Get full content from timeline reference.

```bash
./scripts/get-by-ref.sh 3700ae13 889ec8e3-U  # User message
./scripts/get-by-ref.sh 3700ae13 3d274417-T  # AI thinking
./scripts/get-by-ref.sh 3700ae13 176ecdae-R  # Read operation
./scripts/get-by-ref.sh 3700ae13 038db204-W  # Write operation
```

### file-ops.sh - File Operations List

List Read/Write files by type.

```bash
./scripts/file-ops.sh 3700ae13
```

### file-diff.sh - File Diff

Show diff between file versions.

```bash
./scripts/file-diff.sh 3700ae13 43ce204d 1 2  # v1 → v2
```

### sessions.sh - Session List

List sessions for current directory.

```bash
./scripts/sessions.sh              # Last 10
./scripts/sessions.sh --all        # All
./scripts/sessions.sh /path/to     # Specified directory
```

### summaries.sh - Summary History

Show session title changes.

```bash
./scripts/summaries.sh 3700ae13
```

## File Backup Location

```bash
~/.claude/file-history/{session-id}/{hash}@v{version}
```

## Workflow Example

```bash
# 1. Get current session ID
./scripts/current-session.sh

# 2. View timeline
./scripts/timeline.sh 3700ae13

# 3. Get details of specific entry
./scripts/get-by-ref.sh 3700ae13 889ec8e3-U

# 4. View file diff
./scripts/file-diff.sh 3700ae13 43ce204d 1 2
```
