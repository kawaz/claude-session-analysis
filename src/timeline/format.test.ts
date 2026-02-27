import { describe, test, expect } from "bun:test";
import { cleanTime, colorize, formatEvent, formatEvents, mdFrontMatter, type FormatEventsOpts } from "./format.ts";
import type { TimelineEvent } from "./types.ts";

describe("cleanTime", () => {
  test("サフィックスあり", () => {
    expect(cleanTime("2024-01-01T10:00:00_00003")).toBe("2024-01-01T10:00:00");
  });
  test("サフィックスなし", () => {
    expect(cleanTime("2024-01-01T10:00:00")).toBe("2024-01-01T10:00:00");
  });
});

describe("colorize", () => {
  test("Uイベント → 緑 + 👤 + 空行", () => {
    const result = colorize("Uabc12345 hello");
    expect(result).toContain("\x1b[32m");
    expect(result).toContain("👤");
    // \n\n は ANSI コードの後に来る
    expect(result).toMatch(/\x1b\[32m\n\n👤/);
    expect(result).toEndWith("\x1b[0m");
  });
  test("Tイベント → italic青 + 🧠", () => {
    const result = colorize("Tabc12345 thinking");
    expect(result).toContain("\x1b[3;34m");
    expect(result).toContain("🧠");
    expect(result).not.toStartWith("\n\n");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Rイベント → 青 + 🤖", () => {
    const result = colorize("Rabc12345 response");
    expect(result).toContain("\x1b[34m");
    expect(result).toContain("🤖");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Qイベント → 青 + 🤖", () => {
    const result = colorize("Qabc12345 response");
    expect(result).toContain("\x1b[34m");
    expect(result).toContain("🤖");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Bイベント → dim + ▶️", () => {
    const result = colorize("Babc12345 bash cmd");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("▶️");
    expect(result).toEndWith("\x1b[0m");
  });
  test("Fイベント(read) → 👀", () => {
    const result = colorize("Fabc12345 lib.ts");
    expect(result).toContain("👀");
  });
  test("Fイベント(write) → 📝", () => {
    const result = colorize("Fabc12345 lib.ts no-backup-write");
    expect(result).toContain("📝");
  });
  test("Fイベント(@v) → 📝", () => {
    const result = colorize("Fabc12345 lib.ts abc12345@v1");
    expect(result).toContain("📝");
  });
  test("Wイベント → dim + 🛜", () => {
    const result = colorize("Wabc12345 fetch");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("🛜");
  });
  test("Sイベント → dim + ⚡️", () => {
    const result = colorize("Sabc12345 skill");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("⚡️");
  });
  test("Gイベント → dim + 🔍", () => {
    const result = colorize("Gabc12345 grep");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("🔍");
  });
  test("Aイベント → dim + 👻", () => {
    const result = colorize("Aabc12345 agent");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("👻");
  });
  test("Dイベント → dim + ✅", () => {
    const result = colorize("Dabc12345 done");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("✅");
  });
  test("Iイベント → dim + ℹ️", () => {
    const result = colorize("Iabc12345 info");
    expect(result).toContain("\x1b[2m");
    expect(result).toContain("ℹ️");
  });
  test("マーカーなし → そのまま", () => {
    const result = colorize("plain text without marker");
    expect(result).toBe("plain text without marker");
  });
  test("タイムスタンプ付きのマーカー", () => {
    const result = colorize("2024-01-01T10:00:00 Rabc12345 response");
    expect(result).toContain("\x1b[34m");
    expect(result).toContain("🤖");
    expect(result).toContain("2024-01-01T10:00:00 ");
    expect(result).toContain("Rabc12345");
    expect(result).toContain(" response");
  });

  // emoji独立制御テスト
  test("emoji=false → 絵文字なし、ANSIあり", () => {
    const result = colorize("Rabc12345 response", { colors: true, emoji: false });
    expect(result).toContain("\x1b[34m");
    expect(result).not.toContain("🤖");
    expect(result).toEndWith("\x1b[0m");
  });
  test("emoji=true, colors=false → 絵文字あり、ANSIなし", () => {
    const result = colorize("Rabc12345 response", { colors: false, emoji: true });
    expect(result).not.toContain("\x1b[");
    expect(result).toContain("🤖");
  });
  test("emoji=true, colors=true → 両方あり", () => {
    const result = colorize("Rabc12345 response", { colors: true, emoji: true });
    expect(result).toContain("\x1b[34m");
    expect(result).toContain("🤖");
    expect(result).toEndWith("\x1b[0m");
  });
  test("emoji=false, colors=false → どちらもなし（そのまま返す）", () => {
    const result = colorize("Rabc12345 response", { colors: false, emoji: false });
    expect(result).toBe("Rabc12345 response");
  });
  test("Uイベント emoji=false → 空行はつくがemoji無し", () => {
    const result = colorize("Uabc12345 hello", { colors: true, emoji: false });
    expect(result).toContain("\x1b[32m");
    expect(result).toContain("\n\n");
    expect(result).not.toContain("👤");
  });
  test("Uイベント emoji=true, colors=false → 空行+emoji、ANSIなし", () => {
    const result = colorize("Uabc12345 hello", { colors: false, emoji: true });
    expect(result).not.toContain("\x1b[");
    expect(result).toContain("👤");
    expect(result).toContain("\n\n");
  });
  test("Fイベント emoji=false → F条件分岐の絵文字も出ない", () => {
    const result = colorize("Fabc12345 lib.ts abc12345@v1", { colors: true, emoji: false });
    expect(result).toContain("\x1b[2m");
    expect(result).not.toContain("📝");
    expect(result).not.toContain("👀");
  });
  test("引数なし(後方互換) → colors=true,emoji=true と同等", () => {
    const withOpts = colorize("Rabc12345 response", { colors: true, emoji: true });
    const withoutOpts = colorize("Rabc12345 response");
    expect(withOpts).toBe(withoutOpts);
  });
});

describe("formatEvent", () => {
  const baseEvent: TimelineEvent = {
    kind: "R",
    ref: "abc12345",
    time: "2024-01-01T10:00:00_00003",
    desc: "response text",
  };

  test("rawモード", () => {
    const result = formatEvent(baseEvent, { rawMode: 1, width: 55, timestamps: false });
    expect(result).toBe("Rabc12345");
  });

  test("通常モード(timestamps=false)", () => {
    const result = formatEvent(baseEvent, { rawMode: 0, width: 55, timestamps: false });
    expect(result).toBe("Rabc12345 response text");
  });

  test("timestampsモード", () => {
    const result = formatEvent(baseEvent, { rawMode: 0, width: 55, timestamps: true });
    expect(result).toBe("2024-01-01T10:00:00 Rabc12345 response text");
  });

  test("notruncフラグ", () => {
    const longDesc = "a".repeat(100);
    const event: TimelineEvent = { ...baseEvent, desc: longDesc, notrunc: true };
    const result = formatEvent(event, { rawMode: 0, width: 55, timestamps: false });
    expect(result).toBe(`Rabc12345 ${"a".repeat(100)}`);
  });

  test("truncateされる", () => {
    const longDesc = "a".repeat(100);
    const event: TimelineEvent = { ...baseEvent, desc: longDesc };
    const result = formatEvent(event, { rawMode: 0, width: 55, timestamps: false });
    expect(result.length).toBeLessThan(10 + 1 + 100); // marker + space + full desc
    expect(result).toContain("[+");
  });

  test("desc内の改行は空白に置換", () => {
    const event: TimelineEvent = { ...baseEvent, desc: "line1\nline2\nline3" };
    const result = formatEvent(event, { rawMode: 0, width: 55, timestamps: false });
    expect(result).toBe("Rabc12345 line1 line2 line3");
  });

  test("notrunc時は改行を除去しない", () => {
    const event: TimelineEvent = { kind: "W", ref: "abc12345", time: "2024-01-01T00:00:00", desc: "line1\nline2", notrunc: true };
    const result = formatEvent(event, { rawMode: 0, width: 55, timestamps: false });
    expect(result).toContain("line1\nline2");
  });
});

describe("formatEvents", () => {
  const events: TimelineEvent[] = [
    { kind: "U", ref: "abc12345", time: "2024-01-01T10:00:00_00001", desc: "user msg" },
    { kind: "R", ref: "def67890", time: "2024-01-01T10:00:01_00002", desc: "response" },
  ];

  const defaultOpts: FormatEventsOpts = { rawMode: 0, width: 55, timestamps: false, colors: false, emoji: false, mdMode: "off" };

  test("カラーなし", () => {
    const result = formatEvents(events, { ...defaultOpts });
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Uabc12345 user msg");
    expect(lines[1]).toBe("Rdef67890 response");
  });

  test("カラーあり", () => {
    const result = formatEvents(events, { ...defaultOpts, colors: true, emoji: true });
    expect(result).toContain("\x1b[32m"); // U = green
    expect(result).toContain("👤");
    expect(result).toContain("\x1b[34m"); // R = blue
    expect(result).toContain("🤖");
    expect(result).toContain("\x1b[0m");
  });

  // emoji独立制御テスト
  test("colors=true, emoji=false → ANSIカラーあり、絵文字なし", () => {
    const result = formatEvents(events, { ...defaultOpts, colors: true, emoji: false });
    expect(result).toContain("\x1b[32m");
    expect(result).not.toContain("👤");
    expect(result).not.toContain("🤖");
  });

  test("colors=false, emoji=true → ANSIなし、絵文字あり", () => {
    const result = formatEvents(events, { ...defaultOpts, colors: false, emoji: true });
    expect(result).not.toContain("\x1b[");
    expect(result).toContain("👤");
    expect(result).toContain("🤖");
  });

  // mdMode テスト
  test("mdMode=source: QTRUはマーカー行+本文展開、それ以外は1行。2番目以降のQTRUには---区切り", () => {
    const mdEvents: TimelineEvent[] = [
      { kind: "U", ref: "abc12345", time: "2024-01-01T10:00:00_00001", desc: "hello\nworld" },
      { kind: "T", ref: "bbb12345", time: "2024-01-01T10:00:01_00002", desc: "thinking\nabout it" },
      { kind: "R", ref: "ccc12345", time: "2024-01-01T10:00:02_00003", desc: "response\ntext" },
      { kind: "F", ref: "ddd12345", time: "2024-01-01T10:00:03_00004", desc: "src/lib.ts hash@v1" },
      { kind: "B", ref: "eee12345", time: "2024-01-01T10:00:04_00005", desc: "git status" },
      { kind: "Q", ref: "fff12345", time: "2024-01-01T10:00:05_00006", desc: "question\nfor user" },
    ];
    const result = formatEvents(mdEvents, {
      ...defaultOpts,
      timestamps: true,
      mdMode: "source",
    });
    const lines = result.split("\n");
    // U(最初): marker行 + 空行 + desc (2行) + 空行 = 5行
    // T(2番目以降): --- + 空行 + marker行 + 空行 + desc (2行) + 空行 = 7行
    // R(2番目以降): --- + 空行 + marker行 + 空行 + desc (2行) + 空行 = 7行
    // F: 1行
    // B: 1行
    // Q(2番目以降): --- + 空行 + marker行 + 空行 + desc (2行) + 空行 = 7行
    let i = 0;
    // U marker line (最初のQTRUなので---なし)
    expect(lines[i++]).toBe("2024-01-01T10:00:00 Uabc12345");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("hello");
    expect(lines[i++]).toBe("world");
    expect(lines[i++]).toBe("");
    // T marker line (2番目以降なので---あり)
    expect(lines[i++]).toBe("---");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("2024-01-01T10:00:01 Tbbb12345");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("thinking");
    expect(lines[i++]).toBe("about it");
    expect(lines[i++]).toBe("");
    // R marker line (---あり)
    expect(lines[i++]).toBe("---");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("2024-01-01T10:00:02 Rccc12345");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("response");
    expect(lines[i++]).toBe("text");
    expect(lines[i++]).toBe("");
    // F: 1行
    expect(lines[i++]).toBe("2024-01-01T10:00:03 Fddd12345 src/lib.ts hash@v1");
    // B: 1行
    expect(lines[i++]).toBe("2024-01-01T10:00:04 Beee12345 git status");
    // Q marker line (---あり)
    expect(lines[i++]).toBe("---");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("2024-01-01T10:00:05 Qfff12345");
    expect(lines[i++]).toBe("");
    expect(lines[i++]).toBe("question");
    expect(lines[i++]).toBe("for user");
    expect(lines[i++]).toBe("");
  });

  test("mdMode=source: widthは無視される（全文表示）", () => {
    const longDesc = "a".repeat(200);
    const mdEvents: TimelineEvent[] = [
      { kind: "R", ref: "abc12345", time: "2024-01-01T10:00:00_00001", desc: longDesc },
    ];
    const result = formatEvents(mdEvents, {
      ...defaultOpts,
      width: 10,
      timestamps: true,
      mdMode: "source",
    });
    // desc全文が含まれること（truncateされていない）
    expect(result).toContain(longDesc);
  });

  test("mdMode=source: 非QTRUイベント間に余計な改行が入らない", () => {
    const mdEvents: TimelineEvent[] = [
      { kind: "F", ref: "aaa12345", time: "2024-01-01T10:00:00_00001", desc: "file1.ts" },
      { kind: "B", ref: "bbb12345", time: "2024-01-01T10:00:01_00002", desc: "cmd1" },
      { kind: "G", ref: "ccc12345", time: "2024-01-01T10:00:02_00003", desc: "grep1" },
    ];
    const result = formatEvents(mdEvents, {
      ...defaultOpts,
      timestamps: true,
      mdMode: "source",
    });
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
  });

  test("mdMode=off: 既存と同じ動作（後方互換）", () => {
    const result = formatEvents(events, { ...defaultOpts, mdMode: "off" });
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Uabc12345 user msg");
    expect(lines[1]).toBe("Rdef67890 response");
  });
});

describe("mdFrontMatter", () => {
  test("コマンドとnowを含むYAML front matterを生成", () => {
    const result = mdFrontMatter("claude-session-analysis timeline abc --md-source", "2026-02-27T01:23:45.678Z");
    const lines = result.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines[1]).toBe("command: claude-session-analysis timeline abc --md-source");
    expect(lines[2]).toBe("now: 2026-02-27T01:23:45.678Z");
    expect(lines[3]).toBe("---");
    expect(lines[4]).toBe("");
  });

  test("末尾に空行を含む（本文との区切り）", () => {
    const result = mdFrontMatter("cmd", "2026-01-01T00:00:00Z");
    expect(result).toEndWith("---\n\n");
  });
});
