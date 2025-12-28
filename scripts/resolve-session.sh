#!/bin/bash
# Resolve session ID to file path
# Usage: resolve-session.sh <session_id> [dir]

SESSION_ID="$1"

if [[ -z "$SESSION_ID" ]]; then
  echo "Usage: $0 <session_id> [dir]" >&2
  exit 1
fi

# Search in current directory's project (both real path and symlink)
for DIR in "${2:-$(pwd -P)}" "${2:-$(pwd)}"; do
  PROJECT_NAME=$(sed 's|[^A-Za-z0-9]|-|g' <<<"$DIR")
  PROJECT_DIR="$HOME/.claude/projects/$PROJECT_NAME"

  if [[ -d "$PROJECT_DIR" ]]; then
    SESSION_FILE=$(ls "$PROJECT_DIR"/${SESSION_ID}*.jsonl 2>/dev/null | head -1)
    if [[ -n "$SESSION_FILE" ]]; then
      echo "$SESSION_FILE"
      exit 0
    fi
  fi
done

# If not found, search all projects
SESSION_FILE=$(ls "$HOME/.claude/projects"/*/${SESSION_ID}*.jsonl 2>/dev/null | head -1)

if [[ -z "$SESSION_FILE" ]]; then
  echo "Session not found: $SESSION_ID" >&2
  exit 1
fi

echo "$SESSION_FILE"
