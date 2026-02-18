#!/usr/bin/env bash
set -euo pipefail
# Show session timeline
# Usage: timeline.sh [-t <types>] [-w <width>] <session_id_or_file> [range]
# Types: U=User, T=Think, R=Response, F=File, W=Web, B=Bash, G=Grep, A=Agent, S=Skill, Q=Question, D=toDo
# Default: all types (UTRFWBGASQD)
# Range: ..marker (from start), marker.. (to end), marker..marker (between)

SCRIPT_DIR="$(dirname "$0")"
TYPES="UTRFWBGASQD"
WIDTH=55

if [[ "${1:-}" == "--help" ]]; then
  cat <<EOF
Usage: ${_PROG:-$0} [-t <types>] [-w <width>] <session_id_or_file> [range]

Types (default: UTRFWBGASQD):
  U=User  T=Think  R=Response  F=File  W=Web
  B=Bash  G=Grep   A=Agent     S=Skill Q=Question D=toDo

Range: ..marker (from start), marker.. (to end), marker..marker (between)
EOF
  exit 0
fi

while getopts "t:w:" opt; do
  case $opt in
    t) TYPES="$OPTARG" ;;
    w) WIDTH="$OPTARG" ;;
    *) echo "Usage: ${_PROG:-$0} [-t <types>] [-w <width>] <session_id_or_file> [range]" >&2; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

INPUT="${1:-}"
RANGE="${2:-}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: ${_PROG:-$0} [-t <types>] [-w <width>] <session_id_or_file> [range]" >&2
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

jq -rsf "$SCRIPT_DIR/timeline.jq" \
  --arg types "$TYPES" \
  --argjson width "$WIDTH" \
  --arg from "$FROM" \
  --arg to "$TO" \
  "$SESSION_FILE"
