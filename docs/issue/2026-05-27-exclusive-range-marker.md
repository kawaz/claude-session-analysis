# `marker+N..` を cursor 用途で正しく動かす

## 背景

`csa timeline --jsonl` で marker (event ref の先頭 8 hex) ベースの range 指定が可能。
既に `parseRangeMarker` (src/timeline/filter.ts:56-76) で `+N` / `-N` のオフセット記法が実装済み:

```ts
parseRangeMarker("Uabc1234+1") → { id: "abc1234", offset: 1 }
parseRangeMarker("Uabc1234-2") → { id: "abc1234", offset: -2 }
```

形の上では `Uxxxx5678+1..` で「xxxx5678 の次の event から末尾まで」を表現できるので、
cursor 的増分取得 (subscribe で新着通知 → 前回 last event の次から取りたい) にこれを使いたい。

## バグ

`filterByRange` (src/timeline/filter.ts:84-141) に 2 つの問題があり、現状 `marker+1..` が cursor として機能しない。

### 問題 1: 末尾超えの offset がクランプされる (filter.ts:137-138)

```ts
fromIdx = Math.max(0, Math.min(fromIdx, events.length - 1));
toIdx = Math.max(0, Math.min(toIdx, events.length - 1));
return events.slice(fromIdx, toIdx + 1);
```

例: events.length=10、最後の event (index=9) が marker。
`Umarker+1..` で `fromIdx=10` になるべきが `9` にクランプされ、最後の event 自身が含まれてしまう。
**exclusive cursor として致命的**。

### 問題 2: marker not found で全件返す (filter.ts:110-111)

```ts
const idx = events.findIndex((e) => e.ref.startsWith(fromMarker.id));
if (idx === -1) {
  fromIdx = 0;  // ← marker not found → 先頭から全件
}
```

cursor 用途では「前回の marker が compact 等で消えた = 状況不明」。安全側に倒すべきで、
全件再取得は重複事故のもと。

## 修正方針 (案 B)

新しい構文は増やさず、既存 `+N` offset の挙動だけ直す。

### 1. クランプを外す

`fromIdx > events.length - 1` または `toIdx < 0` なら**空配列を返す** (クランプしない)。
inclusive な `marker..` (offset=0) は marker が見つかれば必ず範囲内なので影響なし。
影響するのは offset 指定時のみ。

### 2. marker not found 時の挙動を厳格化

- `from` の marker not found → **空配列 + stderr warning**
- `to` の marker not found → 同上

inclusive な人間用途 (`csa timeline Uabc.. <sid>`) でも「指定したのに見つからないなら全件は不自然」なので、
inclusive/exclusive で分岐せず一律で空 + warning にする。

(分岐が必要だと判明したら後で追加する。まず一律で試す)

### 3. semantics の明文化

`+N` / `-N` は **event index ベース** であることを --help と docs/MANUAL に明記:

- `marker+0` = `marker` (= 同じ event)
- `marker+1` = marker の**次の event** (= cursor として使える形)
- `marker-1` = marker の**前の event**

「ターン +1」「行 +1」と読まれないように。

## やること

1. `filterByRange` のクランプを外し、範囲外なら空配列を返す
2. `filterByRange` の marker not found 時に空配列 + stderr warning
3. test 追加 (filter.test.ts):
   - 末尾 marker に `+1` → 空
   - 先頭 marker に `-1` → 空
   - marker not found → 空 + warning
   - 既存 inclusive ケース (`marker..`, `..marker`, `from..to`) は不変
4. --help と docs/MANUAL に `+N` / `-N` semantics を明記
5. cursor 用途のサンプル (subscribe → `last+1..` で増分取得) を docs に追記

## 影響範囲

- `marker..` / `..marker` / `marker` (offset なし) は完全に不変
- `marker+N..` を既に使っていたユーザは marker not found 時の挙動が変わる (全件 → 空 + warning)。
  ただし `+N` 構文の利用は実質これからなので、破壊的とみなさない

## 関連

- src/timeline/parse-args.ts:32-44 (`parseRange`) — 変更不要
- src/timeline/filter.ts:56-76 (`parseRangeMarker`) — 変更不要
- src/timeline/filter.ts:84-141 (`filterByRange`) — 主な変更箇所
- 親プロジェクト側の要件: cursor 的増分取得 (subscribe event 駆動)
