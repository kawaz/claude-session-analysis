# テスト手順

## スキルテスト（プラグイン統合テスト）

ローカルの変更をテストするには、グローバル設定を無効にして実行します。

### テストコマンド

```bash
cd /tmp && claude --setting-sources "local" \
  --plugin-dir /path/to/claude-session-analysis \
  --allowedTools "Skill Bash Read Glob Grep" \
  -p "プロンプト"
```

### テストケースと期待結果

| プロンプト | 期待: スキル使用 | 期待: 使用サブコマンド |
|-----------|-----------------|---------------------|
| `セッションIDを教えて` | 2行目にS | `claude-session-analysis sessions` |
| `今のセッションは？` | 2行目にS | `claude-session-analysis sessions` |
| `tlみせて` | 2行目にS | `claude-session-analysis timeline` |
| `前のセッションの内容確認したい` | 2行目にS | `claude-session-analysis sessions` → `claude-session-analysis timeline` |
| `tl見せてって会話をしたセッションを探して、IDだけ教えて` | 2行目にS | `claude-session-analysis sessions` (--grep オプション) |
| `一時ファイルを数回読み書きしてからtlを確認、ファイルの修正履歴を確認して` | ファイル操作後にS | `claude-session-analysis sessions` → `claude-session-analysis timeline` |

### 結果確認

```bash
# 最新セッション確認
claude-session-analysis sessions --limit 5

# タイムライン確認（Sマーカーが2行目にあるか）
claude-session-analysis timeline <session-id>
```

### OK条件

1. **Sマーカー位置**: ユーザー入力(U)の直後（2行目）にS（Skill）マーカーがある
2. **使用サブコマンド**: 適切なサブコマンドが選択されている
   - セッションID確認 → `claude-session-analysis sessions`
   - タイムライン → `claude-session-analysis timeline`
3. **オプション**: 旧オプション（例: `-g`, `-mmin`, `-n`）が使われていない

## サブコマンド単体テスト

### sessions

```bash
# デフォルト（1日以内、最新10件）
claude-session-analysis sessions
# 期待: 最大10件のセッション一覧

# キーワード検索
claude-session-analysis sessions --grep "keyword"
# 期待: キーワードを含むセッション

# 時間指定
claude-session-analysis sessions --since 1h
# 期待: 直近1時間のセッション
```

### resolve-session

```bash
# セッションIDプレフィックスからフルID解決
claude-session-analysis resolve-session <session-id-prefix>
# 期待: フルセッションIDを出力

# ファイルパス出力
claude-session-analysis resolve-session --path <session-id-prefix>
# 期待: セッションファイルのフルパスを出力

# 未知オプション
claude-session-analysis resolve-session --unknown 2>&1
# 期待: エラーメッセージとusage表示
```

### timeline

```bash
# 基本
claude-session-analysis timeline <session-id>
# 期待: タイムライン出力

# Bashのフルパスが省略されているか
claude-session-analysis timeline -t B <session-id>
# 期待: `…/dir/prog` 形式（`/full/path/...` ではない）

# 幅指定
claude-session-analysis timeline -w 100 <session-id>
# 期待: 100文字幅で出力
```
