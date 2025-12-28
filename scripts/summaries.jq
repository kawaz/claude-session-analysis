# Get summary history
# Usage: jq -sf summaries.jq "$SESSION_FILE"

[.[] | objects | select(.type=="summary") | .summary]
