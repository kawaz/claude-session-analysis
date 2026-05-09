# docs-structure 標準への移行

## 背景

kawaz のグローバルルール `~/.claude/rules/docs-structure.md` で、リポジトリ間で揃える docs/ 構造が標準化された。CSA リポジトリは現状 `docs/plans/` を独自慣習で運用しており、新ルールへの移行を提案する。

## 新ルール（要旨）

- `docs/` 直下のドキュメントは大文字 + `.md`: `DESIGN.md` `STRUCTURE.md` `ROADMAP.md` `MANUAL.md`
- サブディレクトリは小文字: `decisions/` `findings/` `journal/` `research/` `knowledge/` `runbooks/` `issue/` `design/`
- サブディレクトリ内のファイル名は `YYYY-MM-DD-<slug>.md`（DR は例外で `DR-NNNN-title.md`）
- `decisions/INDEX.md` で DR 一覧を管理
- 詳細: `~/.claude/rules/docs-structure.md`

## 現状の `docs/plans/`

| ファイル | 性質 | 提案する移行先 |
| --- | --- | --- |
| `fix-session-search-path.md` | 単発の修正タスク（CLAUDE_CONFIG_DIR 対応） | `docs/issue/YYYY-MM-DD-fix-session-search-path.md` （日付は plan 起票日 or 移行日） |
| `timeline-ts-rewrite.md` | 大規模設計判断（sh→TS 全体書き直し）。既に大部分実装済 | a. 完了扱いで削除（履歴に残る） / b. 設計判断記録として `docs/decisions/DR-0001-timeline-ts-rewrite.md` に再フォーマット |

## マイグレーション手順案

1. `docs/plans/` を `docs/issue/` に rename（または個別ファイル単位で適切なカテゴリへ振り分け）
2. ファイル名に日付プレフィックスを付与
3. 完了済み plan は削除（jj 履歴で追える）
4. 既に決定済みの設計判断（例: TS 書き直し）は `docs/decisions/` に DR として整理
5. `docs/decisions/INDEX.md` を新設（idea-storage の `docs/decisions/INDEX.md` を参考実装として）
6. 既存 `*.md` 内部の相互リンクが壊れないか確認

## 関連

- グローバルルール: `~/.claude/rules/docs-structure.md`
- 参考実装: kawaz/idea-storage の `docs/decisions/INDEX.md` `docs/issue/` `docs/journal/`
- 同時起票: `docs/issue/2026-05-09-noise-classification.md`（idea-storage からの依頼）
