import { describe, test, expect } from "bun:test";
import { extractEvents } from "./extract.ts";
import type {
  SessionEntry,
  UserEntry,
  AssistantEntry,
  SystemEntry,
  FileHistorySnapshotEntry,
  TimelineEvent,
} from "./types.ts";

// --- ヘルパー ---
function mkUser(content: string | { type: string; [k: string]: unknown }[], opts?: Partial<UserEntry>): UserEntry {
  return {
    type: "user",
    uuid: "aabbccdd-1111-2222-3333-444444444444",
    timestamp: "2025-01-01T00:00:00Z",
    message: { content: content as any },
    cwd: "/home/user/project",
    ...opts,
  };
}

function mkAssistant(content: { type: string; [k: string]: unknown }[], opts?: Partial<AssistantEntry>): AssistantEntry {
  return {
    type: "assistant",
    uuid: "bbccddee-1111-2222-3333-444444444444",
    timestamp: "2025-01-01T00:01:00Z",
    message: { content: content as any },
    ...opts,
  };
}

function mkSystem(content: string, opts?: Partial<SystemEntry>): SystemEntry {
  return {
    type: "system",
    uuid: "ccddee11-1111-2222-3333-444444444444",
    timestamp: "2025-01-01T00:02:00Z",
    content,
    ...opts,
  };
}

function mkFileSnapshot(
  backups: Record<string, { backupFileName: string; backupTime: string }>,
  opts?: Partial<FileHistorySnapshotEntry>,
): FileHistorySnapshotEntry {
  return {
    type: "file-history-snapshot",
    messageId: "ddeeff00-1111-2222-3333-444444444444",
    snapshot: { trackedFileBackups: backups },
    ...opts,
  };
}

// --- U (User) ---
describe("U (User) events", () => {
  test("通常テキスト", () => {
    const entries: SessionEntry[] = [mkUser("hello world")];
    const events = extractEvents(entries);
    expect(events).toEqual([
      { kind: "U", ref: "aabbccdd", time: "2025-01-01T00:00:00Z", desc: "hello world" },
    ]);
  });

  test("スラッシュコマンド (XML)", () => {
    const xml = '<something><command-name>commit</command-name><command-args>-m "fix"</command-args></something>';
    const entries: SessionEntry[] = [mkUser(xml)];
    const events = extractEvents(entries);
    expect(events).toEqual([
      { kind: "U", ref: "aabbccdd", time: "2025-01-01T00:00:00Z", desc: 'commit -m "fix"' },
    ]);
  });

  test("array content の通常テキスト", () => {
    const entries: SessionEntry[] = [
      mkUser([{ type: "text", text: "array text" }]),
    ];
    const events = extractEvents(entries);
    expect(events).toEqual([
      { kind: "U", ref: "aabbccdd", time: "2025-01-01T00:00:00Z", desc: "array text" },
    ]);
  });

  test("system entry のスラッシュコマンド", () => {
    const xml = '<foo><command-name>review</command-name><command-args>--all</command-args></foo>';
    const entries: SessionEntry[] = [
      mkUser("initial"),  // cwd 提供用
      mkSystem(xml),
    ];
    const events = extractEvents(entries);
    const uEvents = events.filter((e) => e.kind === "U");
    expect(uEvents).toContainEqual({
      kind: "U",
      ref: "ccddee11",
      time: "2025-01-01T00:02:00Z",
      desc: "review --all",
    });
  });

  test("isMeta のエントリは除外", () => {
    const entries: SessionEntry[] = [mkUser("meta msg", { isMeta: true })];
    const events = extractEvents(entries);
    const uEvents = events.filter((e) => e.kind === "U");
    expect(uEvents).toHaveLength(0);
  });

  test("isCompactSummary のエントリはUではなくI", () => {
    const entries: SessionEntry[] = [mkUser("compact", { isCompactSummary: true })];
    const events = extractEvents(entries);
    const uEvents = events.filter((e) => e.kind === "U");
    expect(uEvents).toHaveLength(0);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
  });
});

