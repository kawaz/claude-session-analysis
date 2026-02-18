#!/usr/bin/env bash
set -euo pipefail
# Resolve session ID to file path
# Usage: resolve-session.sh <session_id>

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: ${_PROG:-$0} <session_id>"
  exit 0
fi

SESSION_ID="${1:-}"
_claude_dirs=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
[[ "${_claude_dirs[0]}" != "$HOME/.claude" ]] && _claude_dirs+=("$HOME/.claude")

if [[ -z "$SESSION_ID" ]]; then
  echo "Usage: ${_PROG:-$0} <session_id>" >&2
  exit 1
fi

if [[ ! "$SESSION_ID" =~ ^[a-f0-9]+$ ]]; then
  echo "Invalid session ID: $SESSION_ID" >&2
  exit 1
fi

SESSION_FILE=""
for _dir in "${_claude_dirs[@]}"; do
  SESSION_FILE=$(ls "$_dir/projects"/*/${SESSION_ID}*.jsonl 2>/dev/null | head -1) || true
  [[ -n "$SESSION_FILE" ]] && break
done

if [[ -z "$SESSION_FILE" ]]; then
  echo "Session not found: $SESSION_ID" >&2
  echo "Hint: Use 'claude-session-analysis sessions' to list available sessions" >&2
  exit 1
fi

echo "$SESSION_FILE"
