import { describe, test, expect } from "bun:test";
import { extractFileOps, extractFileOpsFromJsonl, type FileOpsResult } from "./extract.ts";

// --- ヘルパー ---
function mkAssistant(content: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "assistant",
    uuid: "aabbccdd-1111-2222-3333-444444444444",
    timestamp: "2025-01-01T00:01:00Z",
    message: { content },
  };
}

function mkUser(content: string): Record<string, unknown> {
  return {
    type: "user",
    uuid: "11223344-aaaa-bbbb-cccc-dddddddddddd",
    timestamp: "2025-01-01T00:00:00Z",
    message: { content },
  };
}

// --- 基本抽出 ---
describe("extractFileOps", () => {
  test("Read tool_use を抽出", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/home/user/project/src/foo.ts" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Read: ["/home/user/project/src/foo.ts"],
    });
  });

  test("Write tool_use を抽出", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/home/user/project/out.txt" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Write: ["/home/user/project/out.txt"],
    });
  });

  test("Edit は Write にマージされる", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/home/user/project/src/lib.ts" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Write: ["/home/user/project/src/lib.ts"],
    });
  });

  test("Read, Write, Edit を混在して正しく分類", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } },
        { type: "tool_use", name: "Write", input: { file_path: "/a/c.ts" } },
        { type: "tool_use", name: "Edit", input: { file_path: "/a/d.ts" } },
        { type: "tool_use", name: "Read", input: { file_path: "/a/e.ts" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Read: ["/a/b.ts", "/a/e.ts"],
      Write: ["/a/c.ts", "/a/d.ts"],
    });
  });

  test("重複パスは unique にする", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ]),
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
        { type: "tool_use", name: "Read", input: { file_path: "/a/bar.ts" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Read: ["/a/bar.ts", "/a/foo.ts"],
    });
  });

  test("assistant以外のエントリは無視", () => {
    const entries = [
      mkUser("hello"),
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Read: ["/a/foo.ts"],
    });
  });

  test("tool_use でない content ブロックは無視", () => {
    const entries = [
      mkAssistant([
        { type: "text", text: "Let me read the file." },
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
        { type: "thinking", thinking: "I should read foo.ts" },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Read: ["/a/foo.ts"],
    });
  });

  test("Read/Write/Edit 以外の tool_use は無視", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Bash", input: { command: "ls" } },
        { type: "tool_use", name: "Grep", input: { pattern: "TODO" } },
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({
      Read: ["/a/foo.ts"],
    });
  });

  test("空エントリ", () => {
    const result = extractFileOps([]);
    expect(result).toEqual({});
  });

  test("message.content が無いエントリは無視", () => {
    const entries = [
      { type: "assistant", uuid: "aabb", timestamp: "2025-01-01T00:00:00Z", message: {} },
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({});
  });

  test("unique パスはソートされる（jq の unique 互換）", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/z/c.ts" } },
        { type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } },
        { type: "tool_use", name: "Read", input: { file_path: "/m/d.ts" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result.Read).toEqual(["/a/b.ts", "/m/d.ts", "/z/c.ts"]);
  });

  test("Read も Write も無い場合は空オブジェクト（jq互換）", () => {
    const entries = [
      mkAssistant([
        { type: "tool_use", name: "Bash", input: { command: "echo hi" } },
      ]),
    ];
    const result = extractFileOps(entries);
    expect(result).toEqual({});
  });
});

// --- JSONL パース ---
describe("extractFileOpsFromJsonl", () => {
  test("JSONL文字列からパースして抽出", () => {
    const lines = [
      JSON.stringify(mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ])),
      JSON.stringify(mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/a/bar.ts" } },
      ])),
    ].join("\n");
    const result = extractFileOpsFromJsonl(lines);
    expect(result).toEqual({
      Read: ["/a/foo.ts"],
      Write: ["/a/bar.ts"],
    });
  });

  test("不正JSON行はスキップ", () => {
    const lines = [
      "this is not json",
      JSON.stringify(mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ])),
      "{broken json...",
    ].join("\n");
    const result = extractFileOpsFromJsonl(lines);
    expect(result).toEqual({
      Read: ["/a/foo.ts"],
    });
  });

  test("空行はスキップ", () => {
    const lines = [
      "",
      JSON.stringify(mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/a/foo.ts" } },
      ])),
      "   ",
      "",
    ].join("\n");
    const result = extractFileOpsFromJsonl(lines);
    expect(result).toEqual({
      Read: ["/a/foo.ts"],
    });
  });
});
