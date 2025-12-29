#!/bin/bash
# Display session ID on session end for easy reference/resume

input=$(cat)
session_id=$(jq -r '.session_id // empty' <<< "$input")

if [[ -n "$session_id" ]]; then
  echo "Session ID: $session_id" >&2
fi
