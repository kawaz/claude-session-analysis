# DR: timeline.sh/jq を TypeScript (bun) で書き直す

## 概要

`timeline.sh` + `timeline.jq` の全機能を TypeScript (bun) で再実装する。既存のshは残し、並行運用可能にする。将来の他スクリプトTS化を見据え、共通モジュール `lib.ts` も同時に作成する。

## 方針

- **src/ + bun build**: ソースは `src/` に配置し、`scripts/build.ts` で `Bun.build()` → shebang付き単一ファイルを `skills/claude-session-analysis/scripts/` に出力（antenna-cli方式）
- **完全移植**: timeline.jq の全ロジック（JSONL解析、タイプ分類、マーカー生成、dedup、no-backup除去、範囲フィルタ、カラー化、truncate）を再現
- **TDD**: `bun test` でテストファーストで進める
- **bun固有機能**: `Bun.file()`, `Bun.argv`, `Bun.stdout`, `Bun.Glob` 等を活用
- **外部依存なし**: npm パッケージは使わない（bun組み込み + 標準ライブラリのみ）

## ファイル構成

```
package.json               # scripts.build, devDependencies(@types/bun)
tsconfig.json              # bun標準設定
scripts/
  build.ts                 # Bun.build() でバンドル + shebang付与
src/
  lib.ts                   # 共通モジュール
  lib.test.ts
  resolve-session.ts       # セッションID解決
  resolve-session.test.ts
  timeline/
    index.ts               # メインエントリーポイント（CLI）
    parse-args.ts           # CLI引数パース
    extract.ts              # JSONLからイベント抽出
    filter.ts               # dedup, no-backup除去, 範囲フィルタ, タイプフィルタ
    format.ts               # 出力整形（カラー化、truncate）
    types.ts                # 型定義
    *.test.ts               # 各モジュールのテスト
skills/claude-session-analysis/scripts/
  timeline                 # ← ビルド成果物（shebang付き単一ファイル）
```

## ビルド

### package.json

```json
{
  "type": "module",
  "private": true,
  "scripts": {
    "build": "bun run scripts/build.ts",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

### scripts/build.ts

```ts
import { $ } from "bun";
const SHEBANG = "#!/usr/bin/env bun\n";
const OUTFILE = "skills/claude-session-analysis/scripts/timeline";
const result = await Bun.build({
  entrypoints: ["src/timeline/index.ts"],
  outdir: ".",
  naming: OUTFILE,
  target: "bun",
});
const content = await Bun.file(OUTFILE).arrayBuffer();
await Bun.write(OUTFILE, new Blob([SHEBANG, content]));
await $`chmod +x ${OUTFILE}`;
```

## モジュール設計

### src/lib.ts

| 関数 | 元 | 用途 |
|------|-----|------|
| `omit(obj, keys)` | lib.jq | 再帰的にキーを除去 |
| `redact(obj, keys)` | lib.jq | キー値を `[omitted:SIZE]` に置換 |
| `formatSize(bytes)` | lib.jq | バイト数 → 人間可読 (B/K/M) |
| `pick(obj, keys)` | lib.jq | トップレベルの指定キーのみ残す |
| `truncate(str, width)` | timeline.jq | 幅制限付き文字列切り詰め |
| `shortenPath(path, n)` | timeline.jq | パスを末尾n要素に短縮 |

### src/resolve-session.ts

`resolve-session.sh` と同等のロジック:
- セッションID（短縮形対応）→ `.jsonl` ファイルパスに解決
- `CLAUDE_CONFIG_DIR` 環境変数対応
- `Bun.Glob` でファイル検索

### src/timeline/

#### CLI引数 (parse-args.ts)

```
timeline [options] <session_id_or_file> [range]

Options:
  -t <types>                表示タイプ (default: "UTRFWBGASQDI")
  -w <width>                descのトランケート幅 (default: 55)
  --timestamps              タイムスタンプ表示
  --colors[=auto|always|never]  カラー出力 (default: auto)
  --no-colors               カラー無効
  --raw                     マーカーのみ出力 (omit+redact用)
  --raw2                    マーカーのみ出力 (redactのみ)
  --help                    ヘルプ
