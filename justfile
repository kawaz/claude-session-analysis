# claude-session-analysis

test:
    bun test

build: mdp-copy
    bun run scripts/build.ts

validate:
    claude plugin validate .

# CI とローカルの検査範囲を完全一致させる単一エントリ
ci: test build check-bundle check-versions validate

version:
    @jq -r '.version' .claude-plugin/plugin.json

# バージョン bump (kawaz/* 横断: レシピ名はツール名 bump-semver に統一)
# package.json は private: true で version を持たないため対象外。
# plugin.json / marketplace.json の 2 ファイルを一括 bump。
bump-semver level="patch": ci
    bump-semver "{{level}}" .claude-plugin/plugin.json .claude-plugin/marketplace.json --write
    @echo "Version: -> $(bump-semver get .claude-plugin/plugin.json .claude-plugin/marketplace.json)"
    jj split -m "chore: bump version" .claude-plugin/plugin.json .claude-plugin/marketplace.json

# バンドルに未コミットの差分があればエラー (build 後に呼ぶ前提)
check-bundle:
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

push: ci check-version-bump
    jj bookmark set main -r @-
    jj git push
    claude plugin marketplace update claude-session-analysis
    claude plugin update claude-session-analysis@claude-session-analysis

push-without-bump: build check-bundle
    jj bookmark set main -r @-
    jj git push
    claude plugin marketplace update claude-session-analysis
    claude plugin update claude-session-analysis@claude-session-analysis

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
