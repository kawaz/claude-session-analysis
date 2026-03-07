#!/bin/bash
# Claude Code pre-tool hook: git push 時にバンドル・バージョンの整合性をチェック
# "version-pass;" プレフィクスがあればスキップ

# stdin から tool input を読み取る
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# git push を含まなければスキップ（git -C <path> push 等にも対応）
# クォート内の文字列（コミットメッセージ等）を除去してから判定
stripped=$(echo "$command" | sed "s/\"[^\"]*\"//g; s/'[^']*'//g")
if ! echo "$stripped" | grep -qE 'git\b.*\bpush\b'; then
  exit 0
fi

# "version-pass;" プレフィクスがあればスキップ
if echo "$command" | grep -q 'version-pass;'; then
  exit 0
fi

project_root="${CLAUDE_PROJECT_DIR:?CLAUDE_PROJECT_DIR is not set}"

# 1. バンドルビルドチェック: ソースとバンドルの整合性
bundle="$project_root/skills/claude-session-analysis/bin/claude-session-analysis"
if [ -f "$bundle" ]; then
  current_hash=$(md5 -q "$bundle" 2>/dev/null || md5sum "$bundle" | cut -d' ' -f1)
  (cd "$project_root" && bun run scripts/build.ts >/dev/null 2>&1)
  new_hash=$(md5 -q "$bundle" 2>/dev/null || md5sum "$bundle" | cut -d' ' -f1)
  if [ "$current_hash" != "$new_hash" ]; then
    echo "BLOCK: バンドルが最新ではありません。ビルド結果をコミットしてください。" >&2
    echo 'バージョンbump不要なら: : version-pass; git push ...' >&2
    exit 2
  fi
fi

# 2. バージョンチェック: plugin.json と marketplace.json の version が一致しているか
plugin_ver=$(jq -r '.version' "$project_root/.claude-plugin/plugin.json" 2>/dev/null)
market_ver=$(jq -r '.metadata.version' "$project_root/.claude-plugin/marketplace.json" 2>/dev/null)
if [ "$plugin_ver" != "$market_ver" ]; then
  echo "BLOCK: plugin.json ($plugin_ver) と marketplace.json ($market_ver) のバージョンが不一致です。" >&2
  exit 2
fi

# 3. 前回pushからソース変更があるのにバージョンが同じか確認
remote_ver=$(git -C "$project_root" show origin/main:.claude-plugin/plugin.json 2>/dev/null | jq -r '.version' 2>/dev/null)
if [ -n "$remote_ver" ] && [ "$remote_ver" = "$plugin_ver" ]; then
  src_changed=$(git -C "$project_root" diff origin/main --name-only -- 'src/' 'skills/' 'completions/' 2>/dev/null | head -1)
  if [ -n "$src_changed" ]; then
    echo "BLOCK: ソースに変更がありますがバージョンが $plugin_ver のままです。バージョンを上げてください。" >&2
    echo 'バージョンbump不要なら: : version-pass; git push ...' >&2
    exit 2
  fi
fi

exit 0
