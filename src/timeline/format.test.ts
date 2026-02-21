import { describe, test, expect } from "bun:test";
import { cleanTime, colorize, formatEvent, formatEvents } from "./format.ts";
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

  test("カラーなし", () => {
    const result = formatEvents(events, { rawMode: 0, width: 55, timestamps: false, colors: false });
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Uabc12345 user msg");
    expect(lines[1]).toBe("Rdef67890 response");
  });

  test("カラーあり", () => {
    const result = formatEvents(events, { rawMode: 0, width: 55, timestamps: false, colors: true });
    expect(result).toContain("\x1b[32m"); // U = green
    expect(result).toContain("👤");
    expect(result).toContain("\x1b[34m"); // R = blue
    expect(result).toContain("🤖");
    expect(result).toContain("\x1b[0m");
  });
});
