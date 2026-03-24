import { describe, test, expect } from "bun:test";
import { extractFileOps, extractFileOpsDetailed, extractFileOpsFullDetail } from "./extract.ts";
import { parseJsonl } from "../lib.ts";

// --- ヘルパー ---
function mkAssistant(content: Record<string, unknown>[], uuid = "aabbccdd-1111-2222-3333-444444444444", timestamp = "2025-01-01T00:01:00Z"): Record<string, unknown> {
  return { type: "assistant", uuid, timestamp, message: { content } };
}

function mkUser(content: string): Record<string, unknown> {
  return {
    type: "user",
    uuid: "11223344-aaaa-bbbb-cccc-dddddddddddd",
    timestamp: "2025-01-01T00:00:00Z",
    message: { content },
  };
}

function mkSnapshot(
  messageId: string,
  backups: Record<string, { backupFileName: string; backupTime: string }>,
): Record<string, unknown> {
  return {
    type: "file-history-snapshot",
    messageId,
    snapshot: { trackedFileBackups: backups },
  };
}

// --- extractFileOps (サマリ) ---
describe("extractFileOps", () => {
  test("Read tool_use を抽出", () => {
    const result = extractFileOps([
      mkAssistant([{ type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } }]),
    ]);
    expect(result).toEqual([{ Read: 1, Write: 0, path: "/a/foo.ts" }]);
  });

  test("Write tool_use を抽出", () => {
    const result = extractFileOps([
      mkAssistant([{ type: "tool_use", name: "Write", input: { file_path: "/a/out.txt" } }]),
    ]);
    expect(result).toEqual([{ Read: 0, Write: 1, path: "/a/out.txt" }]);
  });

  test("Edit は Write カウントにマージ", () => {
    const result = extractFileOps([
      mkAssistant([{ type: "tool_use", name: "Edit", input: { file_path: "/a/lib.ts" } }]),
    ]);
    expect(result).toEqual([{ Read: 0, Write: 1, path: "/a/lib.ts" }]);
  });

  test("混在して正しく分類", () => {
    const result = extractFileOps([
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } },
        { type: "tool_use", name: "Write", input: { file_path: "/a/c.ts" } },
        { type: "tool_use", name: "Edit", input: { file_path: "/a/d.ts" } },
      ]),
    ]);
    expect(result).toEqual([
      { Read: 1, Write: 0, path: "/a/b.ts" },
      { Read: 0, Write: 1, path: "/a/c.ts" },
      { Read: 0, Write: 1, path: "/a/d.ts" },
    ]);
  });

  test("同パスの複数操作はカウント", () => {
    const result = extractFileOps([
      mkAssistant([{ type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } }], "u1"),
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
        { type: "tool_use", name: "Edit", input: { file_path: "/a/foo.ts" } },
      ], "u2"),
    ]);
    expect(result).toEqual([{ Read: 2, Write: 1, path: "/a/foo.ts" }]);
  });

  test("assistant以外は無視", () => {
    const result = extractFileOps([
      mkUser("hello"),
      mkAssistant([{ type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } }]),
    ]);
    expect(result).toEqual([{ Read: 1, Write: 0, path: "/a/foo.ts" }]);
  });

  test("tool_use 以外のブロックは無視", () => {
    const result = extractFileOps([
      mkAssistant([
        { type: "text", text: "hello" },
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ]),
    ]);
    expect(result).toEqual([{ Read: 1, Write: 0, path: "/a/foo.ts" }]);
  });

  test("Read/Write/Edit 以外は無視", () => {
    const result = extractFileOps([
      mkAssistant([
        { type: "tool_use", name: "Bash", input: { command: "ls" } },
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ]),
    ]);
    expect(result).toEqual([{ Read: 1, Write: 0, path: "/a/foo.ts" }]);
  });

  test("空エントリ", () => {
    expect(extractFileOps([])).toEqual([]);
  });

  test("パスでソート", () => {
    const result = extractFileOps([
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/z/c.ts" } },
        { type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } },
      ]),
    ]);
    expect(result.map(r => r.path)).toEqual(["/a/b.ts", "/z/c.ts"]);
  });
});

