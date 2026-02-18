#!/bin/bash
# Resolve session ID to file path
# Usage: resolve-session.sh <session_id>

SESSION_ID="$1"
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

if [[ -z "$SESSION_ID" ]]; then
  echo "Usage: $0 <session_id>" >&2
  exit 1
fi

SESSION_FILE=$(ls "$CLAUDE_CONFIG_DIR/projects"/*/${SESSION_ID}*.jsonl 2>/dev/null | head -1)

if [[ -z "$SESSION_FILE" ]]; then
  echo "Session not found: $SESSION_ID" >&2
  exit 1
fi

echo "$SESSION_FILE"
