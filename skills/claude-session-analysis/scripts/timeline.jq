# Show session timeline with type filtering
# Usage: jq -rsf timeline.jq --arg types "UTF" --argjson width 55 --arg from "" --arg to "" --argjson raw 0 "$SESSION_FILE"
# Types: U=User, T=Think, F=File, W=Web, B=Bash, G=Grep, A=Agent, S=Skill, Q=Question, D=toDo, I=Info

def truncate($w):
  if $w <= 0 then .
  else
    . as $s | ($s | length) as $len |
    if $len <= $w then $s
    else "\($s[:$w])[+\($len - $w)]"
    end
  end;

# Parse range marker: strip type prefix and extract offset
# "Uefb128a2-2" -> {id: "efb128a2", offset: -2}
# "efb128a2+3" -> {id: "efb128a2", offset: 3}
# "efb128a2"   -> {id: "efb128a2", offset: 0}
def parse_range_marker:
  (if test("^[A-Z][a-f0-9]") then .[1:] else . end) |
  if test("[+-][0-9]+$") then
    capture("^(?<id>.+?)(?<offset>[+-][0-9]+)$") |
    {id: .id, offset: (.offset | tonumber)}
  else
    {id: ., offset: 0}
  end;

# Extract HH:MM:SS from ISO timestamp (handles sort suffix like "_00001")
# Remove sort suffix (e.g. "_00001") from timestamp
def clean_time:
  split("_")[0];

. as $all |
[
  # F: File operations (Write/Edit with backup)
  ($all | . as $data |
    # Get first cwd from session
    ([$data[] | objects | select(.cwd != null and .cwd != "") | .cwd][0] // "") as $session_cwd |
    $data[] | objects | select(.type=="file-history-snapshot") | select(.snapshot.trackedFileBackups | to_entries | length > 0) |
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
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content | to_entries[] |
    select(.value.type=="tool_use" and .value.name == "Read") |
    (.value.input.file_path) as $path | {
      time: "\($a.timestamp)_\(.key | tostring | "00000"[:-(.| tostring | length)] + (. | tostring))",
      kind: "F",
      desc: ($path | split("/")[-2:] | join("/")),
      ref: $a.uuid[:8]
    }
  ),
  # F: File Write/Edit without backup (from tool_use)
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content | to_entries[] |
    select(.value.type=="tool_use" and (.value.name == "Write" or .value.name == "Edit")) |
    (.value.input.file_path) as $path | {
      time: "\($a.timestamp)_\(.key | tostring | "00000"[:-(.| tostring | length)] + (. | tostring))",
      kind: "F",
      desc: "\($path | split("/")[-2:] | join("/")) no-backup-\(.value.name | ascii_downcase)",
      ref: $a.uuid[:8]
    }
  ),
  # U: User message (string content, exclude [Request interrupted)
  ($all[] | objects | select(.type=="user" and .isMeta != true and .isCompactSummary != true and (.message.content | type == "string") and (.message.content | startswith("[Request interrupted") | not)) | {
    time: .timestamp,
    kind: "U",
    desc: (if ((.message.content | gsub("^\\s+|\\s+$"; "")) | startswith("<") and endswith(">") and test("<command-name>")) then
      ((.message.content | capture("<command-name>(?<cmd>[^<]+)</command-name>") | .cmd) // "") +
      " " +
      ((.message.content | capture("<command-args>(?<args>[^<]+)</command-args>") | .args) // "")
    else .message.content end),
    ref: .uuid[:8]
  }),
  # U: User message (array content - for agent sessions, exclude tool_result and [Request interrupted)
  ($all[] | objects | select(.type=="user" and .isMeta != true and .isCompactSummary != true and (.message.content | type == "array")) |
    (.message.content[] | select(.type == "text" and (.text | startswith("[Request interrupted") | not))) as $c | {
      time: .timestamp,
      kind: "U",
      desc: $c.text,
      ref: .uuid[:8]
    }
  ),
  # U: System local_command (slash commands like /status)
  ($all[] | objects | select(.type=="system" and (.content | type == "string") and ((.content | gsub("^\\s+|\\s+$"; "")) | startswith("<") and endswith(">") and test("<command-name>"))) | {
    time: .timestamp,
    kind: "U",
    desc: (((.content | capture("<command-name>(?<cmd>[^<]+)</command-name>") | .cmd) // "") +
      " " +
      ((.content | capture("<command-args>(?<args>[^<]+)</command-args>") | .args) // "")),
    ref: .uuid[:8]
  }),
  # T: Think (assistant thinking)
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? | select(.type=="thinking") | {
      time: $a.timestamp,
      kind: "T",
      desc: .thinking,
      ref: $a.uuid[:8]
  }),
  # R: Response (assistant text output, skip whitespace-only)
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? | select(.type=="text" and (.text | gsub("\\s"; "") | length > 0)) | {
      time: $a.timestamp,
      kind: "R",
      desc: .text,
      ref: $a.uuid[:8]
  }),
  # W: Web (WebFetch, WebSearch)
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "WebFetch" or .name == "WebSearch")) | {
      time: $a.timestamp,
      kind: "W",
      desc: (.input.url // .input.query // ""),
      ref: $a.uuid[:8],
      notrunc: true
    }
  ),
  # B: Bash
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "Bash" or .name == "BashOutput")) | {
      time: $a.timestamp,
      kind: "B",
      desc: ((.input.command // .input.description // "") |
        # Shorten full path commands: /a/b/c/d/prog arg -> .../d/prog arg
        if startswith("/") then
          (split(" ") | .[0]) as $cmd | (split(" ")[1:] | join(" ")) as $args |
          ($cmd | split("/")[-2:] | join("/")) as $short |
          "\u2026/\($short)\(if $args != "" then " \($args)" else "" end)"
        else . end),
      ref: $a.uuid[:8]
    }
  ),
  # G: Grep/Glob
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "Grep" or .name == "Glob")) | {
      time: $a.timestamp,
      kind: "G",
      desc: "\(.name): \(.input.pattern // "")",
      ref: $a.uuid[:8]
    }
  ),
  # A: Agent (Task)
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and (.name == "Task" or .name == "TaskOutput")) | {
      time: $a.timestamp,
      kind: "A",
      desc: (if .name == "Task" then "\(.id[-8:]) \(.input.description // ""): \(.input.prompt // "")" else "\(.input.task_id // "") output" end),
      ref: $a.uuid[:8]
    }
  ),
  # S: Skill
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and .name == "Skill") | {
      time: $a.timestamp,
      kind: "S",
      desc: (.input.skill // ""),
      ref: $a.uuid[:8]
    }
  ),
  # Q: Question (AskUserQuestion)
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and .name == "AskUserQuestion") | {
      time: $a.timestamp,
      kind: "Q",
      desc: (.input.questions[0].question // ""),
      ref: $a.uuid[:8]
    }
  ),
  # D: toDo (TodoWrite)
  ($all[] | objects | select(.type=="assistant") as $a | $a.message.content[]? |
    select(.type=="tool_use" and .name == "TodoWrite") | {
      time: $a.timestamp,
      kind: "D",
      desc: "Todo: \(.input.todos | length) items",
      ref: $a.uuid[:8]
    }
  ),
  # I: Info (system-like messages in user type)
  ($all[] | objects | select(.type=="user" and .isCompactSummary == true) | {
    time: .timestamp,
    kind: "I",
    desc: "[auto-compact]",
    ref: .uuid[:8]
  }),
  ($all[] | objects | select(.type=="user" and .isMeta != true and .isCompactSummary != true and (.message.content | type == "array")) |
    (.message.content[] | select(.type == "text" and (.text | startswith("[Request interrupted")))) as $c | {
      time: .timestamp,
      kind: "I",
      desc: $c.text,
      ref: .uuid[:8]
    }
  ),
  ($all[] | objects | select(.type=="user" and .isMeta != true and .isCompactSummary != true and (.message.content | type == "string") and (.message.content | startswith("[Request interrupted"))) | {
    time: .timestamp,
    kind: "I",
    desc: .message.content,
    ref: .uuid[:8]
  })
] | map(select(type == "object" and .kind != null)) | sort_by(.time) | unique_by([.time,.kind,.desc]) |

