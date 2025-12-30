#!/bin/bash
# Returns current session ID candidates
# Claude identifies its own session by matching displays
#
# Usage: current-session.sh [--full] [dir] [sec]
#   --full: Show full session ID
#   dir: Project path (default: pwd)
#   sec: Time window in seconds (default: 300)
#
# Output: JSON with sessionId and last 3 displays (15 chars each) per session
# Claude matches displays with its conversation to identify the correct session

FULL="" SECONDS_AGO="300"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) FULL="1"; shift ;;
    *) break ;;
  esac
done
PROJECT_PATH="${1:-$(pwd -P)}"
[[ -n "$2" ]] && SECONDS_AGO="$2"

LEN=${FULL:+999}; LEN=${LEN:-8}
jq -sc --arg p "$PROJECT_PATH" --argjson sec "$SECONDS_AGO" --argjson len "$LEN" '
  [.[] | select(.project == $p and now - $sec < .timestamp/1000)]
  | group_by(.sessionId)[]
  | sort_by(.timestamp)[-3:]
  | {sessionId: .[0].sessionId[:$len], displays: [.[].display[:15]]}
' ~/.claude/history.jsonl
