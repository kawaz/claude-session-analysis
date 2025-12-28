#!/bin/bash
# セッションのタイムラインを表示
# Usage: timeline.sh <session_id_or_file>

INPUT="$1"
SCRIPT_DIR="$(dirname "$0")"

if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 <session_id_or_file>" >&2
  exit 1
fi

# ファイルパスかセッションIDかを判定
if [[ -f "$INPUT" ]]; then
  SESSION_FILE="$INPUT"
else
  SESSION_FILE=$("$SCRIPT_DIR/resolve-session.sh" "$INPUT")
  if [[ $? -ne 0 ]]; then
    exit 1
  fi
fi

jq -rsf "$SCRIPT_DIR/timeline.jq" "$SESSION_FILE"
