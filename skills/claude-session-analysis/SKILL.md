---
name: claude-session-analysis
description: Analyze Claude Code session files. セッションを探し、timeline(tl)を見て、コンパクトやクリアにより失われた文脈を取り戻す
---

# Claude Session Analysis

This is `{SKILL_DIR}/SKILL.md`. CLI: `{SKILL_DIR}/bin/claude-session-analysis`

My session ID: `${CLAUDE_SESSION_ID}`

| Subcommand | Description |
|--------|-------------|
| `sessions [--since <2d>] [--limit <N>] [--path REGEXP] [--grep REGEXP]` | セッション検索（デフォルト全プロジェクト） |
| `timeline <id> [options]` | タイムライン表示（`--help` で全オプション確認可） |
| `resolve-session [--path] <id_prefix>` | セッションID補完・パス解決 |
| `file-ops <id>` | ファイル操作一覧 |
| `file-diff <id> <hash> <v1> [v2]` | バージョン間差分（v2 省略時は現在と比較） |

## Paths

- Sessions: `~/.claude/projects/{project-path}/{session-id}.jsonl`
- Backups: `~/.claude/file-history/{session-id}/{hash}@v{version}`

## Timeline の使い分け

| 目的 | コマンド例 |
|------|-----------|
| 全体像の把握 | `timeline SID` |
| 会話内容の確認 | `timeline SID --md -t RU` |
| コンパクト後の文脈復旧 | `timeline SID --md -t TRU --last-since 2h --last-turn 10` |
| 特定トピックの抽出 | `timeline SID --grep <pattern> -C 1 --md` |
