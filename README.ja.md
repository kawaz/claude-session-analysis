# Claude Session Analysis

Claude Code のセッションファイル（`.jsonl`）を分析し、過去の会話の振り返り、ファイル変更の追跡、意思決定プロセスの確認を行うスキルです。

## 特徴

- **タイムライン表示**: User/Think/Read/Write マーカーでセッションの流れを確認
- **ファイル操作**: 読み込み・変更されたファイルを追跡
- **バージョン差分**: 編集間のファイルバージョンを比較
- **セッション発見**: 現在のセッションを特定

## インストール

### プラグインマーケットプレイス経由（推奨）

```
/plugin marketplace add kawaz/claude-plugins
/plugin install claude-session-analysis@kawaz-claude-plugins
```

### スタンドアロンスキルとして

```bash
# 個人用（ユーザーレベル）
cd ~/.claude/skills
git clone https://github.com/kawaz/claude-session-analysis.git
cd claude-session-analysis
mv skills/claude-session-analysis/* .
rmdir skills/claude-session-analysis skills

# プロジェクトレベル
cd your-project/.claude/skills
# （上記と同じ手順）
```

## 使い方

インストール後、Claude にセッション分析を依頼できます：

- 「このセッションを分析して」
- 「この会話のタイムラインを見せて」
- 「このセッションで変更したファイルは？」
- 「そのファイルの v1 と v2 の差分を見せて」

## スクリプト一覧

| スクリプト | 説明 |
|-----------|------|
| `current-session.sh` | 現在のセッションID候補を取得 |
| `timeline.sh` | セッションのタイムライン表示（U/T/R/W） |
| `get-by-ref.sh` | タイムラインの参照から詳細を取得 |
| `file-ops.sh` | Read/Write 操作の一覧 |
| `file-diff.sh` | ファイルバージョン間の差分表示 |
| `sessions.sh` | ディレクトリのセッション一覧 |
| `summaries.sh` | セッションタイトルの変遷 |

## なぜ使うのか？

### /compact との比較

| 観点 | /compact | Session Analysis |
|------|----------|------------------|
| 思考プロセス | 消える | 保持される |
| ファイルバージョン | 消える | 追跡可能 |
| 意思決定履歴 | 要約される | 詳細に残る |
| 取得 | 一度きり | オンデマンド |

### メリット

- **軽量**: 15MB セッション → 4KB タイムライン
- **正確**: ファイルパスとバージョン番号が正確に保持
- **柔軟**: 概要を見てから必要な部分だけ深掘り
- **復元可能**: `~/.claude/file-history/` から過去のファイルにアクセス

## セッションファイルの構造

Claude Code はセッションを以下に保存：
```
~/.claude/projects/{project-path}/{session-id}.jsonl
```

ファイルバックアップは以下に保存：
```
~/.claude/file-history/{session-id}/{hash}@v{version}
```

## ライセンス

MIT