// --- T (Think) ---
describe("T (Think) events", () => {
  test("thinkingブロック", () => {
    const entries: SessionEntry[] = [
      mkAssistant([{ type: "thinking", thinking: "Let me consider..." }]),
    ];
    const events = extractEvents(entries);
    expect(events).toEqual([
      { kind: "T", ref: "bbccddee", time: "2025-01-01T00:01:00Z", desc: "Let me consider..." },
    ]);
  });
});

// --- R (Response) ---
describe("R (Response) events", () => {
  test("textブロック", () => {
    const entries: SessionEntry[] = [
      mkAssistant([{ type: "text", text: "Here is my response." }]),
    ];
    const events = extractEvents(entries);
    expect(events).toEqual([
      { kind: "R", ref: "bbccddee", time: "2025-01-01T00:01:00Z", desc: "Here is my response." },
    ]);
  });

  test("空白のみのテキストはスキップ", () => {
    const entries: SessionEntry[] = [
      mkAssistant([{ type: "text", text: "  \n\t  " }]),
    ];
    const events = extractEvents(entries);
    const rEvents = events.filter((e) => e.kind === "R");
    expect(rEvents).toHaveLength(0);
  });
});

// --- F (File) ---
describe("F (File) events", () => {
  test("file-history-snapshot", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),  // cwd用
      mkFileSnapshot({
        "/home/user/project/src/foo.ts": {
          backupFileName: "abcdef12@v1",
          backupTime: "2025-01-01T00:05:00Z",
        },
      }),
    ];
    const events = extractEvents(entries);
    const fEvents = events.filter((e) => e.kind === "F");
    expect(fEvents).toHaveLength(1);
    expect(fEvents[0]).toEqual({
      kind: "F",
      ref: "ddeeff00",
      time: "2025-01-01T00:05:00Z",
      desc: "\u2026/src/foo.ts abcdef12@v1",
    });
  });

  test("file-history-snapshot 相対パスは session_cwd で絶対パス化", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),  // cwd=/home/user/project
      mkFileSnapshot({
        "src/bar.ts": {
          backupFileName: "11223344@v2",
          backupTime: "2025-01-01T00:06:00Z",
        },
      }),
    ];
    const events = extractEvents(entries);
    const fEvents = events.filter((e) => e.kind === "F");
    expect(fEvents).toHaveLength(1);
    // /home/user/project/src/bar.ts -> .../src/bar.ts
    expect(fEvents[0].desc).toBe("\u2026/src/bar.ts 11223344@v2");
  });

  test("Read tool_use", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Read", input: { file_path: "/home/user/project/src/main.ts" } },
      ]),
    ];
    const events = extractEvents(entries);
    const fEvents = events.filter((e) => e.kind === "F");
    expect(fEvents).toHaveLength(1);
    expect(fEvents[0]).toEqual({
      kind: "F",
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "\u2026/src/main.ts",
    });
  });

  test("Write tool_use (no-backup)", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Write", input: { file_path: "/home/user/project/out.txt" } },
      ]),
    ];
    const events = extractEvents(entries);
    const fEvents = events.filter((e) => e.kind === "F");
    expect(fEvents).toHaveLength(1);
    expect(fEvents[0]).toEqual({
      kind: "F",
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "\u2026/project/out.txt no-backup-write",
    });
  });
});

// --- B (Bash) ---
describe("B (Bash) events", () => {
  test("通常コマンド", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Bash", input: { command: "ls -la" } },
      ]),
    ];
    const events = extractEvents(entries);
    const bEvents = events.filter((e) => e.kind === "B");
    expect(bEvents).toHaveLength(1);
    expect(bEvents[0]).toEqual({
      kind: "B",
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "ls -la",
    });
  });

  test("フルパスコマンドの短縮", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Bash", input: { command: "/usr/local/bin/node script.js" } },
      ]),
    ];
    const events = extractEvents(entries);
    const bEvents = events.filter((e) => e.kind === "B");
    expect(bEvents).toHaveLength(1);
    expect(bEvents[0].desc).toBe("\u2026/bin/node script.js");
  });

  test("BashOutput も B イベント", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "BashOutput", input: { description: "check status" } },
      ]),
    ];
    const events = extractEvents(entries);
    const bEvents = events.filter((e) => e.kind === "B");
    expect(bEvents).toHaveLength(1);
    expect(bEvents[0].desc).toBe("check status");
  });
});

