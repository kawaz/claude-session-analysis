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
