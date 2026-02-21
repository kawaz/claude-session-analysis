import { describe, test, expect } from "bun:test";
import {
  dedup,
  removeNoBackup,
  parseRangeMarker,
  filterByRange,
  filterByType,
  pipeline,
} from "./filter.ts";
import type { TimelineEvent } from "./types.ts";

describe("dedup", () => {
  test("重複排除", () => {
    const events: TimelineEvent[] = [
      { kind: "U", ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "U", ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "R", ref: "def67890", time: "2024-01-01T00:00:01", desc: "response" },
    ];
    expect(dedup(events)).toHaveLength(2);
  });

  test("同time異kindは残す", () => {
    const events: TimelineEvent[] = [
      { kind: "U", ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "R", ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
    ];
    expect(dedup(events)).toHaveLength(2);
  });

  test("同time同kind異descは残す", () => {
    const events: TimelineEvent[] = [
      { kind: "U", ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "U", ref: "abc12345", time: "2024-01-01T00:00:00", desc: "world" },
    ];
    expect(dedup(events)).toHaveLength(2);
  });

  test("最初に出現したものを残す", () => {
    const events: TimelineEvent[] = [
      { kind: "U", ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "first" },
      { kind: "U", ref: "bbb22222", time: "2024-01-01T00:00:01", desc: "second" },
      { kind: "U", ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "first" },
    ];
    const result = dedup(events);
    expect(result).toHaveLength(2);
    expect(result[0].ref).toBe("aaa11111");
    expect(result[1].ref).toBe("bbb22222");
  });

  test("空配列", () => {
    expect(dedup([])).toEqual([]);
  });
});

describe("removeNoBackup", () => {
  test("バックアップあり -> no-backup除去", () => {
    const events: TimelineEvent[] = [
      { kind: "F", ref: "aaa11111", time: "t1", desc: "file.ts abc12345@v1" },
      { kind: "F", ref: "aaa11111", time: "t2", desc: "file.ts no-backup-write" },
    ];
    const result = removeNoBackup(events);
    expect(result).toHaveLength(1);
    expect(result[0].desc).toContain("@v1");
  });

  test("バックアップなし -> no-backup残す", () => {
    const events: TimelineEvent[] = [
      { kind: "F", ref: "aaa11111", time: "t1", desc: "file.ts something" },
      { kind: "F", ref: "aaa11111", time: "t2", desc: "file.ts no-backup-write" },
    ];
    const result = removeNoBackup(events);
    expect(result).toHaveLength(2);
  });

  test("異なるrefグループは独立に処理", () => {
    const events: TimelineEvent[] = [
      // グループ aaa: @v あり -> no-backup除去
      { kind: "F", ref: "aaa11111", time: "t1", desc: "file.ts abc12345@v1" },
      { kind: "F", ref: "aaa11111", time: "t3", desc: "file.ts no-backup-write" },
      // グループ bbb: @v なし -> no-backup残す
      { kind: "F", ref: "bbb22222", time: "t2", desc: "file.ts no-backup-read" },
    ];
    const result = removeNoBackup(events);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.ref === "aaa11111")?.desc).toContain("@v1");
    expect(result.find((e) => e.ref === "bbb22222")?.desc).toContain("no-backup");
  });

  test("結果はtimeでソート", () => {
    const events: TimelineEvent[] = [
      { kind: "F", ref: "bbb22222", time: "t3", desc: "file.ts abc@v2" },
      { kind: "F", ref: "aaa11111", time: "t1", desc: "file.ts abc@v1" },
      { kind: "F", ref: "bbb22222", time: "t2", desc: "file.ts no-backup" },
    ];
    const result = removeNoBackup(events);
    // bbb: @vあり -> no-backup除去 -> bbb t3 残る
    // aaa: @vあり -> no-backup除去対象なし -> aaa t1 残る
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe("t1");
    expect(result[1].time).toBe("t3");
  });

  test("空配列", () => {
    expect(removeNoBackup([])).toEqual([]);
  });
});

