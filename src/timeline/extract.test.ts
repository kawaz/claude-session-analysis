import { describe, test, expect } from "bun:test";
import { extractEvents, extractEventsWithFork } from "./extract.ts";
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
      { kind: "U", turn: 1, ref: "aabbccdd", time: "2025-01-01T00:00:00Z", desc: "hello world" },
    ]);
  });

  test("スラッシュコマンド (XML)", () => {
    const xml = '<something><command-name>commit</command-name><command-args>-m "fix"</command-args></something>';
    const entries: SessionEntry[] = [mkUser(xml)];
    const events = extractEvents(entries);
    expect(events).toEqual([
      { kind: "U", turn: 1, ref: "aabbccdd", time: "2025-01-01T00:00:00Z", desc: 'commit -m "fix"' },
    ]);
  });

  test("array content の通常テキスト", () => {
    const entries: SessionEntry[] = [
      mkUser([{ type: "text", text: "array text" }]),
    ];
    const events = extractEvents(entries);
    expect(events).toEqual([
      { kind: "U", turn: 1, ref: "aabbccdd", time: "2025-01-01T00:00:00Z", desc: "array text" },
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
      turn: 2,
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
      { kind: "T", turn: 0, ref: "bbccddee", time: "2025-01-01T00:01:00Z", desc: "Let me consider..." },
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
      { kind: "R", turn: 0, ref: "bbccddee", time: "2025-01-01T00:01:00Z", desc: "Here is my response." },
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
      turn: 1,
      ref: "ddeeff00",
      time: "2025-01-01T00:05:00Z",
      desc: "src/foo.ts abcdef12@v1",
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
    expect(fEvents[0].desc).toBe("src/bar.ts 11223344@v2");
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
      turn: 0,
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "src/main.ts",
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
      turn: 0,
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "project/out.txt no-backup-write",
    });
  });

  test("Edit tool_use (no-backup)", () => {
    const entries: SessionEntry[] = [
      mkAssistant([
        { type: "tool_use", name: "Edit", input: { file_path: "/home/user/project/src/lib.ts", old_string: "foo", new_string: "bar" } },
      ]),
    ];
    const events = extractEvents(entries);
    const fEvents = events.filter((e) => e.kind === "F");
    expect(fEvents).toHaveLength(1);
    expect(fEvents[0]).toEqual({
      kind: "F",
      turn: 0,
      ref: "bbccddee",
      time: "2025-01-01T00:01:00Z_00000",
      desc: "src/lib.ts no-backup-edit",
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
      turn: 0,
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
      turn: 0,
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
      turn: 0,
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
        { type: "tool_use", name: "Task", id: "toolu_01AbCdEfGhIjKlMnOpQrStUv", input: { description: "analyze code", prompt: "find bugs" } },
      ]),
    ];
    const events = extractEvents(entries);
    const aEvents = events.filter((e) => e.kind === "A");
    expect(aEvents).toHaveLength(1);
    expect(aEvents[0].desc).toBe("OpQrStUv analyze code: find bugs");
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

// --- fork したセッション ---
describe("extractEventsWithFork (forked session)", () => {
  // fork 用ヘルパー: forkedFrom 付き entry を作る
  const fork = (sessionId: string) => ({ forkedFrom: { sessionId } });

  test("通常セッション（forkedFrom なし）: fork=null、events は extractEvents と同一", () => {
    const entries: SessionEntry[] = [
      mkUser("hello", { uuid: "u0000001-0000-0000-0000-000000000000" }),
      mkAssistant([{ type: "text", text: "hi" }], { uuid: "a0000001-0000-0000-0000-000000000000" }),
    ];
    const result = extractEventsWithFork(entries);
    expect(result.fork).toBeNull();
    expect(result.events).toEqual(extractEvents(entries));
  });

  test("fork: fork 前のコピー entry を除外し、fork 後のみ表示。turn は 1 から振り直す", () => {
    const entries: SessionEntry[] = [
      // 親からのコピー entry 群（forkedFrom 付き）
      mkUser("親の発言1", { uuid: "c0000001-0000-0000-0000-000000000000", ...fork("parent-abc") }),
      mkAssistant([{ type: "text", text: "親の応答1" }], { uuid: "c0000002-0000-0000-0000-000000000000", ...fork("parent-abc") }),
      mkUser("親の発言2", { uuid: "c0000003-0000-0000-0000-000000000000", ...fork("parent-abc") }),
      mkAssistant([{ type: "text", text: "親の応答2" }], { uuid: "c0000004-0000-0000-0000-000000000000", ...fork("parent-abc") }),
      // fork 後最初の新規 user entry（forkedFrom 無し = forkFirstNewUuid）
      mkUser("fork後の最初の質問", { uuid: "n0000001-0000-0000-0000-000000000000" }),
      mkAssistant([{ type: "text", text: "fork後の応答" }], { uuid: "n0000002-0000-0000-0000-000000000000" }),
      mkUser("fork後2つ目", { uuid: "n0000003-0000-0000-0000-000000000000" }),
    ];
    const result = extractEventsWithFork(entries);

    // fork 前のコピー entry は除外される
    const refs = result.events.map((e) => e.ref);
    expect(refs).not.toContain("c0000001");
    expect(refs).not.toContain("c0000002");
    expect(refs).not.toContain("c0000003");
    expect(refs).not.toContain("c0000004");

    // fork 後のみが残る
    expect(result.events.map((e) => e.ref)).toEqual(["n0000001", "n0000002", "n0000003"]);

    // turn は fork 後の最初の U を 1 として振り直す
    expect(result.events.find((e) => e.ref === "n0000001")!.turn).toBe(1);
    expect(result.events.find((e) => e.ref === "n0000002")!.turn).toBe(1);
    expect(result.events.find((e) => e.ref === "n0000003")!.turn).toBe(2);
  });

  test("fork: ForkInfo の parentSessionId は forkedFrom.sessionId", () => {
    const entries: SessionEntry[] = [
      mkUser("親", { uuid: "c0000001-0000-0000-0000-000000000000", ...fork("parent-xyz") }),
      mkUser("fork後", { uuid: "n0000001-0000-0000-0000-000000000000" }),
    ];
    const result = extractEventsWithFork(entries);
    expect(result.fork).not.toBeNull();
    expect(result.fork!.parentSessionId).toBe("parent-xyz");
  });

  test("fork: marker は最後のコピー entry に対応する timeline marker（kind+ref）", () => {
    // 最後のコピー entry は assistant の text → R イベント。ref = uuid 先頭8桁。
    const entries: SessionEntry[] = [
      mkUser("親の発言", { uuid: "c0000001-0000-0000-0000-000000000000", ...fork("parent-m") }),
      mkAssistant([{ type: "text", text: "親の最後の応答" }], { uuid: "deadbeef-0000-0000-0000-000000000000", ...fork("parent-m") }),
      mkUser("fork後", { uuid: "n0000001-0000-0000-0000-000000000000" }),
    ];
    const result = extractEventsWithFork(entries);
    // 親 timeline で `..Rdeadbeef` 指定すると fork 前が見られる
    expect(result.fork!.marker).toBe("Rdeadbeef");
  });

  // 修正1/2: 実機 /fork（c1e81ed5）相当の境界。
  // 「最後のコピー user → custom-title → 自動応答 assistant → file-history-snapshot → fork後最初の user」
  // の並びで、fork 後開始を「最初の forkedFrom 無し user」に限定し turn 0 孤立イベントを排除する。
  test("fork: 境界の非 user（custom-title/自動応答assistant/file-history-snapshot）を fork 後先頭に含めず turn 0 を出さない", () => {
    const entries: SessionEntry[] = [
      // 親からのコピー entry 群（forkedFrom 付き）。最後はコピー user。
      mkAssistant([{ type: "text", text: "親の応答" }], { uuid: "c0000001-0000-0000-0000-000000000000", ...fork("parent-real") }),
      mkUser("最後のコピーuser", { uuid: "c0000002-0000-0000-0000-000000000000", ...fork("parent-real") }),
      // 境界の非 user 群（forkedFrom 無し）
      mkSystem("<command-name>/fork</command-name><command-args></command-args>", {
        uuid: "b0000001-0000-0000-0000-000000000000",
      }),
      // 自動応答 assistant（"No response requested."）— これを fork 後先頭に含めると turn 0 が出る
      mkAssistant([{ type: "text", text: "No response requested." }], {
        uuid: "b0000002-0000-0000-0000-000000000000",
      }),
      mkFileSnapshot(
        { "/home/user/project/src/x.ts": { backupFileName: "deadbeef@v1", backupTime: "2020-01-01T00:00:00Z" } },
        { messageId: "b0000003-0000-0000-0000-000000000000" },
      ),
      // fork 後最初の user（forkFirstNewUuid）
      mkUser("fork後の最初の質問", { uuid: "n0000001-0000-0000-0000-000000000000" }),
      mkAssistant([{ type: "text", text: "fork後の応答" }], { uuid: "n0000002-0000-0000-0000-000000000000" }),
    ];
    const result = extractEventsWithFork(entries);

    // turn 0 のイベントは 1 件も無い（孤立イベントを排除）
    expect(result.events.filter((e) => e.turn === 0)).toHaveLength(0);

    // 出力先頭は turn 1 の U（fork 後最初の user）
    expect(result.events[0]!.kind).toBe("U");
    expect(result.events[0]!.turn).toBe(1);
    expect(result.events[0]!.ref).toBe("n0000001");

    // 境界の非 user（system の /fork は U にならず、自動応答 assistant / file-history-snapshot）は含まれない
    const refs = result.events.map((e) => e.ref);
    expect(refs).not.toContain("b0000001");
    expect(refs).not.toContain("b0000002");
    expect(refs).not.toContain("b0000003");
  });

  test("fork: 最後のコピー entry が複数イベントを生む場合、marker はその entry 由来の最後のイベント", () => {
    // 最後のコピー entry が assistant で thinking + text の2ブロック → T と R が出る。
    // その entry 由来の timeline 上の最後のイベントの marker を採用。
    const entries: SessionEntry[] = [
      mkUser("親", { uuid: "c0000001-0000-0000-0000-000000000000", ...fork("parent-mm") }),
      mkAssistant(
        [
          { type: "thinking", thinking: "考え中" },
          { type: "text", text: "応答" },
        ],
        { uuid: "feedface-0000-0000-0000-000000000000", ...fork("parent-mm") },
      ),
      mkUser("fork後", { uuid: "n0000001-0000-0000-0000-000000000000" }),
    ];
    const result = extractEventsWithFork(entries);
    expect(result.fork!.marker).toBe("Rfeedface");
  });
});
