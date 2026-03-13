import { describe, test, expect } from "bun:test";
import { cleanTime, localTime, colorize, formatEvent, formatEvents, mdFrontMatter, type FormatEventsOpts } from "./format.ts";
import type { TimelineEvent } from "./types.ts";

describe("cleanTime", () => {
  test("サフィックスあり", () => {
    expect(cleanTime("2024-01-01T10:00:00_00003")).toBe("2024-01-01T10:00:00");
  });
  test("サフィックスなし", () => {
    expect(cleanTime("2024-01-01T10:00:00")).toBe("2024-01-01T10:00:00");
  });
});

describe("localTime", () => {
  test("UTC時刻をローカルタイムゾーン付きISO8601に変換", () => {
    const result = localTime("2024-01-01T10:00:00Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
  test("サフィックス付きも処理", () => {
    const result = localTime("2024-01-01T10:00:00_00003");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
  test("変換結果が同じ瞬間を表す", () => {
    const input = "2024-06-15T12:30:45Z";
    const result = localTime(input);
    expect(new Date(result).getTime()).toBe(new Date(input).getTime());
  });
});

describe("colorize", () => {
  test("Uイベント → 緑", () => {
    const result = colorize("1 Uabc12345 hello");
    expect(result).toContain("\x1b[32m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Tイベント → italic青", () => {
    const result = colorize("1 Tabc12345 thinking");
    expect(result).toContain("\x1b[3;34m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Rイベント → 青", () => {
    const result = colorize("1 Rabc12345 response");
    expect(result).toContain("\x1b[34m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Qイベント → 青", () => {
    const result = colorize("1 Qabc12345 response");
    expect(result).toContain("\x1b[34m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Bイベント → dim", () => {
    const result = colorize("1 Babc12345 bash cmd");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Fイベント → dim", () => {
    const result = colorize("1 Fabc12345 lib.ts");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Wイベント → dim", () => {
    const result = colorize("1 Wabc12345 fetch");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Sイベント → dim", () => {
    const result = colorize("1 Sabc12345 skill");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Gイベント → dim", () => {
    const result = colorize("1 Gabc12345 grep");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Aイベント → dim", () => {
    const result = colorize("1 Aabc12345 agent");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Dイベント → dim", () => {
    const result = colorize("1 Dabc12345 done");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Iイベント → dim", () => {
    const result = colorize("1 Iabc12345 info");
    expect(result).toContain("\x1b[2m");
    expect(result).toEndWith("\x1b[0m");
  });
  test("マーカーなし → そのまま", () => {
    const result = colorize("plain text without marker");
    expect(result).toBe("plain text without marker");
  });
  test("タイムスタンプ付きのマーカー", () => {
    const result = colorize("2024-01-01T10:00:00 1 Rabc12345 response");
    expect(result).toContain("\x1b[34m");
    expect(result).toContain("2024-01-01T10:00:00 ");
    expect(result).toContain("1 Rabc12345");
    expect(result).toContain(" response");
  });

  // emoji独立制御テスト（colorizeはemojiを付与しない）
  test("colors=true, emoji=false → ANSIあり、emojiなし", () => {
    const result = colorize("1 Rabc12345 response", { colors: true, emoji: false });
    expect(result).toContain("\x1b[34m");
    expect(result).not.toContain("🤖");
    expect(result).toEndWith("\x1b[0m");
  });
  test("colors=false, emoji=true → そのまま返す（colorizeはemojiを付与しない）", () => {
    const result = colorize("1 Rabc12345 response", { colors: false, emoji: true });
    expect(result).toBe("1 Rabc12345 response");
  });
  test("colors=true, emoji=true → ANSIあり、emojiなし", () => {
    const result = colorize("1 Rabc12345 response", { colors: true, emoji: true });
    expect(result).toContain("\x1b[34m");
    expect(result).not.toContain("🤖");
    expect(result).toEndWith("\x1b[0m");
  });
  test("colors=false, emoji=false → そのまま返す", () => {
    const result = colorize("1 Rabc12345 response", { colors: false, emoji: false });
    expect(result).toBe("1 Rabc12345 response");
  });
  test("引数なし(後方互換) → colors=true,emoji=trueと同等（ANSIのみ、emojiなし）", () => {
    const withOpts = colorize("1 Rabc12345 response", { colors: true, emoji: true });
    const withoutOpts = colorize("1 Rabc12345 response");
    expect(withOpts).toBe(withoutOpts);
  });
});

describe("formatEvent", () => {
  const baseEvent: TimelineEvent = {
    kind: "R",
    turn: 1,
    ref: "abc12345",
    time: "2024-01-01T10:00:00_00003",
    desc: "response text",
  };

  test("jsonlモード", () => {
    const result = formatEvent(baseEvent, { jsonlMode: "redact", width: 55, timestamps: false });
    expect(result).toBe("1 Rabc12345");
  });

  test("通常モード(timestamps=false)", () => {
    const result = formatEvent(baseEvent, { jsonlMode: "none", width: 55, timestamps: false });
    expect(result).toBe("1 Rabc12345 response text");
  });

  test("timestampsモード", () => {
    const result = formatEvent(baseEvent, { jsonlMode: "none", width: 55, timestamps: true });
    expect(result).toBe("2024-01-01T10:00:00 1 Rabc12345 response text");
  });

  test("notruncフラグ", () => {
    const longDesc = "a".repeat(100);
    const event: TimelineEvent = { ...baseEvent, desc: longDesc, notrunc: true };
    const result = formatEvent(event, { jsonlMode: "none", width: 55, timestamps: false });
    expect(result).toBe(`1 Rabc12345 ${"a".repeat(100)}`);
  });

  test("truncateされる", () => {
    const longDesc = "a".repeat(100);
    const event: TimelineEvent = { ...baseEvent, desc: longDesc };
    const result = formatEvent(event, { jsonlMode: "none", width: 55, timestamps: false });
    expect(result.length).toBeLessThan(11 + 1 + 100);
    expect(result).toContain("[+");
  });

  test("desc内の改行は空白に置換", () => {
    const event: TimelineEvent = { ...baseEvent, desc: "line1\nline2\nline3" };
    const result = formatEvent(event, { jsonlMode: "none", width: 55, timestamps: false });
    expect(result).toBe("1 Rabc12345 line1 line2 line3");
  });

  test("notrunc時は改行を除去しない", () => {
    const event: TimelineEvent = { kind: "W", turn: 1, ref: "abc12345", time: "2024-01-01T00:00:00", desc: "line1\nline2", notrunc: true };
    const result = formatEvent(event, { jsonlMode: "none", width: 55, timestamps: false });
    expect(result).toContain("line1\nline2");
  });
});

describe("formatEvents", () => {
  const events: TimelineEvent[] = [
    { kind: "U", turn: 1, ref: "abc12345", time: "2024-01-01T10:00:00_00001", desc: "user msg" },
    { kind: "R", turn: 1, ref: "def67890", time: "2024-01-01T10:00:01_00002", desc: "response" },
  ];

  const defaultOpts: FormatEventsOpts = { jsonlMode: "none", width: 55, timestamps: false, colors: false, emoji: false, mdMode: "none" };

  test("カラーなし", () => {
    const result = formatEvents(events, { ...defaultOpts });
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("1 Uabc12345 user msg");
    expect(lines[1]).toBe("1 Rdef67890 response");
  });

  test("カラーあり", () => {
    const result = formatEvents(events, { ...defaultOpts, colors: true, emoji: true });
    expect(result).toContain("\x1b[32m");
    expect(result).toContain("\x1b[34m");
    expect(result).toContain("\x1b[0m");
    expect(result).toContain("👤");
    expect(result).toContain("🤖");
  });

  test("colors=true, emoji=false → ANSIカラーあり、絵文字なし", () => {
    const result = formatEvents(events, { ...defaultOpts, colors: true, emoji: false });
    expect(result).toContain("\x1b[32m");
    expect(result).not.toContain("👤");
    expect(result).not.toContain("🤖");
  });

  test("colors=false, emoji=true → ANSIなし、絵文字あり（formatEventが付与）", () => {
    const result = formatEvents(events, { ...defaultOpts, colors: false, emoji: true });
    expect(result).not.toContain("\x1b[");
    expect(result).toContain("👤");
    expect(result).toContain("🤖");
  });

  test("mdMode=source: QTRUはマーカー行+本文展開", () => {
    const mdEvents: TimelineEvent[] = [
      { kind: "U", turn: 1, ref: "abc12345", time: "2024-01-01T10:00:00_00001", desc: "hello\nworld" },
      { kind: "T", turn: 1, ref: "bbb12345", time: "2024-01-01T10:00:01_00002", desc: "thinking\nabout it" },
      { kind: "R", turn: 1, ref: "ccc12345", time: "2024-01-01T10:00:02_00003", desc: "response\ntext" },
      { kind: "F", turn: 1, ref: "ddd12345", time: "2024-01-01T10:00:03_00004", desc: "src/lib.ts hash@v1" },
      { kind: "B", turn: 1, ref: "eee12345", time: "2024-01-01T10:00:04_00005", desc: "git status" },
      { kind: "Q", turn: 1, ref: "fff12345", time: "2024-01-01T10:00:05_00006", desc: "question\nfor user" },
    ];
    const result = formatEvents(mdEvents, {
      ...defaultOpts,
      timestamps: true,
      mdMode: "source",
    });
    const lines = result.split("\n");
    const lt = (t: string) => localTime(t);
    let i = 0;
    expect(lines[i++]).toBe(`${lt("2024-01-01T10:00:00")} 1 Uabc12345`);
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("hello");
    expect(lines[i++]).toBe("world");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("---");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe(`${lt("2024-01-01T10:00:01")} 1 Tbbb12345`);
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("thinking");
    expect(lines[i++]).toBe("about it");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("---");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe(`${lt("2024-01-01T10:00:02")} 1 Rccc12345`);
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("response");
    expect(lines[i++]).toBe("text");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe(`${lt("2024-01-01T10:00:03")} 1 Fddd12345 src/lib.ts hash@v1`);
    expect(lines[i++]).toBe(`${lt("2024-01-01T10:00:04")} 1 Beee12345 git status`);
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("---");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe(`${lt("2024-01-01T10:00:05")} 1 Qfff12345`);
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("question");
    expect(lines[i++]).toBe("for user");
    expect(lines[i++]).toBe("");
  });

  test("mdMode=source: widthは無視される（全文表示）", () => {
    const longDesc = "a".repeat(200);
    const mdEvents: TimelineEvent[] = [
      { kind: "R", turn: 1, ref: "abc12345", time: "2024-01-01T10:00:00_00001", desc: longDesc },
    ];
    const result = formatEvents(mdEvents, {
      ...defaultOpts,
      width: 10,
      timestamps: true,
      mdMode: "source",
    });
    expect(result).toContain(longDesc);
  });

  test("mdMode=source: 非QTRUイベント間に余計な改行が入らない", () => {
    const mdEvents: TimelineEvent[] = [
      { kind: "F", turn: 1, ref: "aaa12345", time: "2024-01-01T10:00:00_00001", desc: "file1.ts" },
      { kind: "B", turn: 1, ref: "bbb12345", time: "2024-01-01T10:00:01_00002", desc: "cmd1" },
      { kind: "G", turn: 1, ref: "ccc12345", time: "2024-01-01T10:00:02_00003", desc: "grep1" },
    ];
    const result = formatEvents(mdEvents, {
      ...defaultOpts,
      timestamps: true,
      mdMode: "source",
    });
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2} 1 Faaa12345/);
  });

  test("mdMode=none: 通常動作", () => {
    const result = formatEvents(events, { ...defaultOpts, mdMode: "none" });
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("1 Uabc12345 user msg");
    expect(lines[1]).toBe("1 Rdef67890 response");
  });
});

describe("mdFrontMatter", () => {
  test("command, command_computed, command_help, nowを含むYAML front matterを生成", () => {
    const result = mdFrontMatter(
      "timeline abc --md",
      "timeline abc-full-id U1 abc..R1 def -t UTRFWBGASQDI --width 0 --color none --md source --jsonl none",
      "timeline <SESSION_ID ..> [--width <55>] [--help]",
      "2026-02-27T01:23:45.678+0900",
    );
    const lines = result.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines[1]).toBe("command: timeline abc --md");
    expect(lines[2]).toMatch(/^command_computed:/);
    expect(lines[3]).toBe("command_help: timeline <SESSION_ID ..> [--width <55>] [--help]");
    expect(lines[4]).toBe("now: 2026-02-27T01:23:45.678+0900");
    expect(lines[5]).toBe("---");
    expect(lines[6]).toBe("");
  });

  test("末尾に空行を含む（本文との区切り）", () => {
    const result = mdFrontMatter("cmd", "cmd-computed", "help", "2026-01-01T00:00:00+0900");
    expect(result).toEndWith("---\n\n");
  });
});
