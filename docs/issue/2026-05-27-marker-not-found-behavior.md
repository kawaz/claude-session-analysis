# marker not found 時の挙動

## 現状

`filterByRange` (src/timeline/filter.ts:110-111, 129-130) で marker が見つからないと:

```ts
const idx = events.findIndex((e) => e.ref.startsWith(fromMarker.id));
if (idx === -1) {
  fromIdx = 0;  // ← 全件返す
}
```

## ジレンマ

- **cursor 用途**: 「前回 marker が compact 等で消えた = 状況不明」。全件返すと重複事故。空 + warning が安全
- **人間用途**: 指定 marker が typo / 古い と分かったとき、全件見えたほうが便利

## 案

- 案 1: 一律で空 + stderr warning
- 案 2: `--strict` flag で挙動切替
- 案 3: exclusive (`+N` / `-N` offset 指定時) は空、inclusive (offset=0) は全件
- 案 4: 現状維持

決まったら本 issue で実装。
