import { describe, test, expect } from "bun:test";
import { parseMarker, findEntries, findEntriesWithContext } from "./extract.ts";

// --- ヘルパー ---
function mkUser(uuid: string, content: string): Record<string, unknown> {
  return {
    type: "user",
    uuid,
    timestamp: "2025-01-01T00:00:00Z",
    message: { content },
  };
}

function mkAssistant(uuid: string, content: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "assistant",
    uuid,
    timestamp: "2025-01-01T00:01:00Z",
    message: { content },
  };
}

function mkFileSnapshot(messageId: string, backups: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "file-history-snapshot",
    messageId,
    snapshot: { trackedFileBackups: backups },
  };
}

// --- parseMarker ---
describe("parseMarker", () => {
  test("通常マーカー: U7e2451f", () => {
    const result = parseMarker("U7e2451f");
    expect(result).toEqual({ type: "U", id: "7e2451f" });
  });

  test("F型マーカー: Fab12cd34", () => {
    const result = parseMarker("Fab12cd34");
    expect(result).toEqual({ type: "F", id: "ab12cd34" });
  });

  test("B型マーカー: B00112233", () => {
    const result = parseMarker("B00112233");
    expect(result).toEqual({ type: "B", id: "00112233" });
  });

  test("全タイプ文字が正しくパースされる", () => {
    for (const t of ["U", "T", "R", "F", "W", "B", "G", "A", "S", "Q", "D", "I"]) {
      const result = parseMarker(`${t}aabbccdd`);
      expect(result.type).toBe(t);
      expect(result.id).toBe("aabbccdd");
    }
  });

  test("短いID", () => {
    const result = parseMarker("Uaabb");
    expect(result).toEqual({ type: "U", id: "aabb" });
  });
});

// --- findEntries ---
describe("findEntries", () => {
  test("uuidの先頭一致で検索（U型）", () => {
    const entries = [
      mkUser("aabbccdd-1111-2222-3333-444444444444", "hello"),
      mkUser("11223344-aaaa-bbbb-cccc-dddddddddddd", "world"),
    ];
    const result = findEntries(entries, "U", "aabbccdd");
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).uuid).toBe("aabbccdd-1111-2222-3333-444444444444");
  });

  test("uuidの先頭一致で検索（T型）", () => {
    const entries = [
      mkAssistant("bbccddee-1111-2222-3333-444444444444", [
        { type: "thinking", thinking: "考え中" },
      ]),
    ];
    const result = findEntries(entries, "T", "bbccddee");
    expect(result).toHaveLength(1);
  });

  test("F型: uuidでマッチ", () => {
    const entries = [
      mkAssistant("aabbccdd-1111-2222-3333-444444444444", [
        { type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } },
      ]),
    ];
    const result = findEntries(entries, "F", "aabbccdd");
    expect(result).toHaveLength(1);
  });

  test("F型: file-history-snapshotのmessageIdでマッチ", () => {
    const entries = [
      mkFileSnapshot("ddeeff00-1111-2222-3333-444444444444", {
        "/a/b.ts": { backupFileName: "hash@v1", backupTime: "2025-01-01T00:05:00Z" },
      }),
    ];
    const result = findEntries(entries, "F", "ddeeff00");
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).messageId).toBe("ddeeff00-1111-2222-3333-444444444444");
  });

  test("F型: uuidとmessageIdの両方でマッチする場合は両方返す", () => {
    const entries = [
      mkAssistant("aabbccdd-1111-2222-3333-444444444444", [
        { type: "tool_use", name: "Write", input: { file_path: "/a/c.ts" } },
      ]),
      mkFileSnapshot("aabbccdd-2222-3333-4444-555555555555", {
        "/a/d.ts": { backupFileName: "hash@v1", backupTime: "2025-01-01T00:05:00Z" },
      }),
    ];
    const result = findEntries(entries, "F", "aabbccdd");
    expect(result).toHaveLength(2);
  });

  test("マッチしない場合は空配列", () => {
    const entries = [
      mkUser("aabbccdd-1111-2222-3333-444444444444", "hello"),
    ];
    const result = findEntries(entries, "U", "ffffffff");
    expect(result).toHaveLength(0);
  });

  test("非F型ではmessageIdは検索対象にならない", () => {
    const entries = [
      mkFileSnapshot("aabbccdd-1111-2222-3333-444444444444", {}),
    ];
    // U型で検索 → messageIdはマッチ対象外
    const result = findEntries(entries, "U", "aabbccdd");
    expect(result).toHaveLength(0);
  });
});

