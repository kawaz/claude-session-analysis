# claude-session-analysis

test:
    bun test

build: mdp-copy
    bun run scripts/build.ts

validate:
    claude plugin validate .

all: test build validate

version:
    @jq -r '.version' .claude-plugin/plugin.json

# バンドルをリビルドして差分があればエラー
check-bundle:
    @bun run scripts/build.ts >/dev/null 2>&1
    @test -z "$(jj diff --summary skills/claude-session-analysis/bin/claude-session-analysis 2>/dev/null)" \
        || { echo "ERROR: バンドルが最新ではありません。ビルド結果をコミットしてください。" >&2; exit 1; }

# plugin.json と marketplace.json のバージョン一致チェック
check-versions:
    @test "$(jq -r '.version' .claude-plugin/plugin.json)" = "$(jq -r '.metadata.version' .claude-plugin/marketplace.json)" \
        || { echo "ERROR: plugin.json と marketplace.json のバージョンが不一致です。" >&2; exit 1; }

# main@origin から変更があればバージョン bump 必須
check-version-bump:
    @remote_ver=$(jj file show .claude-plugin/plugin.json -r main@origin 2>/dev/null | jq -r '.version' 2>/dev/null || echo ""); \
        local_ver=$(jq -r '.version' .claude-plugin/plugin.json); \
        if [ -n "$(jj diff --from main@origin --to main --summary 2>/dev/null)" ] && [ "$local_ver" = "$remote_ver" ]; then \
            echo "ERROR: 変更がありますがバージョンが未更新です。bump不要なら: just push-without-bump" >&2; exit 1; \
        fi

push: check-bundle check-versions check-version-bump validate
    jj bookmark set main -r @-
    jj git push

push-without-bump: check-bundle
    jj bookmark set main -r @-
    jj git push

# mdp バンドルを GitHub リリースから取得（バージョン差分時のみ）
mdp-copy:
    #!/usr/bin/env bash
    local="./skills/claude-session-analysis/bin/mdp"
    latest="$(gh release view --repo kawaz/mdp --json tagName --jq '.tagName' | sed 's/^v//')"
    [ -f "$local" ] && current="$("$local" --version 2>/dev/null | awk '{print $2}')" || current=""
    [ "$current" = "$latest" ] && { echo "mdp is up to date: $current"; exit 0; }
    echo "mdp updating: ${current:-none} -> $latest"
    gh release download "v$latest" --repo kawaz/mdp --pattern "mdp-$latest" --dir /tmp --clobber
    cp "/tmp/mdp-$latest" "$local" && chmod +x "$local"
    echo "mdp updated: $("$local" --version)"