```

#### 処理パイプライン (index.ts)

```
JSONL読み込み → イベント抽出 → dedup → no-backup除去 → sort → 範囲フィルタ → タイプフィルタ → 出力整形
```

1. **JSONL読み込み**: `Bun.file(path).text()` → 行分割 → `JSON.parse`
2. **イベント抽出** (extract.ts): 各JSONLエントリからイベント配列を生成
3. **フィルタ** (filter.ts): dedup → no-backup除去 → sort → 範囲フィルタ → タイプフィルタ
4. **出力整形** (format.ts): カラー化（ANSI + 絵文字）/ タイムスタンプ / RAWモード

#### 型定義 (types.ts)

```ts
type EventKind = "U" | "T" | "R" | "F" | "W" | "B" | "G" | "A" | "S" | "Q" | "D" | "I";

interface TimelineEvent {
  kind: EventKind;
  ref: string;     // 8桁hex (uuid先頭8文字)
  time: string;    // ISO8601 (ソートサフィックス _00001 付きの場合あり)
  desc: string;
  notrunc?: boolean;
}
```

#### イベントタイプ一覧 (extract.ts)

| Kind | ソース | 抽出条件 |
|------|--------|----------|
| U | user message | `type=="user"`, 非meta, 非compact, 非interrupt/task-notification/teammate |
| T | assistant thinking | `content[].type=="thinking"` |
| R | assistant text | `content[].type=="text"`, 空白のみ除外 |
| F | file ops | file-history-snapshot / Read tool_use / Write,Edit tool_use (no-backup) |
| W | web | WebFetch/WebSearch tool_use |
| B | bash | Bash/BashOutput tool_use |
| G | grep/glob | Grep/Glob tool_use |
| A | agent | Task/TaskOutput tool_use |
| S | skill | Skill tool_use |
| Q | question | AskUserQuestion tool_use |
| D | todo | TodoWrite tool_use |
| I | info | auto-compact, task-notification, teammate-message, Request interrupted |

#### カラー化 (format.ts)

| Kind | ANSI | 絵文字 | 備考 |
|------|------|--------|------|
| U | 緑 `\x1b[32m` | 👤 | 前に空行2つ |
| T | italic青 `\x1b[3;34m` | 🧠 | |
| R | 青 `\x1b[34m` | 🤖 | |
| Q | 青 `\x1b[34m` | 🤖 | Rと同じ |
| B | dim `\x1b[2m` | ▶️ | |
| F | dim `\x1b[2m` | 👀(read)/📝(write) | `no-backup-`含む or `@v`マッチ → 📝 |
| W | dim `\x1b[2m` | 🛜 | |
| S | dim `\x1b[2m` | ⚡️ | |
| G | dim `\x1b[2m` | 🔍 | |
| A | dim `\x1b[2m` | 👻 | |
| D | dim `\x1b[2m` | ✅ | |
| I | dim `\x1b[2m` | ℹ️ | |

## テスト戦略

### テストデータ

テスト用の最小限JSONLスニペットをテストファイル内にインラインで定義。

### テストケース（主要）

#### lib.test.ts
- `truncate`: 通常/幅以内/幅0/マルチバイト
- `omit`: 浅い/深い/ネスト
- `redact`: サイズ表示の正確性
- `formatSize`: B/K/M境界
- `shortenPath`: 通常/1要素/2要素

#### resolve-session.test.ts
- 完全ID → パス解決
- 短縮ID → 前方一致
- 存在しないID → エラー
- `CLAUDE_CONFIG_DIR` 優先順位

#### timeline/*.test.ts
- extract: 各タイプのイベント抽出
- filter: dedup / no-backup除去 / 範囲フィルタ / タイプフィルタ
- format: カラー化 / 絵文字 / ANSIコード / timestamps / raw
- parse-args: CLI引数パース

## 既存shとの共存

- `timeline.sh` / `timeline.jq` はそのまま残す
- `bin/claude-session-analysis.sh` のディスパッチャーは変更しない（将来的にビルド成果物の `timeline` を優先する切り替えも可能だが今回はスコープ外）
- ビルド成果物 `scripts/timeline` は `chmod +x` で直接実行可能

## 非スコープ

- `bin/claude-session-analysis.sh` のTS化
- 他のスクリプト（sessions.sh, file-ops.sh等）のTS化
- `--raw` モードの `get-by-marker.sh` 連携（マーカー出力までは実装、外部スクリプト呼び出しは今回スコープ外）
- npm パッケージの追加
- plugin.json のバージョン更新（機能追加ではなく内部実装の追加のため）
