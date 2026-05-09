# ノイズ分類関数の追加と sessions/timeline 出力の拡張

## 背景

idea-storage の [DR-0008](https://github.com/kawaz/idea-storage/blob/main/docs/decisions/DR-0008-recipe-pipeline-quality-improvement.md) で「ユーザーターンのノイズ判定基盤」を導入する設計が確定した。idea-storage は CSA `sessions --format jsonl <id>` の出力を消費する側で、JSONL 直読を CSA 経由に全面置換する予定。

CSA 単独でもノイズ可視化の価値があるため（timeline 表示で `[noise]` マークが付く・`sessions` 出力に effective なターン数列が増える、等）、idea-storage 固有ではない汎用機能として CSA に組み込みたい。

CSA は既に `src/lib.ts:109` の `isUserTurn()` で `isMeta` / `isCompactSummary` / `[Request interrupted` / `<task-notification>` / `<teammate-message` を U イベントから除外している。今回追加する分類はこの既存責務の自然な延長になる。

## 依頼内容

### 1. ユーザーターンの分類関数

`isUserTurn()` を通過したユーザーターン (kind="U") について、本文を以下に分類する関数を追加する:

| カテゴリ      | 判定                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `HIDDEN_TAG`  | 内容が `<system-reminder>` / `<user-prompt-submit-hook>` / `<local-command-stdout>` 等のシステム注入タグのみで本文がほぼ無い |
| `SLASH_ONLY`  | スラッシュコマンドのみ（CSA は既に `<command-name>` から `cmd args` を抽出して desc 化済み）                                 |
| `SHORT_ASCII` | 全文が ASCII で空白区切りで 2 word 以下                                                                                      |
| `EFFECTIVE`   | 上記いずれにも該当しない（日本語含む or 3 word 以上）                                                                        |

判定優先度: `HIDDEN_TAG > SLASH_ONLY > SHORT_ASCII > EFFECTIVE`。

提案する関数名: `classifyUserTurnKind(text: string): "effective" | "short_ascii" | "slash_only" | "hidden_tag"`（lib.ts に export）。命名は CSA の慣習に合わせて調整可。

#### 判定の細部（実装着手前に詰めたい論点）

- **word 区切り**: 空白のみ？ 句読点も区切り扱い？
- **HIDDEN_TAG の境界**: タグ + 短い本文（例: `<system-reminder>X</system-reminder> ok`）はどう扱う？ タグ除去後の残文字数で判定？
- **SHORT_ASCII の閾値**: 「2 word 以下」を厳密に何と定義する？ ASCII の判定範囲（`[\x00-\x7F]` で良いか、絵文字や記号扱いは？）
- **isUserTurn() との整合**: 既存の除外ルールと重複しないことの確認

### 2. `sessions --format jsonl` の出力フィールド拡張

現状の出力フィールド: `sessionId, file, cwd, startTime, endTime, duration_ms, bytes, lines, turns, context`。

以下を追加（フラットな列で）:

| フィールド           | 型             | 意味                                     |
| -------------------- | -------------- | ---------------------------------------- |
| `effectiveUserTurns` | number         | EFFECTIVE 分類に該当するユーザーターン数 |
| `forkedFrom`         | string \| null | フォーク元 session ID                    |
| `forkFirstNewUuid`   | string \| null | フォーク後の最初の新規 entry UUID        |

参考: idea-storage 側で `forkedFrom` / `forkFirstNewUuid` がどう使われているかは [`session-process.ts` の `trimTimelineForFork` 周辺](https://github.com/kawaz/idea-storage/blob/main/src/commands/session-process.ts) を参照。

**hasEnd は不要**。idea-storage 側で実用利用は `session-list.ts` の "ended/active" 表示の 1 箇所のみで、`ageSec >= minAgeSec` で代替できることを確認済み。

#### 後方互換性

- 既存フィールドは維持、追加のみ
- jsonl の各行に新規プロパティが増える形 → 既存利用者の parser が壊れない（無視されるだけ）

オプション案: 細かく粒度を出したい場合、`turn_classification: { effective, hidden_tag, slash_only, short_ascii }` を入れ子オブジェクトで持たせる手もある。ただし「フラットな列」を優先する想定（jsonl の素朴な慣習に合わせる）。

### 3. timeline コマンドの `--effective-only` フラグ追加

idea-storage の process 時にレシピへ渡すタイムラインから、ノイズターンを除去する用途。

提案フラグ:

- `--effective-only`: U イベントのうち分類が EFFECTIVE 以外のものを timeline 出力から除外する
  - HIDDEN_TAG / SLASH_ONLY / SHORT_ASCII を除外
  - 関連する assistant 応答（R / T 等）の扱いは別途検討（除外したユーザーターンに紐づく応答を残すか落とすか）

オプション名や挙動は提案歓迎。idea-storage 側の用途は「レシピプロンプトに渡す timeline 純化」のみ。

### 4. timeline 出力での分類タグ表示（オプション）

デバッグ用途として、CSA timeline の U イベントに分類サブタグを表示するオプションがあると便利:

```
Uf8f0870d 1 [HIDDEN_TAG] <system-reminder>...
U84559ad2 2 [EFFECTIVE]  ./diary/2026/04/02/...
```

挙動はフラグで明示的に切り替え（既存出力フォーマットは維持）。優先度は低い。

## 後方互換性の確認事項

- `sessions --format jsonl` の既存フィールドは維持
- `isUserTurn()` の既存除外ルールは維持（追加分類は通過後の話）
- `timeline` 出力のデフォルト挙動は変えない（新フラグで opt-in）

## PR 単位の切り分け案

| PR       | 内容                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| ①        | `classifyUserTurnKind()` を lib.ts に追加 + 単体テスト                                               |
| ②        | `sessions --format jsonl` に `effectiveUserTurns` / `forkedFrom` / `forkFirstNewUuid` フィールド追加 |
| ③        | `timeline --effective-only` フラグ追加                                                               |
| ④ (任意) | timeline での分類サブタグ表示                                                                        |

PR ① で `classifyUserTurnKind()` の仕様を詰める。判定の細部（word 区切り / HIDDEN_TAG 境界 / SHORT_ASCII 閾値）は実装着手前に決定し、決定内容を関数本体のコメントに記載する。

## 関連

- idea-storage [DR-0008](https://github.com/kawaz/idea-storage/blob/main/docs/decisions/DR-0008-recipe-pipeline-quality-improvement.md) — 本要望の親 DR
- idea-storage [DR-0007](https://github.com/kawaz/idea-storage/blob/main/docs/decisions/DR-0007-session-convert-and-queue-state-model.md) — queue state モデル（前提）
- CSA `src/lib.ts:109` の `isUserTurn()` — 既存の除外ルール
- CSA `src/timeline/extract.ts` の `extractUserStringContent()` — 既存のスラッシュコマンド desc 化