// --- findEntriesWithContext ---
describe("findEntriesWithContext", () => {
  const entries = [
    mkUser("00000000-0000-0000-0000-000000000000", "first"),
    mkUser("11111111-1111-1111-1111-111111111111", "second"),
    mkUser("22222222-2222-2222-2222-222222222222", "third"),
    mkUser("33333333-3333-3333-3333-333333333333", "fourth"),
    mkUser("44444444-4444-4444-4444-444444444444", "fifth"),
  ];

  test("コンテキストなし（before=0, after=0）: 該当エントリのみ", () => {
    const result = findEntriesWithContext(entries, "U", "22222222", 0, 0);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).uuid).toBe("22222222-2222-2222-2222-222222222222");
  });

  test("-B 1: 1つ前のエントリも含む", () => {
    const result = findEntriesWithContext(entries, "U", "22222222", 1, 0);
    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>).uuid).toBe("11111111-1111-1111-1111-111111111111");
    expect((result[1] as Record<string, unknown>).uuid).toBe("22222222-2222-2222-2222-222222222222");
  });

  test("-A 2: 2つ後のエントリも含む", () => {
    const result = findEntriesWithContext(entries, "U", "22222222", 0, 2);
    expect(result).toHaveLength(3);
    expect((result[0] as Record<string, unknown>).uuid).toBe("22222222-2222-2222-2222-222222222222");
    expect((result[1] as Record<string, unknown>).uuid).toBe("33333333-3333-3333-3333-333333333333");
    expect((result[2] as Record<string, unknown>).uuid).toBe("44444444-4444-4444-4444-444444444444");
  });

  test("-C 1 (before=1, after=1): 前後1つずつ含む", () => {
    const result = findEntriesWithContext(entries, "U", "22222222", 1, 1);
    expect(result).toHaveLength(3);
    expect((result[0] as Record<string, unknown>).uuid).toBe("11111111-1111-1111-1111-111111111111");
    expect((result[1] as Record<string, unknown>).uuid).toBe("22222222-2222-2222-2222-222222222222");
    expect((result[2] as Record<string, unknown>).uuid).toBe("33333333-3333-3333-3333-333333333333");
  });

  test("先頭エントリに-B: 範囲を超えない（clamp）", () => {
    const result = findEntriesWithContext(entries, "U", "00000000", 3, 0);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).uuid).toBe("00000000-0000-0000-0000-000000000000");
  });

  test("末尾エントリに-A: 範囲を超えない（clamp）", () => {
    const result = findEntriesWithContext(entries, "U", "44444444", 0, 3);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).uuid).toBe("44444444-4444-4444-4444-444444444444");
  });

  test("マッチしない場合は空配列", () => {
    const result = findEntriesWithContext(entries, "U", "ffffffff", 2, 2);
    expect(result).toHaveLength(0);
  });

  test("uuid/messageIdを持つエントリのみがコンテキスト対象", () => {
    // uuid も messageId もないエントリが混在
    const mixedEntries = [
      mkUser("00000000-0000-0000-0000-000000000000", "first"),
      { type: "unknown", data: "no uuid" },  // uuid/messageIdなし
      mkUser("22222222-2222-2222-2222-222222222222", "third"),
      mkUser("33333333-3333-3333-3333-333333333333", "fourth"),
    ];
    const result = findEntriesWithContext(mixedEntries, "U", "22222222", 1, 1);
    // uuid/messageIdを持つエントリのみでインデックスが計算される
    expect(result).toHaveLength(3);
    expect((result[0] as Record<string, unknown>).uuid).toBe("00000000-0000-0000-0000-000000000000");
    expect((result[1] as Record<string, unknown>).uuid).toBe("22222222-2222-2222-2222-222222222222");
    expect((result[2] as Record<string, unknown>).uuid).toBe("33333333-3333-3333-3333-333333333333");
  });

  test("F型コンテキスト: messageIdでマッチしてもコンテキスト取得可能", () => {
    const mixedEntries = [
      mkUser("00000000-0000-0000-0000-000000000000", "before"),
      mkFileSnapshot("aabbccdd-1111-2222-3333-444444444444", {
        "/a/b.ts": { backupFileName: "hash@v1", backupTime: "2025-01-01T00:05:00Z" },
      }),
      mkUser("22222222-2222-2222-2222-222222222222", "after"),
    ];
    const result = findEntriesWithContext(mixedEntries, "F", "aabbccdd", 1, 1);
    expect(result).toHaveLength(3);
  });
});
