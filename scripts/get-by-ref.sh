#!/bin/bash
# Get details from ref (id-U, id-T, id-R, id-W format)
# Usage: get-by-ref.sh <session_id_or_file> <ref>

INPUT="$1"
REF="$2"
SCRIPT_DIR="$(dirname "$0")"

if [[ -z "$INPUT" || -z "$REF" ]]; then
  echo "Usage: $0 <session_id_or_file> <id>-<U|T|R|W>" >&2
  exit 1
fi

if [[ -f "$INPUT" ]]; then
  SESSION_FILE="$INPUT"
else
  SESSION_FILE=$("$SCRIPT_DIR/resolve-session.sh" "$INPUT") || exit 1
fi

# Fields to omit from output
OMIT_KEYS='["signature", "isSidechain", "userType", "version", "slug", "requestId", "sessionId", "stop_reason", "stop_sequence", "usage", "id", "role"]'

# Parse ref into id and type (id-type format)
ID="${REF%%-*}"
TYPE="${REF#*-}"

case "$TYPE" in
  U)
    result=$(jq -c "objects | select(.type==\"user\") | select(.uuid // \"\" | startswith(\"$ID\"))" "$SESSION_FILE" 2>/dev/null)
    ;;
  T)
    result=$(jq -c "objects | select(.type==\"assistant\") | select(.uuid // \"\" | startswith(\"$ID\"))" "$SESSION_FILE" 2>/dev/null)
    ;;
  R)
    result=$(jq -c "objects | select(.type==\"assistant\") | select(.uuid // \"\" | startswith(\"$ID\"))" "$SESSION_FILE" 2>/dev/null)
    ;;
  W)
    result=$(jq -c "objects | select(.type==\"file-history-snapshot\") | select(.messageId // \"\" | startswith(\"$ID\"))" "$SESSION_FILE" 2>/dev/null)
    ;;
  *)
    echo "Unknown type: $TYPE (expected U, T, R, or W)" >&2
    exit 1
    ;;
esac

if [[ -n "$result" ]]; then
  echo "$result" | jq -L "$SCRIPT_DIR" 'include "lib"; omit('"$OMIT_KEYS"')'
  exit 0
fi

echo "Not found: $REF" >&2
exit 1