// --- W (Web) ---
describe("W (Web) events", () => {
  test("WebFetch", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "WebFetch", input: { url: "https://example.com" } },
      ]),
    ];
    const events = extractEvents(entries);
    const wEvents = events.filter((e) => e.kind === "W");
    expect(wEvents).toHaveLength(1);
    expect(wEvents[0]).toEqual({
      kind: "W",
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "https://example.com",
      notrunc: true,
    });
  });

  test("WebSearch", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "WebSearch", input: { query: "bun test runner" } },
      ]),
    ];
    const events = extractEvents(entries);
    const wEvents = events.filter((e) => e.kind === "W");
    expect(wEvents).toHaveLength(1);
    expect(wEvents[0]).toEqual({
      kind: "W",
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "bun test runner",
      notrunc: true,
    });
  });
});

// --- G (Grep/Glob) ---
describe("G (Grep/Glob) events", () => {
  test("Grep", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Grep", input: { pattern: "TODO" } },
      ]),
    ];
    const events = extractEvents(entries);
    const gEvents = events.filter((e) => e.kind === "G");
    expect(gEvents).toHaveLength(1);
    expect(gEvents[0].desc).toBe("Grep: TODO");
  });

  test("Glob", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Glob", input: { pattern: "**/*.ts" } },
      ]),
    ];
    const events = extractEvents(entries);
    const gEvents = events.filter((e) => e.kind === "G");
    expect(gEvents).toHaveLength(1);
    expect(gEvents[0].desc).toBe("Glob: **/*.ts");
  });
});

// --- A (Agent/Task) ---
describe("A (Agent/Task) events", () => {
  test("Task", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Task", input: { description: "analyze code", prompt: "find bugs" } },
      ]),
    ];
    const events = extractEvents(entries);
    const aEvents = events.filter((e) => e.kind === "A");
    expect(aEvents).toHaveLength(1);
    expect(aEvents[0].desc).toBe("analyze code: find bugs");
  });

  test("TaskOutput", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "TaskOutput", input: { task_id: "task-123" } },
      ]),
    ];
    const events = extractEvents(entries);
    const aEvents = events.filter((e) => e.kind === "A");
    expect(aEvents).toHaveLength(1);
    expect(aEvents[0].desc).toBe("task-123 output");
  });
});

// --- S (Skill) ---
describe("S (Skill) events", () => {
  test("Skill", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Skill", input: { skill: "commit" } },
      ]),
    ];
    const events = extractEvents(entries);
    const sEvents = events.filter((e) => e.kind === "S");
    expect(sEvents).toHaveLength(1);
    expect(sEvents[0].desc).toBe("commit");
  });
});

// --- Q (Question) ---
describe("Q (Question) events", () => {
  test("AskUserQuestion", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        {
          type: "tool_use",
          name: "AskUserQuestion",
          input: { questions: [{ question: "Which option?" }] },
        },
      ]),
    ];
    const events = extractEvents(entries);
    const qEvents = events.filter((e) => e.kind === "Q");
    expect(qEvents).toHaveLength(1);
    expect(qEvents[0].desc).toBe("Which option?");
  });
});

// --- D (toDo) ---
describe("D (toDo) events", () => {
  test("TodoWrite", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        {
          type: "tool_use",
          name: "TodoWrite",
          input: { todos: [{ text: "a" }, { text: "b" }, { text: "c" }] },
        },
      ]),
    ];
    const events = extractEvents(entries);
    const dEvents = events.filter((e) => e.kind === "D");
    expect(dEvents).toHaveLength(1);
    expect(dEvents[0].desc).toBe("Todo: 3 items");
  });
});

