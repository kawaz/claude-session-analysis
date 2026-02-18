[[ -o interactive ]] || return 0
functions[claude-session-analysis]="\"${0:h}/bin/claude-session-analysis.sh\" \"\$@\""
fpath=("${0:h}/completions" $fpath)
