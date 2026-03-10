# claude-session-analysis

Claude Code のセッションファイル（`.jsonl`）を分析し、過去の会話の振り返り、ファイル変更の追跡、意思決定プロセスの確認を行う Claude Code プラグイン。

## 特徴

- **タイムライン表示**: User/Think/Read/Write マーカーでセッションの流れを確認
- **ファイル操作追跡**: 読み込み・変更されたファイルを追跡
- **バージョン差分**: 編集間のファイルバージョンを比較
- **セッション検索**: フィルタリング・正規表現でセッションを特定

## インストール

```bash
claude plugin marketplace add kawaz/claude-session-analysis
claude plugin install claude-session-analysis@claude-session-analysis
```

## 使い方

インストール後、Claude にセッション分析を依頼できます:

- 「このセッションを分析して」
- 「この会話のタイムラインを見せて」
- 「このセッションで変更したファイルは？」
- 「そのファイルの v1 と v2 の差分を見せて」

## サブコマンド

| サブコマンド | 説明 |
|------------|------|
| `timeline <SESSION_ID ..>` | セッションイベントの表示（フィルタリング・フォーマットオプション付き） |
| `sessions [options]` | Claude セッションの一覧（フィルタリング・検索付き） |
| `file-ops <session_id>` | セッションのファイル操作を抽出 |
| `file-diff <session_id> <hash> <v1> [v2]` | バックアップファイルのバージョン比較 |
| `resolve-session [--path] <id_prefix>` | セッション ID プレフィックスからフル ID またはパスを解決 |

各サブコマンドの詳細は `claude-session-analysis <command> --help` で確認できます。

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

Claude Code はセッションを以下に保存:
```
~/.claude/projects/{project-path}/{session-id}.jsonl
```

ファイルバックアップは以下に保存:
```
~/.claude/file-history/{session-id}/{hash}@v{version}
```

## ライセンス

MIT License
