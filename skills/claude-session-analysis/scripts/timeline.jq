# Show session timeline with type filtering
# Usage: jq -rsf timeline.jq --arg types "UTF" --argjson width 55 --arg from "" --arg to "" "$SESSION_FILE"
# Types: U=User, T=Think, F=File, W=Web, B=Bash, G=Grep, A=Agent, S=Skill, Q=Question, D=toDo

def truncate($w):
  if $w <= 0 then .
  else
    . as $s | ($s | length) as $len |
    if $len <= $w then $s
    else "\($s[:$w])[+\($len - $w)]"
    end
  end;

[
  # F: File operations (Write/Edit with backup)
  (. as $all |
    # Get first cwd from session
    ([$all[] | objects | select(.cwd != null and .cwd != "") | .cwd][0] // "") as $session_cwd |
    $all[] | objects | select(.type=="file-history-snapshot") | select(.snapshot.trackedFileBackups | to_entries | length > 0) |
    . as $snap |
    .snapshot.trackedFileBackups | to_entries[] | select(.value.backupFileName) |
    (if .key | startswith("/") then .key else ($session_cwd + "/" + .key) end) as $fullpath |
    {
      time: .value.backupTime,
      kind: "F",
      desc: "\($fullpath | split("/")[-2:] | join("/")) \(.value.backupFileName | split("@") | "\(.[0][:8])@\(.[1])")",
      ref: $snap.messageId[:8]
    }
  ),
  # F: File Read (from tool_use, with index for ordering)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content | to_entries[] |
    select(.value.type=="tool_use" and .value.name == "Read") |
    (.value.input.file_path) as $path | {
      time: "\($a.timestamp)_\(.key | tostring | "00000"[:-(.| tostring | length)] + (. | tostring))",
      kind: "F",
      desc: ($path | split("/")[-2:] | join("/")),
      ref: $a.uuid[:8]
    }
  ),
  # F: File Write/Edit without backup (from tool_use)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content | to_entries[] |
    select(.value.type=="tool_use" and (.value.name == "Write" or .value.name == "Edit")) |
    (.value.input.file_path) as $path | {
      time: "\($a.timestamp)_\(.key | tostring | "00000"[:-(.| tostring | length)] + (. | tostring))",
      kind: "F",
      desc: "\($path | split("/")[-2:] | join("/")) no-backup-\(.value.name | ascii_downcase)",
      ref: $a.uuid[:8]
    }
  ),
  # U: User message (string content)
  (.[] | objects | select(.type=="user" and .isMeta != true and (.message.content | type == "string")) | {
    time: .timestamp,
    kind: "U",
    desc: (if ((.message.content | gsub("^\\s+|\\s+$"; "")) | startswith("<") and endswith(">") and test("<command-name>")) then
      ((.message.content | capture("<command-name>(?<cmd>[^<]+)</command-name>") | .cmd) // "") +
      " " +
      ((.message.content | capture("<command-args>(?<args>[^<]+)</command-args>") | .args) // "")
    else .message.content end),
    ref: .uuid[:8]
  }),
  # U: User message (array content - for agent sessions, exclude tool_result)
  (.[] | objects | select(.type=="user" and .isMeta != true and (.message.content | type == "array")) |
    (.message.content[] | select(.type == "text")) as $c | {
      time: .timestamp,
      kind: "U",
      desc: $c.text,
      ref: .uuid[:8]
    }
  ),
  # U: System local_command (slash commands like /status)
  (.[] | objects | select(.type=="system" and (.content | type == "string") and ((.content | gsub("^\\s+|\\s+$"; "")) | startswith("<") and endswith(">") and test("<command-name>"))) | {
    time: .timestamp,
    kind: "U",
    desc: (((.content | capture("<command-name>(?<cmd>[^<]+)</command-name>") | .cmd) // "") +
      " " +
      ((.content | capture("<command-args>(?<args>[^<]+)</command-args>") | .args) // "")),
    ref: .uuid[:8]
  }),
  # T: Think (assistant thinking)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? | select(.type=="thinking") | {
      time: $a.timestamp,
      kind: "T",
      desc: .thinking,
      ref: $a.uuid[:8]
  }),
  # W: Web (WebFetch, WebSearch)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "WebFetch" or .name == "WebSearch")) | {
      time: $a.timestamp,
      kind: "W",
      desc: (.input.url // .input.query // ""),
      ref: $a.uuid[:8],
      notrunc: true
    }
  ),
  # B: Bash
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "Bash" or .name == "BashOutput")) | {
      time: $a.timestamp,
      kind: "B",
      desc: ((.input.command // .input.description // "") |
        # Shorten full path commands: /a/b/c/d/prog arg -> …/d/prog arg
        if startswith("/") then
          (split(" ") | .[0]) as $cmd | (split(" ")[1:] | join(" ")) as $args |
          ($cmd | split("/")[-2:] | join("/")) as $short |
          "…/\($short)\(if $args != "" then " \($args)" else "" end)"
        else . end),
      ref: $a.uuid[:8]
    }
  ),
  # G: Grep/Glob
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "Grep" or .name == "Glob")) | {
      time: $a.timestamp,
      kind: "G",
      desc: "\(.name): \(.input.pattern // "")",
      ref: $a.uuid[:8]
    }
  ),
  # A: Agent (Task)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "Task" or .name == "TaskOutput")) | {
      time: $a.timestamp,
      kind: "A",
      desc: (if .name == "Task" then "\(.id[-8:]) \(.input.description // ""): \(.input.prompt // "")" else "\(.input.task_id // "") output" end),
      ref: $a.uuid[:8]
    }
  ),
  # S: Skill
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and .name == "Skill") | {
      time: $a.timestamp,
      kind: "S",
      desc: (.input.skill // ""),
      ref: $a.uuid[:8]
    }
  ),
  # Q: Question (AskUserQuestion)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and .name == "AskUserQuestion") | {
      time: $a.timestamp,
      kind: "Q",
      desc: (.input.questions[0].question // ""),
      ref: $a.uuid[:8]
    }
  ),
  # D: toDo (TodoWrite)
  (.[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and .name == "TodoWrite") | {
      time: $a.timestamp,
      kind: "D",
      desc: "Todo: \(.input.todos | length) items",
      ref: $a.uuid[:8]
    }
  )
] | map(select(type == "object" and .kind != null)) | sort_by(.time) | unique_by([.time,.kind,.desc]) |

# Remove no-backup entries when backup exists for same ref
group_by(.ref) | map(
  if (map(.desc) | any(contains("@v"))) then
    map(select(.desc | contains("no-backup") | not))
  else . end
) | flatten | sort_by(.time) |


# Apply range filter
(if $from != "" then (to_entries | map(select(.value.ref | startswith($from))) | .[0].key // 0) else 0 end) as $from_idx |
(if $to != "" then (to_entries | map(select(.value.ref | startswith($to))) | .[-1].key // (length - 1)) else (length - 1) end) as $to_idx |
.[$from_idx:$to_idx + 1] |

# Output with type filter and truncation
.[] |
select(.kind as $k | $types | contains($k)) |
"\(.ref)-\(.kind) \(if .notrunc then .desc else (.desc | gsub("\n"; " ") | truncate($width)) end)"
