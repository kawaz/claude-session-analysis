#!/bin/bash
# Returns current session ID candidates
# Claude identifies its own session by matching displays
#
# Usage: current-session.sh [seconds]
#   seconds: Time window in seconds (default: 300)
#
# Output: JSON with sessionId, project, and last 3 displays (15 chars each) per session
# Claude matches displays with its conversation to identify the correct session

SECONDS_AGO="${1:-300}"

jq -sc --argjson sec "$SECONDS_AGO" '
  [.[] | select(now - $sec < .timestamp/1000)]
  | group_by(.sessionId)[]
  | sort_by(.timestamp)[-3:]
  | {sessionId: .[0].sessionId, project: .[0].project, displays: [.[].display[:15]]}
' ~/.claude/history.jsonl
