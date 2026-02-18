#!/usr/bin/env bash
set -euo pipefail
# Show session title history
# Usage: summaries.sh <session_id_or_file>

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: ${_PROG:-$0} <session_id_or_file>"
  exit 0
fi

INPUT="${1:-}"
SCRIPT_DIR="$(dirname "$0")"

if [[ -z "$INPUT" ]]; then
  echo "Usage: ${_PROG:-$0} <session_id_or_file>" >&2
  exit 1
fi

if [[ -f "$INPUT" ]]; then
  SESSION_FILE="$INPUT"
else
  SESSION_FILE=$("$SCRIPT_DIR/resolve-session.sh" "$INPUT") || exit 1
fi

jq -sf "$SCRIPT_DIR/summaries.jq" "$SESSION_FILE"
