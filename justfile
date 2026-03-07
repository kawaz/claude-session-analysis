# claude-session-analysis

# テスト実行
test:
    bun test

# バンドルビルド
build:
    bun run scripts/build.ts

# プラグインバリデーション
validate:
    claude plugin validate .

# テスト + ビルド + バリデーション
all: test build validate

# バージョン表示
version:
    @jq -r '.version' .claude-plugin/plugin.json
