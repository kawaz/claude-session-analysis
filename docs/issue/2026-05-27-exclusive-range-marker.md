# `marker+N..` のクランプを撤廃

## 背景

`parseRangeMarker` (src/timeline/filter.ts:56-76) で `+N` / `-N` の offset 記法は実装済み。
cursor 的増分取得 (subscribe 新着 → 前回 last event の次から) で `Umarker+1..` を使いたいが、
末尾超え時にクランプされて inclusive と同じ結果になり機能しない。

## バグ

`filterByRange` (src/timeline/filter.ts:135-141):

```ts
fromIdx = Math.max(0, Math.min(fromIdx, events.length - 1));
toIdx = Math.max(0, Math.min(toIdx, events.length - 1));
```

例: events.length=10、index=9 が marker。`Umarker+1..` で fromIdx=10 が 9 にクランプされ marker 自身が含まれる。

## 修正

`fromIdx > events.length - 1` または `toIdx < 0` なら**空配列を返す** (クランプしない)。
`marker-N..` で fromIdx 負、`..marker+N` で toIdx 末尾超えも対称。

## test

- `marker+1..` で末尾 marker → 空
- `marker+N..` で 0 < N <= 残件数 → 正しく N 件減
- `..marker-1` 等 to 側も同様
- 既存 inclusive ケース (`marker..`, `..marker`, `from..to`) は不変

## scope 外 (別 issue)

marker not found 時に `fromIdx=0` で全件返す挙動 → `2026-05-27-marker-not-found-behavior.md`

## 関連

- src/timeline/filter.ts:84-141 (`filterByRange`)
- 親プロジェクトの cursor 用途
