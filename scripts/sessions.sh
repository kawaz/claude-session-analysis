#!/bin/bash
# List sessions for current directory
# Usage: sessions.sh [options] [dir]
#
# Options:
#   --all         Show all sessions (default: last 10)
#   -g KEYWORD    Search for keyword, output session ID only
#   -mmin N       Only sessions modified within N minutes

# Parse options
LIMIT=10
GREP_KEYWORD=""
MMIN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      LIMIT=9999
      shift
      ;;
    -g)
      GREP_KEYWORD="$2"
      shift 2
      ;;
    -mmin)
      MMIN="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

# Try both real path and symlink
PROJECT_DIR=""
for DIR in "${1:-$(pwd -P)}" "${1:-$(pwd)}"; do
  PROJECT_NAME=$(sed 's|[^A-Za-z0-9]|-|g' <<<"$DIR")
  CANDIDATE="$HOME/.claude/projects/$PROJECT_NAME"
  if [[ -d "$CANDIDATE" ]]; then
    PROJECT_DIR="$CANDIDATE"
    break
  fi
done

if [[ -z "$PROJECT_DIR" ]]; then
  echo "No sessions found for: ${1:-$(pwd)}" >&2
  exit 1
fi

# -g option: keyword search mode
if [[ -n "$GREP_KEYWORD" ]]; then
  # Determine files to search (filter by -mmin if specified)
  if [[ -n "$MMIN" ]]; then
    FILES=$(find "$PROJECT_DIR" -type f -mmin "-$MMIN" ! -name 'agent-*' -name '*.jsonl' 2>/dev/null)
  else
    FILES=$(ls -t "$PROJECT_DIR"/*.jsonl 2>/dev/null | grep -v 'agent-' | head -$LIMIT)
  fi

  # Search for keyword
  for f in $FILES; do
    if grep -q "$GREP_KEYWORD" "$f" 2>/dev/null; then
      basename "$f" .jsonl
      exit 0
    fi
  done

  exit 1
fi

# Normal mode: list sessions
echo "# Sessions for: $DIR"
echo "# Transcript dir: $PROJECT_DIR"

# Session list (by modified time, newest first, exclude size 0 and agent-*)
ls -lhtn "$PROJECT_DIR"/*.jsonl 2>/dev/null \
  | perl -pe's/^(\S+\s+){4}(\S+)\s.*\/([^\/]+)\.jsonl$/$2 $3/' \
  | grep -vE '^0 | agent-' \
  | head -$LIMIT \
  | column -t
