#!/usr/bin/env bash
set -euo pipefail
# List all sessions
# Usage: sessions.sh [-g kw] [-mmin N] [-n N]
# -g: search keyword, output session ID only
# -mmin N: +N=older than N min, -N/N=newer than N min (default: 1440 = 1day)
# -n N: show last N sessions (default: 10)

_usage() {
  echo "Usage: ${_PROG:-$0} [-g kw] [-mmin N] [-n N]"
  echo "  -g: search keyword, output session ID only"
  echo "  -mmin N: +N=older than N min, -N/N=newer than N min (default: 1440 = 1day)"
  echo "  -n N: show last N sessions (default: 10)"
  exit "${1:-0}"
}

GREP_KEYWORD="" MMIN="1440" TAIL="10" FULL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) _usage 0 ;;
    -g) GREP_KEYWORD="$2"; shift 2 ;;
    -mmin) MMIN="$2"; shift 2 ;;
    -n) TAIL="$2"; shift 2 ;;
    --full) FULL="1"; shift ;;
    *) break ;;
  esac
done

_claude_dirs=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
[[ "${_claude_dirs[0]}" != "$HOME/.claude" ]] && _claude_dirs+=("$HOME/.claude")
_projects=()
for _d in "${_claude_dirs[@]}"; do [[ -d "$_d/projects" ]] && _projects+=("$_d/projects"); done
{ grep -rm1 '"cwd"' "${_projects[@]}" 2>/dev/null | grep -vE '/agent-[^/]+\.jsonl:{' || true; } | \
perl -CSD -e '
  use utf8;
  use Encode qw(decode);
  my ($kw,$mmin,$tail,$full)=map{decode("UTF-8",$_)}@ARGV;
  my (@all,@f);
  while(<STDIN>){
    /^(.+\.jsonl):(.*)/ or next;
    my($file,$json)=($1,$2);
    my @s=stat($file);
    next if$s[7]==0;
    my($sid)=$json=~/"sessionId"\s*:\s*"([^"]+)"/;
    my($cwd)=$json=~/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/;
    my$e=[$file,$s[9],$s[7],$sid||"?",$cwd||"?"];
    push @all,$e;
    if($mmin){my$age=time-$s[9];if($mmin=~/^\+(\d+)/){next if$age<=$1*60}elsif($mmin=~/^-?(\d+)/){next if$age>$1*60}}
    push @f,$e;
  }
  @all=sort{$a->[1]<=>$b->[1]}@all;
  @f=sort{$a->[1]<=>$b->[1]}@f;
  if($kw){
    my@matched;
    for my$e(@f){
      next unless$e;
      open my$h,"<:utf8",$e->[0] or next;
      while(<$h>){
        if(/(.{0,20})\Q$kw\E(.{0,20})/){
          my($pre,$post)=($1,$2);
          $pre=~s/.*\n//s;$post=~s/\n.*//s;
          my$ctx="$pre$kw$post";
          $ctx=~s/[\r\n]/ /g;
          push@matched,[@$e,$ctx];
          last
        }
      }
    }
    @f=@matched;
  }
  sub h{my$s=shift;my($v,$u)=$s>=1e9?($s/1e9,"G"):$s>=1e6?($s/1e6,"M"):($s/1e3,"K");$v>=100?sprintf("%3d%s",int($v),$u):$v>=10?sprintf("%3d%s",int($v),$u):sprintf("%3.1f%s",$v,$u)}
  sub ago{my$d=time-shift;my($v,$u)=$d<60?($d,"s"):$d<3600?(int($d/60),"m"):$d<86400?(int($d/3600),"h"):(int($d/86400),"d");sprintf"%2d%s",$v,$u}
  my@out=$tail?@f[-$tail..-1]:@f;
  if(@all){printf"# %d sessions (%s .. %s)\n",scalar(@all),ago($all[0][1]),ago($all[-1][1])}
  for my$e(@out){
    next unless$e;
    my$sid=$full?$e->[3]:substr($e->[3],0,8);
    my$dir=$e->[4];unless($full){$dir=~s|.*/([^/]+/[^/]+)$|$1|};
    my$ctx=$e->[5]?"\t$e->[5]":"";
    printf"%s\t%s\t%s\t%s%s\n",ago($e->[1]),h($e->[2]),$sid,$dir,$ctx;
  }
' "$GREP_KEYWORD" "$MMIN" "$TAIL" "$FULL"
