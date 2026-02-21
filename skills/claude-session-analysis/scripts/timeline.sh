#!/usr/bin/env bash
set -euo pipefail
# Show session timeline
# Usage: timeline.sh [-t <types>] [-w <width>] [--timestamps] [--colors[=auto|always|never]] [--raw|--raw2] <session_id_or_file> [range]
# Types: U=User, T=Think, R=Response, F=File, W=Web, B=Bash, G=Grep, A=Agent, S=Skill, Q=Question, D=toDo, I=Info
# Default: all types (UTRFWBGASQDI)
# Range: ..marker (from start), marker.. (to end), marker..marker (between)
#   Markers support offset: marker-N, marker+N

SCRIPT_DIR="$(dirname "$0")"
TYPES="UTRFWBGASQDI"
WIDTH=55
TIMESTAMPS=false
COLORS=auto
RAW_MODE=0

show_help() {
  cat <<EOF
Usage: ${_PROG:-$0} [-t <types>] [-w <width>] [--timestamps] [--colors[=auto|always|never]] [--raw|--raw2] <session_id_or_file> [range]

Types (default: UTRFWBGASQDI):
  U=User  T=Think  R=Response  F=File    W=Web
  B=Bash  G=Grep   A=Agent     S=Skill   Q=Question
  D=toDo  I=Info

Range: ..marker, marker.., marker..marker
  Markers support offset: marker-N, marker+N
  Example: Uefb128a2-2..Uefb128a2+2

Options:
  --raw       Output raw JSON (omit + redact)
  --raw2      Output raw JSON (redact only)
  --timestamps  Show timestamps
  --colors[=auto|always|never]  Color output
  --no-colors   Disable colors
EOF
}

# Parse all options with while loop (position-free)
POS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help; exit 0 ;;
    --timestamps) TIMESTAMPS=true; shift ;;
    --raw) RAW_MODE=1; shift ;;
    --raw2) RAW_MODE=2; shift ;;
    --colors) COLORS=always; shift ;;
    --colors=*) COLORS="${1#--colors=}"; shift ;;
    --no-colors) COLORS=never; shift ;;
    -t) TYPES="${2:?-t requires argument}"; shift 2 ;;
    -w) WIDTH="${2:?-w requires argument}"; shift 2 ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *) POS+=("$1"); shift ;;
  esac
done
INPUT="${POS[0]:-}"
RANGE="${POS[1]:-}"

USAGE="Usage: ${_PROG:-$0} [-t <types>] [-w <width>] [--timestamps] [--colors[=auto|always|never]] [--raw|--raw2] <session_id_or_file> [range]"

if [[ -z "$INPUT" ]]; then
  echo "$USAGE" >&2
  exit 1
fi

# Determine if input is file path or session ID
if [[ -f "$INPUT" ]]; then
  SESSION_FILE="$INPUT"
else
  SESSION_FILE=$("$SCRIPT_DIR/resolve-session.sh" "$INPUT") || exit 1
fi

# Parse range (..marker, marker.., marker..marker)
FROM=""
TO=""
if [[ -n "$RANGE" ]]; then
  if [[ "$RANGE" == ..* ]]; then
    # ..marker
    TO="${RANGE#..}"
  elif [[ "$RANGE" == *.. ]]; then
    # marker..
    FROM="${RANGE%..}"
  elif [[ "$RANGE" == *..* ]]; then
    # marker..marker
    FROM="${RANGE%..*}"
    TO="${RANGE#*..}"
  else
    # single marker - show only that one
    FROM="$RANGE"
    TO="$RANGE"
  fi
fi

# Resolve colors mode
if [[ "$COLORS" == "auto" ]]; then
  if [ -t 1 ]; then COLORS=true; else COLORS=false; fi
elif [[ "$COLORS" == "always" ]]; then
  COLORS=true
else
  COLORS=false
fi

# Colorize output by type character with emoji
colorize() {
  awk '
  {
    if (match($0, /[UTRFWBGASQDI][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]/)) {
      t = substr($0, RSTART, 1)
      marker = substr($0, RSTART, 9)
      before = substr($0, 1, RSTART-1)
      after = substr($0, RSTART+9)

      if      (t == "U") { c = "\033[32m"; e = "\xF0\x9F\x91\xA4" }
      else if (t == "T") { c = "\033[34m"; e = "\xF0\x9F\xA7\xA0" }
      else if (t == "R") { c = "\033[34m"; e = "\xF0\x9F\xA4\x96" }
      else if (t == "Q") { c = "\033[34m"; e = "\xF0\x9F\xA4\x96" }
      else if (t == "B") { c = "\033[2m"; e = "\xF0\x9F\x9A\x97" }
      else if (t == "F") {
        c = "\033[2m"
        if (index($0, "no-backup-") || match($0, /@v/)) e = "\xF0\x9F\x93\x9D"
        else e = "\xF0\x9F\x91\x80"
      }
      else if (t == "W") { c = "\033[2m"; e = "\xF0\x9F\x9B\x9C" }
      else if (t == "S") { c = "\033[2m"; e = "\xE2\x9A\xA1\xEF\xB8\x8F" }
      else if (t == "G") { c = "\033[2m"; e = "\xF0\x9F\x94\x8D" }
      else if (t == "A") { c = "\033[2m"; e = "\xF0\x9F\x91\xBB" }
      else if (t == "D") { c = "\033[2m"; e = "\xE2\x9C\x85" }
      else if (t == "I") { c = "\033[2m"; e = "\xE2\x84\xB9\xEF\xB8\x8F" }
      else { c = ""; e = "" }

      printf "%s%s %s%s%s\033[0m\n", c, e, before, marker, after
    } else {
      print
    }
  }'
}

# Run jq
jq_output() {
  jq -rsf "$SCRIPT_DIR/timeline.jq" \
    --arg types "$TYPES" \
    --argjson width "$WIDTH" \
    --arg from "$FROM" \
    --arg to "$TO" \
    --argjson timestamps "$TIMESTAMPS" \
    --argjson raw "$RAW_MODE" \
    "$SESSION_FILE"
}

if [[ "$RAW_MODE" -gt 0 ]]; then
  raw_flag=""
  [[ "$RAW_MODE" -eq 2 ]] && raw_flag="--raw"
  jq_output | while IFS= read -r line; do
    "$SCRIPT_DIR/get-by-marker.sh" $raw_flag "$SESSION_FILE" "$line"
  done
elif [[ "$COLORS" == "true" ]]; then
  jq_output | colorize
else
  jq_output
fi
