#!/usr/bin/env bash
set -euo pipefail
# Show session timeline
# Usage: timeline.sh [-t <types>] [-w <width>] [--timestamps] [--colors[=auto|always|never]] <session_id_or_file> [range]
# Types: U=User, T=Think, R=Response, F=File, W=Web, B=Bash, G=Grep, A=Agent, S=Skill, Q=Question, D=toDo, C=Compact
# Default: all types (UTRFWBGASQDC)
# Range: ..marker (from start), marker.. (to end), marker..marker (between)
#   Markers support offset: marker-N, marker+N

SCRIPT_DIR="$(dirname "$0")"
TYPES="UTRFWBGASQDC"
WIDTH=55
TIMESTAMPS=false
COLORS=auto

USAGE="Usage: ${_PROG:-$0} [-t <types>] [-w <width>] [--timestamps] [--colors[=auto|always|never]] <session_id_or_file> [range]"

if [[ "${1:-}" == "--help" ]]; then
  cat <<EOF
$USAGE

Types (default: UTRFWBGASQDC):
  U=User  T=Think  R=Response  F=File    W=Web
  B=Bash  G=Grep   A=Agent     S=Skill   Q=Question
  D=toDo  C=Compact

Range: ..marker, marker.., marker..marker
  Markers support offset: marker-N, marker+N
  Example: Uefb128a2-2..Uefb128a2+2
EOF
  exit 0
fi

# Parse long options first, collect remaining args
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timestamps)
      TIMESTAMPS=true
      shift
      ;;
    --colors)
      COLORS=auto
      shift
      ;;
    --colors=*)
      COLORS="${1#--colors=}"
      shift
      ;;
    --no-colors)
      COLORS=never
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

# Restore positional args for getopts
set -- "${ARGS[@]+"${ARGS[@]}"}"

while getopts "t:w:" opt; do
  case $opt in
    t) TYPES="$OPTARG" ;;
    w) WIDTH="$OPTARG" ;;
    *) echo "$USAGE" >&2; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

INPUT="${1:-}"
RANGE="${2:-}"

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

# Colorize output by type character
colorize() {
  awk '
  {
    # Detect type character: match TypeChar + 8 hex digits pattern
    if (match($0, /[UTRFWBGASQDC][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]/)) {
      t = substr($0, RSTART, 1)
      if      (t == "U") c = "\033[32m"
      else if (t == "T") c = "\033[90m"
      else if (t == "R") c = "\033[0m"
      else if (t == "F") c = "\033[33m"
      else if (t == "W") c = "\033[36m"
      else if (t == "B") c = "\033[35m"
      else if (t == "G") c = "\033[35m"
      else if (t == "A") c = "\033[34m"
      else if (t == "S") c = "\033[34m"
      else if (t == "Q") c = "\033[92m"
      else if (t == "D") c = "\033[93m"
      else if (t == "C") c = "\033[90m"
      else                c = ""
      printf "%s%s\033[0m\n", c, $0
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
    "$SESSION_FILE"
}

if [[ "$COLORS" == "true" ]]; then
  jq_output | colorize
else
  jq_output
fi
