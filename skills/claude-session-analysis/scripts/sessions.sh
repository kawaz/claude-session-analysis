#!/bin/bash
# List sessions for current directory
# Usage: sessions.sh [options] [dir]
#
# Options:
#   --all         Show all sessions (default: last 10)
#   -g KEYWORD    Search for keyword, output session ID only
#   -mmin N       Only sessions modified within N minutes

LIMIT=10 GREP_KEYWORD="" MMIN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) LIMIT=9999; shift ;;
    -g) GREP_KEYWORD="$2"; shift 2 ;;
    -mmin) MMIN="$2"; shift 2 ;;
    *) break ;;
  esac
done

PROJECT_DIR=""
for DIR in "${1:-$(pwd -P)}" "${1:-$(pwd)}"; do
  CANDIDATE="$HOME/.claude/projects/$(sed 's|[^A-Za-z0-9]|-|g' <<<"$DIR")"
  [[ -d "$CANDIDATE" ]] && PROJECT_DIR="$CANDIDATE" && break
done
[[ -z "$PROJECT_DIR" ]] && exit 1

echo "# $PROJECT_DIR"
perl -e '
  my ($dir,$kw,$mmin,$limit)=@ARGV;
  my @f;
  for(glob("$dir/*.jsonl")){
    next if/agent-/;my @s=stat;
    next if$s[7]==0||($mmin&&time-$s[9]>$mmin*60);
    push @f,[$_,$s[9],$s[7]];
  }
  @f=sort{$b->[1]<=>$a->[1]}@f;
  if($kw){
    for(@f){open my$h,"<",$_->[0];while(<$h>){
      if(index($_,$kw)>=0){($_->[0])=~/([^\/]+)\.jsonl$/;print"$1\n";exit 0}
    }}
    exit 1
  }
  sub h{my$s=shift;my($v,$u)=$s>=1e9?($s/1e9,"G"):$s>=1e6?($s/1e6,"M"):($s/1e3,"K");$v>=100?sprintf("%3d%s",int($v),$u):$v>=10?sprintf("%3d%s",int($v),$u):sprintf("%3.1f%s",$v,$u)}
  sub ago{my$d=time-shift;my($v,$u)=$d<60?($d,"s"):$d<3600?(int($d/60),"m"):$d<86400?(int($d/3600),"h"):(int($d/86400),"d");sprintf"%2d%s",$v,$u}
  my $n=0;for(@f){
    last if++$n>$limit;
    ($_->[0])=~/([^\/]+)\.jsonl$/;
    printf"%s\t%s\t%s\n",ago($_->[1]),h($_->[2]),$1;
  }
' "$PROJECT_DIR" "$GREP_KEYWORD" "$MMIN" "$LIMIT"