# Remove no-backup entries when backup exists for same ref
group_by(.ref) | map(
  if (map(.desc) | any(contains("@v"))) then
    map(select(.desc | contains("no-backup") | not))
  else . end
) | flatten | sort_by(.time) |


# Apply range filter with offset support (e.g. "Uefb128a2-2..Uefb128a2+2")
($from | parse_range_marker) as $fp |
($to | parse_range_marker) as $tp |
(if $fp.id != "" then
  (to_entries | map(select(.value.ref | startswith($fp.id))) | .[0].key // 0) + $fp.offset
else 0 end) as $from_idx |
(if $tp.id != "" then
  (to_entries | map(select(.value.ref | startswith($tp.id))) | .[-1].key // (length - 1)) + $tp.offset
else (length - 1) end) as $to_idx |
([([$from_idx, 0] | max), (length - 1)] | min) as $from_clamped |
([([$to_idx, 0] | max), (length - 1)] | min) as $to_clamped |
.[$from_clamped:$to_clamped + 1] |

# Output
.[] |
select(.kind as $k | $types | contains($k)) |
if $raw > 0 then
  "\(.kind)\(.ref)"
else
  (if .notrunc then .desc else (.desc | gsub("\n"; " ") | truncate($width)) end) as $desc_part |
  if $timestamps then
    "\(.time | clean_time) \(.kind)\(.ref) \($desc_part)"
  else
    "\(.kind)\(.ref) \($desc_part)"
  end
end
