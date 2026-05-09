# justfile を bump-semver multi-file 化 + `just ci` 1 行 CI + dependabot 有効化 (kawaz/* 横断)

## 背景

2026-05-09 に kawaz/claude-cmux-msg で justfile + workflow + dependabot まわりの整理を完了 (v0.25.2)。同じパターンを kawaz/claude-* のプラグイン系リポに横展開する依頼。

## やること

### 1. justfile の `bump-semver` レシピ統一

`kawaz/bump-semver` v0.4.0 の path-aware confidence ランキングで `.claude-plugin/marketplace.json` (`metadata.version` 構造) も認識可能になっている。3 ファイル一括 bump が 1 行で書ける:

```just
# レシピ名は呼び出すツール名と揃えて bump-semver に統一 (kawaz/* 横断ルール)
bump-semver level="patch": ensure-clean check-bundle test
    bump-semver "{{level}}" .claude-plugin/plugin.json .claude-plugin/marketplace.json package.json --write
    @echo "Version: -> $(bump-semver get .claude-plugin/plugin.json .claude-plugin/marketplace.json package.json)"
    jj split -m "chore: bump version" .claude-plugin/plugin.json .claude-plugin/marketplace.json package.json
```

ファイル構成がリポによって異なる場合 (例: package.json なし、marketplace.json なし) はそのリポの実情に合わせる。レシピ名を `version-bump` から `bump-semver` に改名 (kawaz/* 全体で統一)、外部 `kawaz/go/bin/bump` ツール依存も削除。

### 2. `ci` レシピ統一

CI とローカルの検査範囲を完全一致させる単一エントリ:

```just
ci: test build check-bundle check-translations validate
```

`all` レシピがある場合は `ci` に統合する (やり方が複数あることは迷いとコンテキストの無駄を生む方針)。

### 3. `.github/workflows/ci.yml` 新設

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: extractions/setup-just@v3
      - name: Install Claude Code via bun (for `claude plugin validate`)
        run: |
          bun add -g @anthropic-ai/claude-code
          echo "$(bun pm bin -g)" >> "$GITHUB_PATH"
      - run: just ci
```

`bun add -g` を採用した理由: `npm install -g` より速く (claude-cmux-msg での実測でも ~1 秒)、setup-bun 1 つに依存統一できる (setup-node 不要)。`anthropics/claude-code-action` は PR コメント自動応答用で単発 CLI 実行には過剰のため不採用。

既存 ci.yml がある場合は同等の構造に揃える (kawaz/claude-statusline の B 系統)。

### 4. `.github/dependabot.yml` 新設

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Asia/Tokyo"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "github-actions"
    commit-message:
      prefix: "ci"
      include: "scope"

  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Asia/Tokyo"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "npm"
    commit-message:
      prefix: "deps"
      include: "scope"
```

`npm` セクションは `package.json` がある場合のみ (なければ `github-actions` だけで OK)。

## 参考実装

- kawaz/claude-cmux-msg @ 0.25.2 (commit `4da13855`)
- 経緯: kawaz/claude-cmux-msg `docs/journal/2026-05-09-bump-semver-migration.md`
- ci.yml の bun 化議論: 同 `docs/journal/2026-05-09-self-improvement-batch.md` 末尾「学び」節
- 上流 bump-semver の path-aware 設計: kawaz/bump-semver `docs/issue/2026-05-09-path-aware-confidence-ranked-candidates.md`

## 補足

- bump-semver の path-aware ハンドリングが効くため、marketplace.json の `metadata.version` も特別扱いなしに 1 行で書ける
- bump-semver multi-file の cross-file 整合性チェックで「3 ファイルの version がずれていればエラー」になる安全構造
- dependabot を有効化すると初回 push 直後に GitHub Actions の major bump PR が起票される (cmux-msg では `actions/checkout v4→v6` `extractions/setup-just v3→v4` がすぐ来た)。手動レビュー / auto-merge ポリシーは適宜判断

報告者: kawaz/claude-cmux-msg `cmux-msg-impl` ワーカー (kawaz の指示で 2026-05-09 に横展開を実施)
