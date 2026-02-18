#!/usr/bin/env bash
set -euo pipefail

PROG="$(basename "$0" .sh)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS_DIR="${SCRIPT_DIR}/../skills/claude-session-analysis/scripts"

# 利用可能なサブコマンド一覧を説明付きで表示
_list_subcommands() {
  local f name desc max_len=0 names=() descs=()
  for f in "${SCRIPTS_DIR}"/*.sh; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f" .sh)"
    desc="$(sed -n '/^#!/d; /^[^#]/d; s/^# *//p; q' "$f")"
    names+=("$name")
    descs+=("${desc:-}")
    (( ${#name} > max_len )) && max_len=${#name}
  done
  for ((i=0; i<${#names[@]}; i++)); do
    printf "%-${max_len}s  %s\n" "${names[$i]}" "${descs[$i]}"
  done
}

# usage表示
_usage() {
  if [[ "${1:-1}" == "0" ]]; then
    cat <<EOF
Usage: ${PROG} <subcommand> [args...]

Subcommands:
$(_list_subcommands | sed 's/^/  /')

Run '${PROG} <subcommand> --help' for subcommand help.
EOF
  else
    cat <<EOF >&2
Usage: ${PROG} <subcommand> [args...]

Subcommands:
$(_list_subcommands | sed 's/^/  /')

Run '${PROG} <subcommand> --help' for subcommand help.
EOF
  fi
  exit "${1:-1}"
}

# 引数チェック
[[ $# -eq 0 ]] && _usage
[[ "$1" == "--help" ]] && _usage 0

subcommand="$1"
shift

# scripts/ 内のスクリプトを探して実行
script="${SCRIPTS_DIR}/${subcommand}.sh"
if [[ -x "$script" ]] || [[ -f "$script" ]]; then
  export _PROG="${PROG} ${subcommand}"
  exec bash "$script" "$@"
fi

echo "Error: unknown subcommand '${subcommand}'" >&2
echo >&2
_usage
