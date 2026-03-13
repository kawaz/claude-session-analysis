[[ -o interactive ]] || return 0
alias claude-session-analysis="${0:h}/skills/claude-session-analysis/bin/claude-session-analysis"
#functions[claude-session-analysis]="\"${0:h}/skills/claude-session-analysis/bin/claude-session-analysis\" \"\$@\""
fpath=("${0:h}/completions" $fpath)