describe("parseRangeMarker", () => {
  test("タイプ文字+hex -> タイプ除去", () => {
    const m = parseRangeMarker("Uabc12345");
    expect(m.id).toBe("abc12345");
    expect(m.offset).toBe(0);
  });

  test("hex先頭はそのまま", () => {
    const m = parseRangeMarker("abc12345");
    expect(m.id).toBe("abc12345");
    expect(m.offset).toBe(0);
  });

  test("正のオフセット", () => {
    const m = parseRangeMarker("Uabc12345+3");
    expect(m.id).toBe("abc12345");
    expect(m.offset).toBe(3);
  });

  test("負のオフセット", () => {
    const m = parseRangeMarker("abc12345-2");
    expect(m.id).toBe("abc12345");
    expect(m.offset).toBe(-2);
  });

  test("空文字列", () => {
    const m = parseRangeMarker("");
    expect(m.id).toBe("");
    expect(m.offset).toBe(0);
  });

  test("大文字+非hexはタイプ除去しない", () => {
    // "Zxyz" -> Z の次が x (非hex) なので除去しない
    const m = parseRangeMarker("Zxyz");
    expect(m.id).toBe("Zxyz");
    expect(m.offset).toBe(0);
  });

  test("小文字始まり+hexはそのまま", () => {
    const m = parseRangeMarker("def456+1");
    expect(m.id).toBe("def456");
    expect(m.offset).toBe(1);
  });
});

describe("filterByRange", () => {
  const events: TimelineEvent[] = [
    { kind: "U", ref: "aaa11111", time: "t0", desc: "e0" },
    { kind: "R", ref: "bbb22222", time: "t1", desc: "e1" },
    { kind: "U", ref: "ccc33333", time: "t2", desc: "e2" },
    { kind: "R", ref: "ddd44444", time: "t3", desc: "e3" },
    { kind: "U", ref: "eee55555", time: "t4", desc: "e4" },
  ];

  test("from..to", () => {
    const result = filterByRange(events, "bbb22222", "ddd44444");
    expect(result).toHaveLength(3);
    expect(result[0].ref).toBe("bbb22222");
    expect(result[2].ref).toBe("ddd44444");
  });

  test("前方一致（短縮マーカー）", () => {
    const result = filterByRange(events, "bbb", "ddd");
    expect(result).toHaveLength(3);
    expect(result[0].ref).toBe("bbb22222");
    expect(result[2].ref).toBe("ddd44444");
  });

  test("オフセット", () => {
    // from=bbb+1 -> idx1+1=idx2, to=ddd-1 -> idx3-1=idx2
    const result = filterByRange(events, "bbb22222+1", "ddd44444-1");
    expect(result).toHaveLength(1);
    expect(result[0].ref).toBe("ccc33333");
  });

  test("範囲外はクランプ", () => {
    // from=aaa-10 -> max(0, -10)=0, to=eee+100 -> min(4, 104)=4
    const result = filterByRange(events, "aaa11111-10", "eee55555+100");
    expect(result).toHaveLength(5);
  });

  test("マッチなし -> 全範囲", () => {
    const result = filterByRange(events, "zzz99999", "zzz99999");
    // from.id matches nothing -> from_idx=0, to.id matches nothing -> to_idx=4
    expect(result).toHaveLength(5);
  });

  test("from空 -> 先頭から", () => {
    const result = filterByRange(events, "", "ccc33333");
    expect(result).toHaveLength(3);
    expect(result[0].ref).toBe("aaa11111");
    expect(result[2].ref).toBe("ccc33333");
  });

  test("to空 -> 末尾まで", () => {
    const result = filterByRange(events, "ccc33333", "");
    expect(result).toHaveLength(3);
    expect(result[0].ref).toBe("ccc33333");
    expect(result[2].ref).toBe("eee55555");
  });

  test("両方空 -> 全範囲", () => {
    const result = filterByRange(events, "", "");
    expect(result).toHaveLength(5);
  });

  test("toのrefが複数マッチ -> 最後のインデックス", () => {
    const evts: TimelineEvent[] = [
      { kind: "U", ref: "aaa11111", time: "t0", desc: "e0" },
      { kind: "R", ref: "bbb22222", time: "t1", desc: "e1" },
      { kind: "U", ref: "bbb22222", time: "t2", desc: "e2" },
      { kind: "R", ref: "ccc33333", time: "t3", desc: "e3" },
    ];
    const result = filterByRange(evts, "aaa", "bbb");
    expect(result).toHaveLength(3); // idx0..idx2
  });

  test("fromのrefが複数マッチ -> 最初のインデックス", () => {
    const evts: TimelineEvent[] = [
      { kind: "U", ref: "aaa11111", time: "t0", desc: "e0" },
      { kind: "R", ref: "bbb22222", time: "t1", desc: "e1" },
      { kind: "U", ref: "bbb22222", time: "t2", desc: "e2" },
      { kind: "R", ref: "ccc33333", time: "t3", desc: "e3" },
    ];
    const result = filterByRange(evts, "bbb", "ccc");
    expect(result).toHaveLength(3); // idx1..idx3
  });
});

