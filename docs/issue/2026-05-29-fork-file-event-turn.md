# fork セッションの file-history-snapshot 由来 F イベントの turn を直近 U に揃える

fork セッションで file-history-snapshot 由来の F イベントは古い backupTime で time ソート先頭に来ることがあり、turn が本体より大きく付く（PR③再レビューで `command_computed` の range が `5 F..3 R` のような嘘表示になる根因として顕在化）。range 表示は `computeRangeMarker` で turn 昇順 min/max に直して対症療法済みだが、根本は「F イベントの turn を直近の U に揃える」設計変更。別 issue として実装を検討する。
