# セッションのタイムラインを表示
# Usage: jq -sf timeline.jq "$SESSION_FILE"

[
  # Write: file-history-snapshot (バックアップ = 書き込み発生)
  (.[] | objects | select(.type=="file-history-snapshot") | select(.snapshot.trackedFileBackups | to_entries | length > 0) |
    . as $snap | .snapshot.trackedFileBackups | to_entries[] | select(.value.backupFileName) | {
      time: .value.backupTime,
      kind: "W",
      desc: "\(.key | split("/")[-2:] | join("/")) \(.value.backupFileName | split("@") | "\(.[0][:8])@\(.[1])")",
      ref: $snap.messageId[:8]
    }
  ),
  # Read from tool_use
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and .name == "Read") | {
      time: $a.timestamp,
      kind: "R",
      desc: (.input.file_path | split("/")[-2:] | join("/")),
      ref: $a.uuid[:8]
    }
  ),
  # USER (isMeta除外)
  (.[] | objects | select(.type=="user" and .isMeta != true and (.message.content | type == "string")) | {
    time: .timestamp,
    kind: "U",
    desc: .message.content[:55],
    ref: .uuid[:8]
  }),
  # THINK (assistant の thinking)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? | select(.type=="thinking") | {
      time: $a.timestamp,
      kind: "T",
      desc: .thinking[:55],
      ref: $a.uuid[:8]
  })
] | sort_by(.time) | unique_by([.time,.kind,.desc]) | .[] | "\(.ref)-\(.kind) \(.desc | gsub("\n"; " "))"
