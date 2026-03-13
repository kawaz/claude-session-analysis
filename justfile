# claude-session-analysis

# テスト実行
test:
    bun test

# バンドルビルド
build: mdp-copy
    bun run scripts/build.ts

# プラグインバリデーション
validate:
    claude plugin validate .

# テスト + ビルド + バリデーション
all: test build validate mdp-copy

# バージョン表示
version:
    @jq -r '.version' .claude-plugin/plugin.json

# push（バージョンチェック付き）
push:
    #!/usr/bin/env bash
    set -euo pipefail
    # バンドルビルドチェック
    bundle="skills/claude-session-analysis/bin/claude-session-analysis"
    if [ -f "$bundle" ]; then
        current_hash=$(md5 -q "$bundle" 2>/dev/null || md5sum "$bundle" | cut -d' ' -f1)
        bun run scripts/build.ts >/dev/null 2>&1
        new_hash=$(md5 -q "$bundle" 2>/dev/null || md5sum "$bundle" | cut -d' ' -f1)
        if [ "$current_hash" != "$new_hash" ]; then
            echo "ERROR: バンドルが最新ではありません。ビルド結果をコミットしてください。" >&2
            exit 1
        fi
    fi
    # plugin.json と marketplace.json のバージョン一致チェック
    plugin_ver=$(jq -r '.version' .claude-plugin/plugin.json)
    market_ver=$(jq -r '.metadata.version' .claude-plugin/marketplace.json)
    if [ "$plugin_ver" != "$market_ver" ]; then
        echo "ERROR: plugin.json ($plugin_ver) と marketplace.json ($market_ver) のバージョンが不一致です。" >&2
        exit 1
    fi
    # main@origin との diff にプラグイン関連の変更があるかチェック
    diff_files=$(jj diff --from main@origin --to main --summary 2>/dev/null | awk '{print $2}' || true)
    if [ -n "$diff_files" ]; then
        has_version_files=$(echo "$diff_files" | grep -cE '^\.claude-plugin/(plugin|marketplace)\.json$' || true)
        if [ "$has_version_files" -eq 0 ]; then
            echo "ERROR: origin/HEAD との差分がありますがバージョンが更新されていません。" >&2
            echo "バージョンbump不要なら: just push-without-bump" >&2
            exit 1
        fi
        # バージョンが実際に変わっているか確認
        remote_ver=$(jj file show .claude-plugin/plugin.json -r main@origin 2>/dev/null | jq -r '.version' 2>/dev/null || true)
        if [ -n "$remote_ver" ] && [ "$remote_ver" = "$plugin_ver" ]; then
            echo "ERROR: plugin.json/marketplace.json は diff に含まれていますがバージョンが同じ ($plugin_ver) です。" >&2
            echo "バージョンbump不要なら: just push-without-bump" >&2
            exit 1
        fi
    fi
    # バリデーション
    claude plugin validate .
    jj git push

# push（バージョンbumpなし）
push-without-bump:
    #!/usr/bin/env bash
    set -euo pipefail
    # バンドルビルドチェック
    bundle="skills/claude-session-analysis/bin/claude-session-analysis"
    if [ -f "$bundle" ]; then
        current_hash=$(md5 -q "$bundle" 2>/dev/null || md5sum "$bundle" | cut -d' ' -f1)
        bun run scripts/build.ts >/dev/null 2>&1
        new_hash=$(md5 -q "$bundle" 2>/dev/null || md5sum "$bundle" | cut -d' ' -f1)
        if [ "$current_hash" != "$new_hash" ]; then
            echo "ERROR: バンドルが最新ではありません。ビルド結果をコミットしてください。" >&2
            exit 1
        fi
    fi
    jj git push

# mdp のバンドル版を GitHub リリースから取り込む（バージョンが異なる場合のみ）
mdp-copy:
    #!/usr/bin/env bash
    LOCAL="./skills/claude-session-analysis/bin/mdp"
    LATEST="$(gh release view --repo kawaz/mdp --json tagName --jq '.tagName' | sed 's/^v//')"
    if [ -f "$LOCAL" ]; then
        CURRENT="$("$LOCAL" --version 2>/dev/null | awk '{print $2}')" || true
        if [ "$CURRENT" = "$LATEST" ]; then
            echo "mdp is up to date: $CURRENT"
            exit 0
        fi
    fi
    echo "mdp updating: ${CURRENT:-none} -> $LATEST"
    gh release download "v$LATEST" --repo kawaz/mdp --pattern "mdp-$LATEST" --dir /tmp --clobber
    cp "/tmp/mdp-$LATEST" "$LOCAL"
    chmod +x "$LOCAL"
    echo "mdp updated: $("$LOCAL" --version)"
