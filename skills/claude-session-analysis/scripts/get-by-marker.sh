#!/usr/bin/env bash
set -euo pipefail
# Get details from marker (e.g. U7e2451)
# Usage: get-by-marker.sh [--raw] [-A <n>] [-B <n>] [-C <n>] <session_id_or_file> <marker>

RAW=false
NO_REDACT=false
AFTER=0
BEFORE=0

while [[ "${1:-}" == -* ]]; do
  case "$1" in
    --help) echo "Usage: ${_PROG:-$0} [--raw] [-A <n>] [-B <n>] [-C <n>] <session_id_or_file> <marker>"; exit 0 ;;
    --raw) RAW=true; shift ;;
    --no-redact) NO_REDACT=true; shift ;;
    -A) AFTER="$2"; shift 2 ;;
    -B) BEFORE="$2"; shift 2 ;;
    -C) AFTER="$2"; BEFORE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

INPUT="${1:-}"
MARKER="${2:-}"
SCRIPT_DIR="$(dirname "$0")"

if [[ -z "$INPUT" || -z "$MARKER" ]]; then
  echo "Usage: ${_PROG:-$0} [--raw] [-A <n>] [-B <n>] [-C <n>] <session_id_or_file> <marker>" >&2
  exit 1
fi

if [[ -f "$INPUT" ]]; then
  SESSION_FILE="$INPUT"
else
  SESSION_FILE=$("$SCRIPT_DIR/resolve-session.sh" "$INPUT") || exit 1
fi

# Fields to omit from output
OMIT_KEYS='["signature", "isSidechain", "userType", "version", "slug", "requestId", "sessionId", "stop_reason", "stop_sequence", "usage", "id", "role", "parentUuid", "uuid", "thinkingMetadata"]'
# Fields to redact (replace with "[omitted]")
REDACT_KEYS='["data"]'

# Parse marker into type and id (e.g., U7e2451 → type=U, id=7e2451)
TYPE="${MARKER%%[a-f0-9]*}"
ID="${MARKER#"$TYPE"}"

# Determine which field to match based on type
# F type can be either file-history-snapshot (messageId) or tool_use Write/Edit (uuid)
case "$TYPE" in
  F) MATCH_EXPR='((.messageId // "")[:8] == $id or (.uuid // "")[:8] == $id)' ;;
  *) MATCH_EXPR='((.uuid // "")[:8] == $id)' ;;
esac

# Build jq filter for context
if [[ "$BEFORE" -gt 0 || "$AFTER" -gt 0 ]]; then
  # Get entries with context in one jq call
  result=$(jq -rs --arg id "$ID" '
    [.[] | objects | select(.uuid or .messageId)] as $all |
    ($all | to_entries | map(select(.value | '"$MATCH_EXPR"')) | .[0].key) as $idx |
    if $idx then
      ([$idx - '"$BEFORE"', 0] | max) as $start |
      ([$idx + '"$AFTER"', ($all | length) - 1] | min) as $end |
      $all[$start:$end+1] | .[]
    else
      empty
    end
  ' "$SESSION_FILE" 2>/dev/null) || true
else
  # Single entry
  result=$(jq -c --arg id "$ID" 'objects | select('"$MATCH_EXPR"')' "$SESSION_FILE" 2>/dev/null) || true
fi

if [[ -n "$result" ]]; then
  if $RAW && $NO_REDACT; then
    # Fully raw output (hidden option: --raw --no-redact)
    echo "$result" | jq -s '.[]'
  elif $RAW; then
    # Raw but redact sensitive data (with hint)
    echo "$result" | jq -sL "$SCRIPT_DIR" 'include "lib"; .[] | redact_with_hint('"$REDACT_KEYS"')'
  else
    # Default: omit and redact
    echo "$result" | jq -sL "$SCRIPT_DIR" 'include "lib"; .[] | omit('"$OMIT_KEYS"') | redact('"$REDACT_KEYS"')'
  fi
  exit 0
fi

echo "Not found: $MARKER" >&2
exit 1
