# 多段 fork（fork の fork）の jsonl 構造確認と timeline/sessions 対応

fork したセッションをさらに fork した場合の jsonl 構造（forkedFrom が複数階層になるのか、親 sessionId がどう連鎖するのか等）は findings 未記載・実機未確認。現状の `findForkSplit`（lib.ts）は単段 fork 前提。多段 fork の実機 jsonl を採取して構造を確定し、timeline/sessions の境界判定・marker 算出が多段でも正しいか検証して対応する。
