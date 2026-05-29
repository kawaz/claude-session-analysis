# DR-0001: timeline の sh→TypeScript 全体書き直し

- ステータス: Accepted
- 日付: 2026-05-29

## 背景

セッション解析の中核機能 `timeline` は当初 `timeline.sh` + `timeline.jq` の
組み合わせで実装されていた。JSONL 解析・イベント分類・マーカー生成・dedup・
範囲フィルタ・カラー化・truncate といったロジックが jq に集約されており、
以下の課題があった。

- jq の表現力の限界（型・テストのしやすさ・デバッグ性）
- sh + jq の二段構成によるロジックの分散と保守コスト
- 単体テストが書きにくく、回帰検知が弱い

そこで `timeline` の全機能を TypeScript (bun) で再実装することを決定した。
将来の他スクリプト TS 化を見据え、共通モジュール `lib.ts` も同時に整備する。

## 決定内容

`timeline.sh` + `timeline.jq` の全機能を TypeScript (bun) で再実装する。
ビルド成果物は shebang 付き単一ファイル
`skills/claude-session-analysis/bin/claude-session-analysis` として配布する。

## 検討された選択肢

### 完全移植 vs 段階的マイグレーション

- ✓ **完全移植（採用）**: jq の全ロジック（JSONL 解析、タイプ分類、マーカー
  生成、dedup、no-backup 除去、範囲フィルタ、カラー化、truncate）を一括で
  TS に移植。E2E で旧 sh 出力と diff 比較して同等性を担保。
- ✗ 段階的マイグレーション: 機能単位で sh と TS を併存させながら移す案。
  二重実装期間が長引き、出力同等性の検証ポイントが分散する。一括移植して
  E2E で固定する方が回帰検知が明快なため不採用。

### 外部 npm パッケージ vs 標準ライブラリのみ

- ✓ **bun 組み込み + Node 標準のみ（採用）**: `Bun.file()`, `Bun.argv`,
  `Bun.Glob` 等の組み込み機能と標準ライブラリのみで実装。依存ゼロで
  配布バイナリが軽量・サプライチェーンリスクなし。
- ✗ 外部 npm パッケージ: 引数パーサやカラー出力ライブラリを使う案。
  この規模では組み込みで十分で、依存追加のメンテコストに見合わないため不採用。

### 単一ビルド vs モジュール分割

- ✓ **モジュール分割（採用）**: `src/timeline/` 配下を責務単位
  （`parse-args` / `extract` / `filter` / `format` / `types`）に分割し、
  各モジュールに単体テストを付与。加えて統合テストで全体パイプラインを検証。
- ✗ 単一ファイルビルド（ソースも一枚）: テスト容易性・可読性が劣る。
  配布は `Bun.build()` で単一ファイルにバンドルするため、ソースを分割しても
  配布形態は単一ファイルを維持できる。よってソースはモジュール分割を採用。

## 詳細実装

### ファイル構成

```
package.json               # scripts.build/test, devDependencies(@types/bun)
tsconfig.json
scripts/
  build.ts                 # Bun.build() でバンドル + shebang 付与
src/
  lib.ts / lib.test.ts             # 共通モジュール
  resolve-session.ts / .test.ts    # セッション ID 解決（CLAUDE_CONFIG_DIR 対応）
  timeline/
    index.ts               # CLI エントリポイント
    parse-args.ts          # CLI 引数パース
    extract.ts             # JSONL からイベント抽出
    filter.ts              # dedup / no-backup 除去 / 範囲・タイプフィルタ
    format.ts              # 出力整形（カラー化・truncate）
    types.ts               # 型定義
    *.test.ts              # 各モジュールの単体テスト + 統合テスト
skills/claude-session-analysis/bin/
  claude-session-analysis  # ← ビルド成果物（shebang 付き単一ファイル）
```

### ビルド

`scripts/build.ts` が `Bun.build()` でバンドルし、shebang を付与した単一ファイルを
`skills/claude-session-analysis/bin/claude-session-analysis` に出力する
（`chmod +x` で直接実行可能）。shebang は bun があれば `bun --bun`、無ければ
`node` にフォールバックする形。ビルド成果物はプラグインとして配布するため
git にコミットする。ソース変更時は `bun run build` 後にコミットする。

### 共通モジュール (src/lib.ts)

| 関数 | 用途 |
|------|------|
| `omit(obj, keys)` | 再帰的にキーを除去 |
| `redact(obj, keys)` | キー値を `[omitted:SIZE]` に置換 |
| `formatSize(bytes)` | バイト数 → 人間可読 (B/K/M) |
| `pick(obj, keys)` | トップレベルの指定キーのみ残す |
| `truncate(str, width)` | 幅制限付き文字列切り詰め |
| `shortenPath(path, n)` | パスを末尾 n 要素に短縮 |

### イベントタイプ

`U`(user) / `T`(thinking) / `R`(assistant text) / `F`(file ops) / `W`(web) /
`B`(bash) / `G`(grep・glob) / `A`(agent) / `S`(skill) / `Q`(question) /
`D`(todo) / `I`(info) の 12 種。Kind ごとに ANSI カラー + 絵文字を割り当てて
整形出力する。

### 処理パイプライン

```
JSONL 読み込み → イベント抽出 → dedup → no-backup 除去 → sort
→ 範囲フィルタ → タイプフィルタ → 出力整形
```

## 現在の実装状況

- `src/timeline/` にフル実装済み（`extract` / `filter` / `format` /
  `parse-args` / `types`）。
- 各モジュールの単体テスト + 全体パイプラインの統合テストを整備済み。
- `src/resolve-session.ts` は `CLAUDE_CONFIG_DIR` 環境変数に対応済み
  （旧 `fix-session-search-path` plan の内容も本実装に取り込み済み）。
- `scripts/build.ts` で shebang 付きバイナリ
  `skills/claude-session-analysis/bin/claude-session-analysis` を生成。
- 旧 `timeline.sh` / `timeline.jq` は削除済み（TS 版に完全移行）。

## 今後

- 他スクリプト（sessions, file-ops 等）の TS 化は `lib.ts` を共通基盤として
  順次検討する。
- 新たな設計判断は本 INDEX に DR を追加して管理する。
