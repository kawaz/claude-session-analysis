#!/bin/bash
# Show diff between file versions
# Usage: file-diff.sh <session_id> <backup_hash_prefix> [v1] [v2]
# Example: file-diff.sh 3700ae13 43ce204d 4 5

SESSION_ID="$1"
HASH_PREFIX="$2"
V1="${3:-1}"
V2="${4:-2}"

if [[ -z "$SESSION_ID" || -z "$HASH_PREFIX" ]]; then
  echo "Usage: $0 <session_id_prefix> <backup_hash_prefix> [v1] [v2]" >&2
  exit 1
fi

# Find session directory
SESSION_DIR=$(find ~/.claude/file-history -maxdepth 1 -type d -name "${SESSION_ID}*" | head -1)

if [[ -z "$SESSION_DIR" ]]; then
  echo "Session not found: $SESSION_ID" >&2
  exit 1
fi

# Find files
FILE1=$(find "$SESSION_DIR" -name "${HASH_PREFIX}*@v${V1}" | head -1)
FILE2=$(find "$SESSION_DIR" -name "${HASH_PREFIX}*@v${V2}" | head -1)

if [[ -z "$FILE1" ]]; then
  echo "File not found: ${HASH_PREFIX}*@v${V1}" >&2
  exit 1
fi

if [[ -z "$FILE2" ]]; then
  echo "File not found: ${HASH_PREFIX}*@v${V2}" >&2
  exit 1
fi

echo "# diff $FILE1 $FILE2"
diff "$FILE1" "$FILE2"
