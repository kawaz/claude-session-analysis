import { describe, test, expect } from "bun:test";
import {
  dedup,
  removeNoBackup,
  parseRangeMarker,
  filterByRange,
  filterByType,
  filterByGrep,
  filterBySince,
  splitTurns,
  filterByLastTurn,
  filterByLastSince,
  filterByGrepContext,
  pipeline,
} from "./filter.ts";
import type { TimelineEvent } from "./types.ts";

describe("dedup", () => {
  test("重複排除", () => {
    const events: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "U", turn: 1, ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "R", turn: 1, ref: "def67890", time: "2024-01-01T00:00:01", desc: "response" },
    ];
    expect(dedup(events)).toHaveLength(2);
  });

  test("同time異kindは残す", () => {
    const events: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "R", turn: 1, ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
    ];
    expect(dedup(events)).toHaveLength(2);
  });

  test("同time同kind異descは残す", () => {
    const events: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "abc12345", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "U", turn: 1, ref: "abc12345", time: "2024-01-01T00:00:00", desc: "world" },
    ];
    expect(dedup(events)).toHaveLength(2);
  });

  test("最初に出現したものを残す", () => {
    const events: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "first" },
      { kind: "U", turn: 2, ref: "bbb22222", time: "2024-01-01T00:00:01", desc: "second" },
      { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "first" },
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
      { kind: "F", turn: 1, ref: "aaa11111", time: "t1", desc: "file.ts abc12345@v1" },
      { kind: "F", turn: 1, ref: "aaa11111", time: "t2", desc: "file.ts no-backup-write" },
    ];
    const result = removeNoBackup(events);
    expect(result).toHaveLength(1);
    expect(result[0].desc).toContain("@v1");
  });

  test("バックアップなし -> no-backup残す", () => {
    const events: TimelineEvent[] = [
      { kind: "F", turn: 1, ref: "aaa11111", time: "t1", desc: "file.ts something" },
      { kind: "F", turn: 1, ref: "aaa11111", time: "t2", desc: "file.ts no-backup-write" },
    ];
    const result = removeNoBackup(events);
    expect(result).toHaveLength(2);
  });

  test("異なるrefグループは独立に処理", () => {
    const events: TimelineEvent[] = [
      // グループ aaa: @v あり -> no-backup除去
      { kind: "F", turn: 1, ref: "aaa11111", time: "t1", desc: "file.ts abc12345@v1" },
      { kind: "F", turn: 1, ref: "aaa11111", time: "t3", desc: "file.ts no-backup-write" },
      // グループ bbb: @v なし -> no-backup残す
      { kind: "F", turn: 1, ref: "bbb22222", time: "t2", desc: "file.ts no-backup-read" },
    ];
    const result = removeNoBackup(events);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.ref === "aaa11111")?.desc).toContain("@v1");
    expect(result.find((e) => e.ref === "bbb22222")?.desc).toContain("no-backup");
  });

  test("結果はtimeでソート", () => {
    const events: TimelineEvent[] = [
      { kind: "F", turn: 1, ref: "bbb22222", time: "t3", desc: "file.ts abc@v2" },
      { kind: "F", turn: 1, ref: "aaa11111", time: "t1", desc: "file.ts abc@v1" },
      { kind: "F", turn: 1, ref: "bbb22222", time: "t2", desc: "file.ts no-backup" },
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
    { kind: "U", turn: 1, ref: "aaa11111", time: "t0", desc: "e0" },
    { kind: "R", turn: 1, ref: "bbb22222", time: "t1", desc: "e1" },
    { kind: "U", turn: 2, ref: "ccc33333", time: "t2", desc: "e2" },
    { kind: "R", turn: 2, ref: "ddd44444", time: "t3", desc: "e3" },
    { kind: "U", turn: 3, ref: "eee55555", time: "t4", desc: "e4" },
  ];

  test("from..to (marker)", () => {
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
      { kind: "U", turn: 1, ref: "aaa11111", time: "t0", desc: "e0" },
      { kind: "R", turn: 1, ref: "bbb22222", time: "t1", desc: "e1" },
      { kind: "U", turn: 2, ref: "bbb22222", time: "t2", desc: "e2" },
      { kind: "R", turn: 2, ref: "ccc33333", time: "t3", desc: "e3" },
    ];
    const result = filterByRange(evts, "aaa", "bbb");
    expect(result).toHaveLength(3); // idx0..idx2
  });

  test("fromのrefが複数マッチ -> 最初のインデックス", () => {
    const evts: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "aaa11111", time: "t0", desc: "e0" },
      { kind: "R", turn: 1, ref: "bbb22222", time: "t1", desc: "e1" },
      { kind: "U", turn: 2, ref: "bbb22222", time: "t2", desc: "e2" },
      { kind: "R", turn: 2, ref: "ccc33333", time: "t3", desc: "e3" },
    ];
    const result = filterByRange(evts, "bbb", "ccc");
    expect(result).toHaveLength(3); // idx1..idx3
  });

  // turn-based range tests
  test("turn range: 単一ターン (from=to)", () => {
    const result = filterByRange(events, "2", "2");
    expect(result).toHaveLength(2);
    expect(result[0].ref).toBe("ccc33333");
    expect(result[1].ref).toBe("ddd44444");
  });

  test("turn range: from..to", () => {
    const result = filterByRange(events, "1", "2");
    expect(result).toHaveLength(4);
    expect(result[0].ref).toBe("aaa11111");
    expect(result[3].ref).toBe("ddd44444");
  });

  test("turn range: from.. (to空)", () => {
    const result = filterByRange(events, "2", "");
    expect(result).toHaveLength(3);
    expect(result[0].ref).toBe("ccc33333");
    expect(result[2].ref).toBe("eee55555");
  });

  test("turn range: ..to (from空)", () => {
    const result = filterByRange(events, "", "2");
    expect(result).toHaveLength(4);
    expect(result[0].ref).toBe("aaa11111");
    expect(result[3].ref).toBe("ddd44444");
  });

  test("turn range: 範囲外のターンは空", () => {
    const result = filterByRange(events, "10", "20");
    expect(result).toHaveLength(0);
  });
});

