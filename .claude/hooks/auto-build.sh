#!/bin/bash
set -eu -o pipefail
# PostToolUse(Edit|Write) で src/**/*.ts が変更された時にバンドルを再ビルドする
# async フックとして実行される（Claude はビルド完了を待たない）

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# src/ 配下の .ts ファイル以外は無視
[[ "$FILE" != */src/*.ts ]] && exit 0

# 連続編集でのビルド多重実行を防止（debounce: 3秒待ってから実行）
HASH=$(echo -n "$CLAUDE_PROJECT_DIR" | shasum -a 256 | cut -c1-12)
LOCK="${TMPDIR:-/tmp}/claude-session-analysis-build-${HASH}.lock"
trap 'rm -f "$LOCK"' EXIT
echo $$ > "$LOCK"
sleep 3
[[ "$(cat "$LOCK" 2>/dev/null)" != "$$" ]] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

if bun run scripts/build.ts 2>&1; then
  echo "Build succeeded after editing ${FILE##*/}"
else
  echo "Build FAILED after editing ${FILE##*/}"
fi