// --- extractFileOpsDetailed ---
describe("extractFileOpsDetailed", () => {
  test("フラットに操作を出力", () => {
    const result = extractFileOpsDetailed([
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 0, tool: "Read", path: "/a/foo.ts" },
    ]);
  });

  test("snapshot が紐づく", () => {
    const uuid = "aaaa-1111-2222-3333-444444444444";
    const result = extractFileOpsDetailed([
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/a/foo.ts" } },
      ], uuid, "2025-01-01T00:01:00Z"),
      mkSnapshot(uuid, {
        "/a/foo.ts": { backupFileName: "abc123@v1", backupTime: "2025-01-01T00:01:01Z" },
      }),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 0, tool: "Edit", path: "/a/foo.ts", snapshot: "abc123@v1" },
    ]);
  });

  test("snapshot がない操作には snapshot フィールドなし", () => {
    const result = extractFileOpsDetailed([
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/a/foo.ts" } },
      ], "no-snap", "2025-01-01T00:01:00Z"),
    ]);
    expect(result[0].snapshot).toBeUndefined();
  });

  test("時系列順に出力し turn が増える", () => {
    const result = extractFileOpsDetailed([
      mkUser("first question"),
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ], "u1", "2025-01-01T00:01:00Z"),
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/b/bar.ts" } },
      ], "u2", "2025-01-01T00:02:00Z"),
      mkUser("second question"),
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/a/foo.ts" } },
      ], "u3", "2025-01-01T00:03:00Z"),
      mkSnapshot("u3", {
        "/a/foo.ts": { backupFileName: "abc@v1", backupTime: "2025-01-01T00:03:01Z" },
      }),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 1, tool: "Read", path: "/a/foo.ts" },
      { timestamp: "2025-01-01T00:02:00Z", turn: 1, tool: "Read", path: "/b/bar.ts" },
      { timestamp: "2025-01-01T00:03:00Z", turn: 2, tool: "Edit", path: "/a/foo.ts", snapshot: "abc@v1" },
    ]);
  });

  test("snapshot は対象ファイルのみ紐づく", () => {
    const uuid = "aaaa-1111-2222-3333-444444444444";
    const result = extractFileOpsDetailed([
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/a/foo.ts" } },
      ], uuid, "2025-01-01T00:01:00Z"),
      mkSnapshot(uuid, {
        "/a/foo.ts": { backupFileName: "abc@v1", backupTime: "2025-01-01T00:01:01Z" },
        "/other/bar.ts": { backupFileName: "xyz@v1", backupTime: "2025-01-01T00:01:01Z" },
      }),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 0, tool: "Edit", path: "/a/foo.ts", snapshot: "abc@v1" },
    ]);
  });
});

// --- extractFileOpsFullDetail ---
describe("extractFileOpsFullDetail", () => {
  test("Read: offset/limit なしの場合は追加フィールドなし", () => {
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 0, tool: "Read", path: "/a/foo.ts" },
    ]);
  });

  test("Read: offset/limit ありの場合は追加", () => {
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts", offset: 100, limit: 50 } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 0, tool: "Read", path: "/a/foo.ts", offset: 100, limit: 50 },
    ]);
  });

  test("Edit: old_string/new_string を含める", () => {
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/a/foo.ts", old_string: "const x = 1", new_string: "const x = 2" } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 0, tool: "Edit", path: "/a/foo.ts", old_string: "const x = 1", new_string: "const x = 2" },
    ]);
  });

  test("Write: content_lines を含める", () => {
    const content = "line1\nline2\nline3";
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/a/bar.ts", content } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 0, tool: "Write", path: "/a/bar.ts", content_lines: 3 },
    ]);
  });

  test("Write: content がない場合は content_lines なし", () => {
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/a/bar.ts" } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result[0].content_lines).toBeUndefined();
  });

  test("snapshot が紐づく", () => {
    const uuid = "aaaa-1111-2222-3333-444444444444";
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/a/foo.ts", old_string: "a", new_string: "b" } },
      ], uuid, "2025-01-01T00:01:00Z"),
      mkSnapshot(uuid, {
        "/a/foo.ts": { backupFileName: "abc123@v1", backupTime: "2025-01-01T00:01:01Z" },
      }),
    ]);
    expect(result[0].snapshot).toBe("abc123@v1");
    expect(result[0].old_string).toBe("a");
    expect(result[0].new_string).toBe("b");
  });

  test("時系列順に出力し turn が増える", () => {
    const result = extractFileOpsFullDetail([
      mkUser("first question"),
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts", offset: 10, limit: 20 } },
      ], "u1", "2025-01-01T00:01:00Z"),
      mkUser("second question"),
      mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/a/bar.ts", content: "hello\nworld" } },
      ], "u2", "2025-01-01T00:02:00Z"),
    ]);
    expect(result).toEqual([
      { timestamp: "2025-01-01T00:01:00Z", turn: 1, tool: "Read", path: "/a/foo.ts", offset: 10, limit: 20 },
      { timestamp: "2025-01-01T00:02:00Z", turn: 2, tool: "Write", path: "/a/bar.ts", content_lines: 2 },
    ]);
  });

  test("Write: 単一行コンテンツは content_lines: 1", () => {
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/a/bar.ts", content: "single line" } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result[0].content_lines).toBe(1);
  });

  test("Write: 空コンテンツは content_lines: 1", () => {
    const result = extractFileOpsFullDetail([
      mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/a/bar.ts", content: "" } },
      ], "uuid-1", "2025-01-01T00:01:00Z"),
    ]);
    expect(result[0].content_lines).toBe(1);
  });
});

// --- parseJsonl ---
describe("parseJsonl", () => {
  test("パース", () => {
    const lines = [JSON.stringify({ type: "user" }), JSON.stringify({ type: "assistant" })].join("\n");
    expect(parseJsonl(lines)).toHaveLength(2);
  });

  test("不正行スキップ", () => {
    expect(parseJsonl("bad\n" + JSON.stringify({ ok: 1 }))).toHaveLength(1);
  });

  test("空行スキップ", () => {
    expect(parseJsonl("\n" + JSON.stringify({ ok: 1 }) + "\n  \n")).toHaveLength(1);
  });
});