describe("filterByType", () => {
  const events: TimelineEvent[] = [
    { kind: "U", turn: 1, ref: "aaa11111", time: "t0", desc: "user" },
    { kind: "R", turn: 1, ref: "bbb22222", time: "t1", desc: "response" },
    { kind: "F", turn: 1, ref: "ccc33333", time: "t2", desc: "file" },
    { kind: "T", turn: 1, ref: "ddd44444", time: "t3", desc: "tool" },
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

describe("filterByGrep", () => {
  const events: TimelineEvent[] = [
    { kind: "U", turn: 1, ref: "aaa11111", time: "t0", desc: "Update README.md" },
    { kind: "R", turn: 1, ref: "bbb22222", time: "t1", desc: "response text" },
    { kind: "F", turn: 1, ref: "ccc33333", time: "t2", desc: "src/index.ts abc@v1" },
    { kind: "B", turn: 1, ref: "ddd44444", time: "t3", desc: "bun test" },
  ];

  test("正規表現でdescをフィルタ", () => {
    const result = filterByGrep(events, "README");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("U");
  });

  test("正規表現パターンでマッチ", () => {
    const result = filterByGrep(events, "src.*\\.ts");
    expect(result).toHaveLength(1);
    expect(result[0].ref).toBe("ccc33333");
  });

  test("マッチなし → 空配列", () => {
    const result = filterByGrep(events, "nonexistent");
    expect(result).toHaveLength(0);
  });

  test("空パターン → 全件マッチ", () => {
    const result = filterByGrep(events, "");
    expect(result).toHaveLength(4);
  });
});

describe("filterBySince", () => {
  const events: TimelineEvent[] = [
    { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00Z", desc: "old" },
    { kind: "R", turn: 1, ref: "bbb22222", time: "2024-01-01T01:00:00Z", desc: "mid" },
    { kind: "U", turn: 2, ref: "ccc33333", time: "2024-01-01T02:00:00Z", desc: "new" },
  ];

  test("空文字列は全件返す", () => {
    expect(filterBySince(events, "")).toHaveLength(3);
  });

  test("ISO8601日時文字列でフィルタ", () => {
    const result = filterBySince(events, "2024-01-01T00:30:00Z");
    expect(result).toHaveLength(2);
    expect(result[0].ref).toBe("bbb22222");
    expect(result[1].ref).toBe("ccc33333");
  });

  test("duration文字列でフィルタ (1h)", () => {
    // 現在時刻から1時間前以降のイベント → 未来のイベントなので全て除外される可能性
    // → duration テストは相対的なので、現在時刻に近いイベントを使う
    const now = new Date();
    const recentEvents: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "aaa11111", time: new Date(now.getTime() - 7200000).toISOString(), desc: "2h ago" },
      { kind: "R", turn: 1, ref: "bbb22222", time: new Date(now.getTime() - 1800000).toISOString(), desc: "30m ago" },
      { kind: "U", turn: 2, ref: "ccc33333", time: new Date(now.getTime() - 600000).toISOString(), desc: "10m ago" },
    ];
    const result = filterBySince(recentEvents, "1h");
    expect(result).toHaveLength(2);
    expect(result[0].desc).toBe("30m ago");
    expect(result[1].desc).toBe("10m ago");
  });

  test("ソートサフィックス _NNNNN 付きの time も正しく処理", () => {
    const result = filterBySince(
      [
        { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00Z_00001", desc: "old" },
        { kind: "R", turn: 1, ref: "bbb22222", time: "2024-01-01T02:00:00Z_00002", desc: "new" },
      ],
      "2024-01-01T01:00:00Z",
    );
    expect(result).toHaveLength(1);
    expect(result[0].ref).toBe("bbb22222");
  });
});

describe("splitTurns", () => {
  test("U区切りでターン分割", () => {
    const events: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "aaa11111", time: "t1", desc: "user1" },
      { kind: "R", turn: 1, ref: "bbb22222", time: "t2", desc: "resp1" },
      { kind: "B", turn: 1, ref: "ccc33333", time: "t3", desc: "bash1" },
      { kind: "U", turn: 2, ref: "ddd44444", time: "t4", desc: "user2" },
      { kind: "R", turn: 2, ref: "eee55555", time: "t5", desc: "resp2" },
    ];
    const turns = splitTurns(events);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveLength(3); // U, R, B
    expect(turns[1]).toHaveLength(2); // U, R
  });

  test("先頭にUがない場合はプレターンとして扱う", () => {
    const events: TimelineEvent[] = [
      { kind: "I", turn: 0, ref: "aaa11111", time: "t1", desc: "info" },
      { kind: "U", turn: 1, ref: "bbb22222", time: "t2", desc: "user1" },
      { kind: "R", turn: 1, ref: "ccc33333", time: "t3", desc: "resp1" },
    ];
    const turns = splitTurns(events);
    expect(turns).toHaveLength(2); // [I], [U, R]
    expect(turns[0]).toHaveLength(1);
    expect(turns[0][0].kind).toBe("I");
    expect(turns[1]).toHaveLength(2);
  });

  test("Uがない場合は全体が1ターン", () => {
    const events: TimelineEvent[] = [
      { kind: "R", turn: 0, ref: "aaa11111", time: "t1", desc: "resp1" },
      { kind: "B", turn: 0, ref: "bbb22222", time: "t2", desc: "bash1" },
    ];
    const turns = splitTurns(events);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toHaveLength(2);
  });

  test("空配列", () => {
    expect(splitTurns([])).toEqual([]);
  });
});

describe("filterByLastTurn", () => {
  const events: TimelineEvent[] = [
    { kind: "U", turn: 1, ref: "aaa11111", time: "t1", desc: "user1" },
    { kind: "R", turn: 1, ref: "bbb22222", time: "t2", desc: "resp1" },
    { kind: "U", turn: 2, ref: "ccc33333", time: "t3", desc: "user2" },
    { kind: "R", turn: 2, ref: "ddd44444", time: "t4", desc: "resp2" },
    { kind: "U", turn: 3, ref: "eee55555", time: "t5", desc: "user3" },
    { kind: "R", turn: 3, ref: "fff66666", time: "t6", desc: "resp3" },
  ];

  test("末尾1ターン", () => {
    const result = filterByLastTurn(events, 1);
    expect(result).toHaveLength(2); // U3, R3
    expect(result[0].desc).toBe("user3");
  });

  test("末尾2ターン", () => {
    const result = filterByLastTurn(events, 2);
    expect(result).toHaveLength(4); // U2, R2, U3, R3
    expect(result[0].desc).toBe("user2");
  });

  test("N=0 は全件返す", () => {
    const result = filterByLastTurn(events, 0);
    expect(result).toHaveLength(6);
  });

  test("Nがターン数を超える場合は全件", () => {
    const result = filterByLastTurn(events, 100);
    expect(result).toHaveLength(6);
  });
});

describe("filterByLastSince", () => {
  const events: TimelineEvent[] = [
    { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00Z", desc: "old" },
    { kind: "R", turn: 1, ref: "bbb22222", time: "2024-01-01T01:00:00Z", desc: "mid" },
    { kind: "U", turn: 2, ref: "ccc33333", time: "2024-01-01T02:00:00Z", desc: "new" },
  ];

  test("空文字列は全件返す", () => {
    expect(filterByLastSince(events, "")).toHaveLength(3);
  });

  test("1h30m → 末尾から1.5時間以内", () => {
    // 末尾は 02:00:00, 1h30m前 = 00:30:00
    // mid(01:00) と new(02:00) が残る
    const result = filterByLastSince(events, "1h30m");
    expect(result).toHaveLength(2);
    expect(result[0].desc).toBe("mid");
    expect(result[1].desc).toBe("new");
  });

  test("30m → 末尾から30分以内", () => {
    // 末尾は 02:00:00, 30m前 = 01:30:00
    // new(02:00) のみ残る
    const result = filterByLastSince(events, "30m");
    expect(result).toHaveLength(1);
    expect(result[0].desc).toBe("new");
  });

  test("空イベントでエラーにならない", () => {
    expect(filterByLastSince([], "1h")).toEqual([]);
  });
});

describe("filterByGrepContext", () => {
  const events: TimelineEvent[] = [
    { kind: "U", turn: 1, ref: "aaa11111", time: "t1", desc: "user1" },
    { kind: "R", turn: 1, ref: "bbb22222", time: "t2", desc: "resp1" },
    { kind: "U", turn: 2, ref: "ccc33333", time: "t3", desc: "target" },
    { kind: "R", turn: 2, ref: "ddd44444", time: "t4", desc: "resp2" },
    { kind: "U", turn: 3, ref: "eee55555", time: "t5", desc: "user3" },
    { kind: "R", turn: 3, ref: "fff66666", time: "t6", desc: "resp3" },
    { kind: "U", turn: 4, ref: "ggg77777", time: "t7", desc: "user4" },
    { kind: "R", turn: 4, ref: "hhh88888", time: "t8", desc: "resp4" },
  ];

  test("grep マッチターン + 前後1ターン", () => {
    const result = filterByGrepContext(events, "target", 1, 1);
    // ターン: [U1,R1] [U-target,R2] [U3,R3] [U4,R4]
    // target はターン1(0-indexed), before=1 → ターン0, after=1 → ターン2
    // → ターン0,1,2 = 6イベント
    expect(result).toHaveLength(6);
    expect(result[0].desc).toBe("user1");
    expect(result[5].desc).toBe("resp3");
  });

  test("grep マッチターンのみ (A=0, B=0)", () => {
    const result = filterByGrepContext(events, "target", 0, 0);
    expect(result).toHaveLength(2); // U-target, R2
    expect(result[0].desc).toBe("target");
  });

  test("マッチなしは空配列", () => {
    const result = filterByGrepContext(events, "nonexistent", 1, 1);
    expect(result).toEqual([]);
  });

  test("before が先頭を超えてもクランプ", () => {
    const result = filterByGrepContext(events, "target", 10, 0);
    // target はターン1, before=10 → ターン0まで
    expect(result).toHaveLength(4); // ターン0,1
    expect(result[0].desc).toBe("user1");
  });
});

describe("pipeline", () => {
  test("全フィルタの組み合わせ", () => {
    const events: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "hello" }, // dup
      { kind: "R", turn: 1, ref: "bbb22222", time: "2024-01-01T00:00:01", desc: "resp" },
      { kind: "F", turn: 1, ref: "ccc33333", time: "2024-01-01T00:00:02", desc: "file abc@v1" },
      { kind: "F", turn: 1, ref: "ccc33333", time: "2024-01-01T00:00:03", desc: "file no-backup" },
      { kind: "U", turn: 2, ref: "ddd44444", time: "2024-01-01T00:00:04", desc: "end" },
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
      { kind: "U", turn: 1, ref: "aaa11111", time: "2024-01-01T00:00:00", desc: "hello" },
      { kind: "R", turn: 1, ref: "bbb22222", time: "2024-01-01T00:00:01", desc: "resp" },
    ];
    const result = pipeline(events, { types: "UTRFWBGASQDI", from: "", to: "" });
    expect(result).toHaveLength(2);
  });
});
