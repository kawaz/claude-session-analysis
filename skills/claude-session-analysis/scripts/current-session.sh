#!/bin/bash
# Returns current session ID candidates
# Claude identifies its own session by matching displays
#
# Usage: current-session.sh [project_path] [seconds]
#   project_path: Project path (default: pwd)
#   seconds: Time window in seconds (default: 300)
#
# Output: JSON with last 3 displays (15 chars each) per session
# Claude matches displays with its conversation to identify the correct session

PROJECT_PATH="${1:-$(pwd -P)}"
SECONDS_AGO="${2:-300}"

jq -sc --arg p "$PROJECT_PATH" --argjson sec "$SECONDS_AGO" '
  [.[] | select(.project == $p and now - $sec < .timestamp/1000)]
  | group_by(.sessionId)[]
  | sort_by(.timestamp)[-3:]
  | {sessionId: .[0].sessionId, displays: [.[].display[:15]]}
' ~/.claude/history.jsonl
