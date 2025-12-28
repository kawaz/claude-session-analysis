#!/bin/bash
# 現在のセッションID候補を返す
# Claude に自分のセッションを判断させる方式
#
# Usage: current-session.sh [project_path] [seconds]
#   project_path: プロジェクトパス（デフォルト: pwd）
#   seconds: 何秒以内のセッションを対象にするか（デフォルト: 300）
#
# 出力: 各セッションの最近3件の display（先頭15文字）を含む JSON
# Claude は自分の会話内容と照合して、正しいセッションIDを選択する

PROJECT_PATH="${1:-$(pwd -P)}"
SECONDS_AGO="${2:-300}"

jq -sc --arg p "$PROJECT_PATH" --argjson sec "$SECONDS_AGO" '
  [.[] | select(.project == $p and now - $sec < .timestamp/1000)]
  | group_by(.sessionId)[]
  | sort_by(.timestamp)[-3:]
  | {sessionId: .[0].sessionId, displays: [.[].display[:15]]}
' ~/.claude/history.jsonl
