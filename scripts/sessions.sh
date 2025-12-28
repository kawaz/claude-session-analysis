#!/bin/bash
# カレントディレクトリに対応するセッション一覧を表示
# Usage: sessions.sh [options] [dir]
#
# Options:
#   --all         全セッションを表示（デフォルト: 最新10件）
#   -g KEYWORD    キーワードを含むセッションを検索（最新1件のIDのみ出力）
#   -mmin N       N分以内に更新されたセッションのみ対象（デフォルト: 制限なし）

# オプション解析
LIMIT=10
GREP_KEYWORD=""
MMIN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      LIMIT=9999
      shift
      ;;
    -g)
      GREP_KEYWORD="$2"
      shift 2
      ;;
    -mmin)
      MMIN="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

# 実パスとシンボリックリンク両方を試す
PROJECT_DIR=""
for DIR in "${1:-$(pwd -P)}" "${1:-$(pwd)}"; do
  PROJECT_NAME=$(sed 's|[^A-Za-z0-9]|-|g' <<<"$DIR")
  CANDIDATE="$HOME/.claude/projects/$PROJECT_NAME"
  if [[ -d "$CANDIDATE" ]]; then
    PROJECT_DIR="$CANDIDATE"
    break
  fi
done

if [[ -z "$PROJECT_DIR" ]]; then
  echo "No sessions found for: ${1:-$(pwd)}" >&2
  exit 1
fi

# -g オプション: キーワード検索モード
if [[ -n "$GREP_KEYWORD" ]]; then
  # 検索対象ファイルを決定（-mmin があれば絞り込み）
  if [[ -n "$MMIN" ]]; then
    FILES=$(find "$PROJECT_DIR" -type f -mmin "-$MMIN" ! -name 'agent-*' -name '*.jsonl' 2>/dev/null)
  else
    FILES=$(ls -t "$PROJECT_DIR"/*.jsonl 2>/dev/null | grep -v 'agent-' | head -$LIMIT)
  fi

  # キーワードで検索
  for f in $FILES; do
    if grep -q "$GREP_KEYWORD" "$f" 2>/dev/null; then
      basename "$f" .jsonl
      exit 0
    fi
  done

  exit 1
fi

# 通常モード: セッション一覧表示
echo "# Sessions for: $DIR"
echo "# Transcript dir: $PROJECT_DIR"

# セッション一覧（更新日時順、新しい順、サイズ0とagent-*は除外）
ls -lhtn "$PROJECT_DIR"/*.jsonl 2>/dev/null \
  | perl -pe's/^(\S+\s+){4}(\S+)\s.*\/([^\/]+)\.jsonl$/$2 $3/' \
  | grep -vE '^0 | agent-' \
  | head -$LIMIT \
  | column -t
