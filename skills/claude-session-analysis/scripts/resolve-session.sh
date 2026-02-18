#!/bin/bash
# Resolve session ID to file path
# Usage: resolve-session.sh <session_id>

SESSION_ID="$1"
_claude_dirs=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
[[ "${_claude_dirs[0]}" != "$HOME/.claude" ]] && _claude_dirs+=("$HOME/.claude")

if [[ -z "$SESSION_ID" ]]; then
  echo "Usage: $0 <session_id>" >&2
  exit 1
fi

SESSION_FILE=""
for _dir in "${_claude_dirs[@]}"; do
  SESSION_FILE=$(ls "$_dir/projects"/*/${SESSION_ID}*.jsonl 2>/dev/null | head -1)
  [[ -n "$SESSION_FILE" ]] && break
done

if [[ -z "$SESSION_FILE" ]]; then
  echo "Session not found: $SESSION_ID" >&2
  exit 1
fi

echo "$SESSION_FILE"
