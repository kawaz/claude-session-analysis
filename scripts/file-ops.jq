# List Read/Write file operations (Edit merged into Write)
# Usage: jq -sf file-ops.jq "$SESSION_FILE"

[
  .[] | objects | select(.type=="assistant") | .message.content[]? |
  select(.type=="tool_use" and (.name | IN("Read","Edit","Write"))) |
  {tool: (if .name == "Edit" then "Write" else .name end), file: .input.file_path}
] | group_by(.tool) | map({key: .[0].tool, value: [.[].file] | unique}) | from_entries
