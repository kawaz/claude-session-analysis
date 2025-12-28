# summary の変遷を取得
# Usage: jq -sf summaries.jq "$SESSION_FILE"

[.[] | objects | select(.type=="summary") | .summary]
