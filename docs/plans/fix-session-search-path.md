# Fix: セッション検索パスの CLAUDE_CONFIG_DIR 対応

## 問題

スクリプト群が `$HOME/.claude` をハードコードしているため、`CLAUDE_CONFIG_DIR` 環境変数で設定ディレクトリを変更しているユーザーのセッションファイルを検出できない。

Claude Code は `CLAUDE_CONFIG_DIR` 環境変数による設定ディレクトリの変更をサポートしているが、本プラグインのスクリプトはこれを考慮していない。

## 影響範囲

### 直接ハードコードしているスクリプト（4ファイル）

| スクリプト | 行 | ハードコードされたパス | 用途 |
|----------|-----|----------------------|------|
| `resolve-session.sh` | 12 | `$HOME/.claude/projects` | セッションID からファイルパスを解決 |
| `sessions.sh` | 19 | `~/.claude/projects` | セッション一覧の取得 |
| `current-session.sh` | 20 | `~/.claude/history.jsonl` | 現在セッションの候補取得 |
| `file-diff.sh` | 22 | `~/.claude/file-history` | バックアップファイルの検索 |

### resolve-session.sh に間接依存しているスクリプト（5ファイル）

以下のスクリプトはセッションIDを受け取る際に `resolve-session.sh` を呼び出してファイルパスに変換する。resolve-session.sh が修正されれば自動的に対応される。

| スクリプト | 依存箇所 |
|----------|---------|
| `timeline.sh` | 33行目: `$SCRIPT_DIR/resolve-session.sh` |
| `summaries.sh` | 16行目: `$SCRIPT_DIR/resolve-session.sh` |
| `get-by-marker.sh` | 33行目: `$SCRIPT_DIR/resolve-session.sh` |
| `file-diff.sh` | 51行目: `$SCRIPT_DIR/resolve-session.sh`（直接ハードコードに加えて間接依存もある） |
| `file-ops.sh` | 16行目: `$SCRIPT_DIR/resolve-session.sh` |

## 修正方針

各スクリプトの先頭付近で `CLAUDE_CONFIG_DIR` 環境変数を参照し、未設定の場合は `$HOME/.claude` をデフォルトとする。

```bash
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
```

## 修正対象ファイルと具体的な変更内容

### 1. resolve-session.sh（最優先）

他5スクリプトが依存しているため最初に修正する。

**現在（12行目）:**
```bash
SESSION_FILE=$(ls "$HOME/.claude/projects"/*/${SESSION_ID}*.jsonl 2>/dev/null | head -1)
```

**修正後:**
```bash
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SESSION_FILE=$(ls "$CLAUDE_CONFIG_DIR/projects"/*/${SESSION_ID}*.jsonl 2>/dev/null | head -1)
```

変更箇所: 5行目（`SESSION_ID=` の後）に `CLAUDE_CONFIG_DIR` の定義を追加し、12行目のパスを置換。

### 2. sessions.sh

**現在（19行目）:**
```bash
grep -rm1 '"cwd"' ~/.claude/projects 2>/dev/null | grep -vE '/agent-[^/]+\.jsonl:{' | \
```

**修正後:**
```bash
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
grep -rm1 '"cwd"' "$CLAUDE_CONFIG_DIR/projects" 2>/dev/null | grep -vE '/agent-[^/]+\.jsonl:{' | \
```

変更箇所: 18行目付近に `CLAUDE_CONFIG_DIR` の定義を追加し、19行目のパスを置換。

### 3. current-session.sh

**現在（20行目）:**
```bash
' ~/.claude/history.jsonl
```

**修正後:**
```bash
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
```
を `PROJECT_PATH` 定義の後に追加し、20行目を:
```bash
' "$CLAUDE_CONFIG_DIR/history.jsonl"
```

変更箇所: 14行目付近に `CLAUDE_CONFIG_DIR` の定義を追加し、20行目のパスを置換。

### 4. file-diff.sh

**現在（22行目）:**
```bash
SESSION_DIR=$(find ~/.claude/file-history -maxdepth 1 -type d -name "${SESSION_ID}*" | head -1)
```

**修正後:**
```bash
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SESSION_DIR=$(find "$CLAUDE_CONFIG_DIR/file-history" -maxdepth 1 -type d -name "${SESSION_ID}*" | head -1)
```

変更箇所: 20行目付近（`SCRIPT_DIR` 定義の後）に `CLAUDE_CONFIG_DIR` の定義を追加し、22行目のパスを置換。

## テスト方法

### 1. デフォルト動作の確認（後方互換性）

`CLAUDE_CONFIG_DIR` 未設定時に従来通り `$HOME/.claude` を使用することを確認する。

```bash
# CLAUDE_CONFIG_DIR を明示的にunset
unset CLAUDE_CONFIG_DIR

# 各スクリプトが正常に動作すること
./scripts/sessions.sh -n 3
./scripts/current-session.sh
./scripts/resolve-session.sh <既知のセッションID>
./scripts/file-diff.sh <セッションID> <ハッシュ> 1
```

### 2. カスタムパスの確認

```bash
# テスト用ディレクトリを作成して既存データをコピー
mkdir -p /tmp/test-claude-config/projects
mkdir -p /tmp/test-claude-config/file-history
cp -r ~/.claude/projects/* /tmp/test-claude-config/projects/
cp -r ~/.claude/file-history/* /tmp/test-claude-config/file-history/ 2>/dev/null || true
cp ~/.claude/history.jsonl /tmp/test-claude-config/history.jsonl 2>/dev/null || true

# カスタムパスで実行
export CLAUDE_CONFIG_DIR=/tmp/test-claude-config

./scripts/sessions.sh -n 3
./scripts/current-session.sh
./scripts/resolve-session.sh <既知のセッションID>
./scripts/file-diff.sh <セッションID> <ハッシュ> 1

# 後片付け
unset CLAUDE_CONFIG_DIR
rm -rf /tmp/test-claude-config
```

### 3. 間接依存スクリプトの確認

resolve-session.sh 経由で動作する5スクリプトについても、`CLAUDE_CONFIG_DIR` 設定下でセッションIDを正しく解決できることを確認する。

```bash
export CLAUDE_CONFIG_DIR=/tmp/test-claude-config

./scripts/timeline.sh <セッションID>
./scripts/summaries.sh <セッションID>
./scripts/get-by-marker.sh <セッションID> <マーカー>
./scripts/file-ops.sh <セッションID>
# file-diff.sh は直接ハードコードの修正テスト（上記2）で確認済み

unset CLAUDE_CONFIG_DIR
```

### 4. 存在しないパスのエラーハンドリング

```bash
export CLAUDE_CONFIG_DIR=/nonexistent/path
# 各スクリプトがエラーメッセージを出して正常終了（クラッシュしない）ことを確認
./scripts/sessions.sh -n 3
./scripts/resolve-session.sh dummy-id

unset CLAUDE_CONFIG_DIR
```

## 実装順序

1. `resolve-session.sh` -- 他5スクリプトの依存元
2. `sessions.sh` -- 独立したハードコード
3. `current-session.sh` -- 独立したハードコード
4. `file-diff.sh` -- 独立したハードコード + resolve-session.sh への間接依存
5. テスト実行
