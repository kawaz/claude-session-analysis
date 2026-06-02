# claude-session-analysis — kawaz/* 共通テンプレ (bump-semver canonical, cmux-msg/gh-monitor 流儀)
# 構造変更は bump-semver 側を先に直してからこちらへ追従する。

set unstable
set positional-arguments
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set script-interpreter := ["bash", "-eu", "-o", "pipefail"]

version-files := ".claude-plugin/plugin.json .claude-plugin/marketplace.json"

default: list

list:
    @just --list

# CLI を実行 (e.g. `just run timeline <SID> --last-turn 3`)
[script]
run *ARGS:
    bun run src/cli.ts "$@"

# push (bump 済み前提、全 gate 通過後に push してローカル plugin も更新)
push: ensure-clean ci check-versions (check-version-bumped "src/" "scripts/" "skills/" ".claude-plugin/" "tsconfig.json" "bun.lock" "package.json")
    bump-semver vcs push --branch main --jj-bookmark-auto-advance
    @just _local-plugin-reload

# push (bump 不要、ドキュメント更新等のみ)
push-without-bump: ensure-clean ci check-versions
    bump-semver vcs push --branch main --jj-bookmark-auto-advance
    @just _local-plugin-reload

# version を bump して Release commit (push は別途 `just push`)
[script]
bump-version bump="patch": ensure-clean
    new_version=$(bump-semver {{ bump }} {{ version-files }} --write --no-hint)
    bump-semver vcs commit -m "Release v${new_version}" {{ version-files }}

ci: lint typecheck test build check-bundle validate

lint: lint-just lint-ts

lint-just:
    just --fmt --check --unstable

lint-ts: install
    bunx oxlint src/ scripts/
    bunx oxfmt --check src/ scripts/

# 自動整形 (oxfmt --check が落ちたら走らせる)
format: install
    bunx oxfmt src/ scripts/

typecheck: install
    bunx tsc --noEmit

install:
    bun install --frozen-lockfile

test: install
    bun test

build: install mdp-copy
    bun run scripts/build.ts

validate:
    claude plugin validate .

version:
    @bump-semver get {{ version-files }} --no-hint

[private]
ensure-clean:
    bump-semver vcs is clean

# build 後の bundle 差分検出 (path 限定: ci に他の未コミット差分を巻き込まない)
# 初回 commit 前 (jj root commit / git unborn HEAD) は親 rev が無いので静かに skip。
[private]
[script]
check-bundle:
    bundle="skills/claude-session-analysis/bin/claude-session-analysis"
    if bump-semver vcs is jj; then
      rev='@-'
      # jj は @ が root commit (zzzz...) の場合 @- が存在しない。その時は skip。
      if ! jj log -r "$rev" -T '""' >/dev/null 2>&1; then exit 0; fi
    else
      rev='HEAD'
      # git unborn HEAD (= 初回 commit 前) なら skip。
      if ! git rev-parse --verify HEAD >/dev/null 2>&1; then exit 0; fi
    fi
    if ! bump-semver vcs diff -q "$rev" "$bundle"; then
      echo "ERROR: バンドルが最新ではありません。ビルド結果をコミットしてください: $bundle" >&2
      exit 1
    fi

[private]
check-versions:
    @bump-semver get {{ version-files }} --no-hint >/dev/null

[private]
_local-plugin-reload:
    claude plugin marketplace update claude-session-analysis
    claude plugin update claude-session-analysis@claude-session-analysis
    @echo ""
    @echo "[hint] /reload-plugins to apply in this session without restart"

# 引数の paths に main@origin から変更があれば version 必須
[private]
[script]
check-version-bumped +trigger_paths:
    rc=0
    bump-semver vcs diff -q main@origin -- "$@" || rc=$?
    case "$rc" in
      0) exit 0 ;;
      1) ;;
      *) echo "ERROR: bump-semver vcs diff failed (rc=$rc). main@origin 未 track の可能性 (要 fetch)" >&2; exit 1 ;;
    esac
    bump-semver compare gt .claude-plugin/plugin.json vcs:main@origin:.claude-plugin/plugin.json --no-hint && exit 0
    echo 'ERROR: trigger paths が変わってるが version 未 bump。"just bump-version" を実行' >&2
    exit 1

# mdp バイナリを GitHub Release から取得 (差分時のみ)
[script]
mdp-copy:
    local="./skills/claude-session-analysis/bin/mdp"
    latest="$(gh release view --repo kawaz/mdp --json tagName --jq '.tagName' | sed 's/^v//')"
    [ -f "$local" ] && current="$("$local" --version 2>/dev/null | awk '{print $2}')" || current=""
    [ "$current" = "$latest" ] && { echo "mdp is up to date: $current"; exit 0; }
    echo "mdp updating: ${current:-none} -> $latest"
    gh release download "v$latest" --repo kawaz/mdp --pattern "mdp-$latest" --dir /tmp --clobber
    cp "/tmp/mdp-$latest" "$local" && chmod +x "$local"
    echo "mdp updated: $("$local" --version)"
