#!/bin/bash
# Returns current session ID candidates
# Claude identifies its own session by matching displays
#
# Usage: current-session.sh [dir] [sec]
#   dir: Project path (default: pwd)
#   sec: Time window in seconds (default: 300)
#
# Output: JSON with sessionId and last 3 displays (15 chars each) per session
# Claude matches displays with its conversation to identify the correct session

PROJECT_PATH="${1:-$(pwd -P)}"
SECONDS_AGO="${2:-300}"
_claude_dirs=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
[[ "${_claude_dirs[0]}" != "$HOME/.claude" ]] && _claude_dirs+=("$HOME/.claude")
_history_files=()
for _d in "${_claude_dirs[@]}"; do [[ -f "$_d/history.jsonl" ]] && _history_files+=("$_d/history.jsonl"); done

[[ ${#_history_files[@]} -eq 0 ]] && exit 0

jq -sc --arg p "$PROJECT_PATH" --argjson sec "$SECONDS_AGO" '
  [.[] | select(.project == $p and now - $sec < .timestamp/1000)]
  | group_by(.sessionId)[]
  | sort_by(.timestamp)[-3:]
  | {sessionId: .[0].sessionId, displays: [.[].display[:15]]}
' "${_history_files[@]}"