describe("filterByType", () => {
  const events: TimelineEvent[] = [
    { kind: "U", ref: "aaa11111", time: "t0", desc: "user" },
    { kind: "R", ref: "bbb22222", time: "t1", desc: "response" },
    { kind: "F", ref: "ccc33333", time: "t2", desc: "file" },
    { kind: "T", ref: "ddd44444", time: "t3", desc: "tool" },
  ];

  test("指定タイプのみフィルタ", () => {
    const result = filterByType(events, "UR");
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("U");
    expect(result[1].kind).toBe("R");
  });

  test("全タイプ指定 -> 全件", () => {
    const result = filterByType(events, "URFT");
    expect(result).toHaveLength(4);
  });

  test("該当なし -> 空", () => {
    const result = filterByType(events, "W");
    expect(result).toHaveLength(0);
  });
});

describe("pipeline", () => {
  test("全フィルタの組み合わせ", () => {
    const events: TimelineEvent[] = [
      { kind: "U", ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "U", ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "hello" }, // dup
      { kind: "R", ref: "bbb22222", time: "2024-01-01T00:00:01", desc: "resp" },
      { kind: "F", ref: "ccc33333", time: "2024-01-01T00:00:02", desc: "file abc@v1" },
      { kind: "F", ref: "ccc33333", time: "2024-01-01T00:00:03", desc: "file no-backup" },
      { kind: "U", ref: "ddd44444", time: "2024-01-01T00:00:04", desc: "end" },
    ];
    // dedup: 5件 (dup除去)
    // removeNoBackup: cccグループに@vあり -> no-backup除去 -> 4件
    // sort -> filterByRange(bbb..ddd) -> idx1..idx3 -> 3件 (bbb, ccc, ddd)
    // filterByType("UR") -> U,R のみ -> bbb(R), ddd(U) -> 2件
    const result = pipeline(events, { types: "UR", from: "bbb", to: "ddd" });
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("R");
    expect(result[0].ref).toBe("bbb22222");
    expect(result[1].kind).toBe("U");
    expect(result[1].ref).toBe("ddd44444");
  });

  test("デフォルトオプション -> 全件（dedup+removeNoBackupのみ適用）", () => {
    const events: TimelineEvent[] = [
      { kind: "U", ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "R", ref: "bbb22222", time: "2024-01-01T00:00:01", desc: "resp" },
    ];
    const result = pipeline(events, { types: "UTRFWBGASQDI", from: "", to: "" });
    expect(result).toHaveLength(2);
  });
});
