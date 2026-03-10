#!/bin/bash
# Claude Code pre-tool hook: git push を全てブロックし just push へ誘導する

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# git push がコマンド位置にあるかチェック（行頭 or コマンドセパレータ直後）
# コミットメッセージ等の文字列内にある git push は無視される
if ! echo "$command" | grep -qE '(^|&&|;|\|\|)\s*git\s+push\b'; then
  exit 0
fi

echo "BLOCK: git push は直接実行できません。just push を使ってください。" >&2
echo "バージョンbump不要なら: just push-without-bump" >&2
exit 2
