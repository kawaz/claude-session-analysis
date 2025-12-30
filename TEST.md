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

| プロンプト | 期待: スキル使用 | 期待: 使用スクリプト |
|-----------|-----------------|---------------------|
| `セッションIDを教えて` | 2行目にS | `current-session.sh` |
| `今のセッションは？` | 2行目にS | `current-session.sh` |
| `tlみせて` | 2行目にS | `timeline.sh` |
| `前のセッションの内容確認したい` | 2行目にS | `sessions.sh` → `timeline.sh` |
| `tl見せてって会話をしたセッションを探して、IDだけ教えて` | 2行目にS | `sessions.sh` (-g オプション) |
| `一時ファイルを数回読み書きしてからtlを確認、ファイルの修正履歴を確認して` | ファイル操作後にS | `current-session.sh` → `timeline.sh` |

### 結果確認

```bash
# 最新セッション確認
./skills/claude-session-analysis/scripts/sessions.sh -n 5

# タイムライン確認（Sマーカーが2行目にあるか）
./skills/claude-session-analysis/scripts/timeline.sh <session-id>
```

### OK条件

1. **Sマーカー位置**: ユーザー入力(U)の直後（2行目）にS（Skill）マーカーがある
2. **使用スクリプト**: 適切なスクリプトが選択されている
   - セッションID確認 → `current-session.sh`（`sessions.sh` ではない）
   - タイムライン → `timeline.sh`
3. **オプション**: 削除したオプション（例: `--full`）が使われていない

## スクリプト単体テスト

### current-session.sh

```bash
# 基本動作
./scripts/current-session.sh
# 期待: JSON出力（sessionId がフルUUID）

# 引数指定
./scripts/current-session.sh /tmp 60
# 期待: /tmp プロジェクトの直近60秒のセッション
```

### sessions.sh

```bash
# デフォルト（1日以内、最新10件）
./scripts/sessions.sh
# 期待: 最大10件のセッション一覧

# キーワード検索
./scripts/sessions.sh -g "keyword"
# 期待: キーワードを含むセッション

# 時間指定
./scripts/sessions.sh -mmin 60
# 期待: 直近60分のセッション
```

### timeline.sh

```bash
# 基本
./scripts/timeline.sh <session-id>
# 期待: タイムライン出力

# Bashのフルパスが省略されているか
./scripts/timeline.sh -t B <session-id>
# 期待: `…/dir/prog` 形式（`/full/path/...` ではない）

# 幅指定
./scripts/timeline.sh -w 100 <session-id>
# 期待: 100文字幅で出力
```

### resolve-session.sh

```bash
./scripts/resolve-session.sh <short-id>
# 期待: フルパスを返す
```
