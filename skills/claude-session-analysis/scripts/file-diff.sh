#!/bin/bash
# Show diff between file versions
# Usage: file-diff.sh <session_id> <backup_hash_prefix> <v1> [v2]
#   v2 omitted: diff backup v1 vs current file
# Example: file-diff.sh 3700ae13 43ce204d 1 2
# Example: file-diff.sh 3700ae13 43ce204d 1     # vs current file

SESSION_ID="$1"
HASH_PREFIX="$2"
V1="$3"
V2="$4"

SCRIPT_DIR="$(dirname "$0")"

if [[ -z "$SESSION_ID" || -z "$HASH_PREFIX" || -z "$V1" ]]; then
  echo "Usage: $0 <session_id_prefix> <backup_hash_prefix> <v1> [v2]" >&2
  echo "  v2 omitted: diff backup v1 vs current file" >&2
  exit 1
fi

# Find session directory
SESSION_DIR=$(find ~/.claude/file-history -maxdepth 1 -type d -name "${SESSION_ID}*" | head -1)

if [[ -z "$SESSION_DIR" ]]; then
  echo "Session not found: $SESSION_ID" >&2
  exit 1
fi

# Find backup file for v1
FILE1=$(find "$SESSION_DIR" -name "${HASH_PREFIX}*@v${V1}" | head -1)

if [[ -z "$FILE1" ]]; then
  echo "File not found: ${HASH_PREFIX}*@v${V1}" >&2
  exit 1
fi

if [[ -n "$V2" ]]; then
  # Compare two backup versions
  FILE2=$(find "$SESSION_DIR" -name "${HASH_PREFIX}*@v${V2}" | head -1)
  if [[ -z "$FILE2" ]]; then
    echo "File not found: ${HASH_PREFIX}*@v${V2}" >&2
    exit 1
  fi
else
  # Compare backup with current file
  # Get full hash from backup filename
  BACKUP_FILENAME=$(basename "$FILE1")
  FULL_HASH="${BACKUP_FILENAME%@v*}"

  # Find original file path from session
  SESSION_FILE=$("$SCRIPT_DIR/resolve-session.sh" "$SESSION_ID") || exit 1
  ORIGINAL_PATH=$(jq -rs --arg hash "$FULL_HASH" '
    .[] | objects | select(.type=="file-history-snapshot") |
    .snapshot.trackedFileBackups | to_entries[] |
    select(.value.backupFileName // "" | startswith($hash + "@")) |
    .key
  ' "$SESSION_FILE" | head -1)

  if [[ -z "$ORIGINAL_PATH" || "$ORIGINAL_PATH" == "null" ]]; then
    echo "Could not find original file path for hash: $FULL_HASH" >&2
    exit 1
  fi

  if [[ ! -f "$ORIGINAL_PATH" ]]; then
    echo "Original file no longer exists: $ORIGINAL_PATH" >&2
    exit 1
  fi

  FILE2="$ORIGINAL_PATH"
fi

echo "# diff $FILE1 $FILE2"
diff "$FILE1" "$FILE2" || true