// --- I (Info) ---
describe("I (Info) events", () => {
  test("auto-compact", () => {
    const entries: SessionEntry[] = [
      mkUser("summary text", { isCompactSummary: true }),
    ];
    const events = extractEvents(entries);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
    expect(iEvents[0].desc).toBe("[auto-compact]");
  });

  test("task-notification (文字列content)", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),  // cwd用
      mkUser('<task-notification><summary>Task done</summary></task-notification>', {
        uuid: "11223344-aaaa-bbbb-cccc-dddddddddddd",
        timestamp: "2025-01-01T00:10:00Z",
      }),
    ];
    const events = extractEvents(entries);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
    expect(iEvents[0].desc).toBe("[task-notification] Task done");
  });

  test("teammate-message (文字列content)", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),
      mkUser('<teammate-message teammate_id="agent-42">hello</teammate-message>', {
        uuid: "22334455-aaaa-bbbb-cccc-dddddddddddd",
        timestamp: "2025-01-01T00:11:00Z",
      }),
    ];
    const events = extractEvents(entries);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
    expect(iEvents[0].desc).toBe("[teammate-message] agent-42");
  });

  test("Request interrupted (文字列content)", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),
      mkUser("[Request interrupted by user]", {
        uuid: "33445566-aaaa-bbbb-cccc-dddddddddddd",
        timestamp: "2025-01-01T00:12:00Z",
      }),
    ];
    const events = extractEvents(entries);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
    expect(iEvents[0].desc).toBe("[Request interrupted by user]");
  });

  test("Request interrupted (配列content)", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),
      mkUser(
        [{ type: "text", text: "[Request interrupted by user]" }],
        {
          uuid: "44556677-aaaa-bbbb-cccc-dddddddddddd",
          timestamp: "2025-01-01T00:13:00Z",
        },
      ),
    ];
    const events = extractEvents(entries);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
    expect(iEvents[0].desc).toBe("[Request interrupted by user]");
  });

  test("task-notification (配列content)", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),
      mkUser(
        [{ type: "text", text: '<task-notification><summary>Sub done</summary></task-notification>' }],
        {
          uuid: "55667788-aaaa-bbbb-cccc-dddddddddddd",
          timestamp: "2025-01-01T00:14:00Z",
        },
      ),
    ];
    const events = extractEvents(entries);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
    expect(iEvents[0].desc).toBe("[task-notification] Sub done");
  });

  test("teammate-message (配列content)", () => {
    const entries: SessionEntry[] = [
      mkUser("init"),
      mkUser(
        [{ type: "text", text: '<teammate-message teammate_id="worker-7">hi</teammate-message>' }],
        {
          uuid: "66778899-aaaa-bbbb-cccc-dddddddddddd",
          timestamp: "2025-01-01T00:15:00Z",
        },
      ),
    ];
    const events = extractEvents(entries);
    const iEvents = events.filter((e) => e.kind === "I");
    expect(iEvents).toHaveLength(1);
    expect(iEvents[0].desc).toBe("[teammate-message] worker-7");
  });
});

// --- 除外条件 ---
describe("除外条件", () => {
  test("task-notification文字列のUserメッセージはUではなくIに分類", () => {
    const entries: SessionEntry[] = [
      mkUser('<task-notification><summary>done</summary></task-notification>'),
    ];
    const events = extractEvents(entries);
    const uEvents = events.filter((e) => e.kind === "U");
    const iEvents = events.filter((e) => e.kind === "I");
    expect(uEvents).toHaveLength(0);
    expect(iEvents).toHaveLength(1);
  });

  test("[Request interrupted で始まる文字列はUではなくI", () => {
    const entries: SessionEntry[] = [
      mkUser("[Request interrupted by user]"),
    ];
    const events = extractEvents(entries);
    const uEvents = events.filter((e) => e.kind === "U");
    const iEvents = events.filter((e) => e.kind === "I");
    expect(uEvents).toHaveLength(0);
    expect(iEvents).toHaveLength(1);
  });

  test("<teammate-message で始まる文字列はUではなくI", () => {
    const entries: SessionEntry[] = [
      mkUser('<teammate-message teammate_id="x">msg</teammate-message>'),
    ];
    const events = extractEvents(entries);
    const uEvents = events.filter((e) => e.kind === "U");
    const iEvents = events.filter((e) => e.kind === "I");
    expect(uEvents).toHaveLength(0);
    expect(iEvents).toHaveLength(1);
  });
});
