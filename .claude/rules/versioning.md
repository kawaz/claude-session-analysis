# バージョン管理ルール

プラグイン機能（skills, hooks など）を修正して push する際は:

1. `.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` の version を同期更新
2. `claude plugin validate .` を実行して検証に通ること
