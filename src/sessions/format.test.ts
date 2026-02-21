import { describe, expect, test } from "bun:test";
import {
  formatHumanSize,
  formatAgo,
  formatSessionLine,
  formatSessionsOutput,
  type FormatOptions,
} from "./format.ts";
import type { SessionInfo } from "./search.ts";

describe("formatHumanSize", () => {
  test("KB range: 1500 -> 1.5K", () => {
    expect(formatHumanSize(1500)).toBe("1.5K");
  });
  test("KB range: 10000 -> 10K (integer)", () => {
    // 10e3 = 10.0 → >=10 → %3d → " 10K"
    expect(formatHumanSize(10000)).toBe(" 10K");
  });
  test("KB range: 150000 -> 150K", () => {
    expect(formatHumanSize(150000)).toBe("150K");
  });
  test("MB range: 1500000 -> 1.5M", () => {
    expect(formatHumanSize(1500000)).toBe("1.5M");
  });
  test("MB range: 15000000 -> 15M", () => {
    // 15e6 → 15.0 → >=10 → " 15M"
    expect(formatHumanSize(15000000)).toBe(" 15M");
  });
  test("MB range: 150000000 -> 150M", () => {
    expect(formatHumanSize(150000000)).toBe("150M");
  });
  test("GB range: 1500000000 -> 1.5G", () => {
    expect(formatHumanSize(1500000000)).toBe("1.5G");
  });
  test("small: 500 -> 0.5K", () => {
    // 500/1e3 = 0.5 → <10 → "0.5K"
    expect(formatHumanSize(500)).toBe("0.5K");
  });
  test("zero: 0 -> 0.0K", () => {
    // 0/1e3 = 0.0 → <10 → "0.0K"
    expect(formatHumanSize(0)).toBe("0.0K");
  });
});

describe("formatAgo", () => {
  test("seconds: 30s ago", () => {
    expect(formatAgo(30)).toBe("30s");
  });
  test("seconds: 5s ago", () => {
    expect(formatAgo(5)).toBe(" 5s");
  });
  test("minutes: 300s -> 5m", () => {
    expect(formatAgo(300)).toBe(" 5m");
  });
  test("hours: 7200s -> 2h", () => {
    expect(formatAgo(7200)).toBe(" 2h");
  });
  test("days: 172800s -> 2d", () => {
    expect(formatAgo(172800)).toBe(" 2d");
  });
  test("just under a minute: 59s", () => {
    expect(formatAgo(59)).toBe("59s");
  });
  test("exactly 60s -> 1m", () => {
    expect(formatAgo(60)).toBe(" 1m");
  });
  test("exactly 3600s -> 1h", () => {
    expect(formatAgo(3600)).toBe(" 1h");
  });
  test("exactly 86400s -> 1d", () => {
    expect(formatAgo(86400)).toBe(" 1d");
  });
});

describe("formatSessionLine", () => {
  const base: SessionInfo = {
    file: "/home/.claude/projects/kawaz/myproject/abc12345-6789-0123-4567-890123456789.jsonl",
    mtime: 0, // will be overridden
    size: 15000,
    sessionId: "abc12345-6789-0123-4567-890123456789",
    cwd: "/home/user/some/project",
  };

  test("default: short sessionId (8 chars) and short cwd (last 2 segments)", () => {
    const now = Math.floor(Date.now() / 1000);
    const session = { ...base, mtime: now - 300 }; // 5min ago
    const line = formatSessionLine(session, { full: false, now });
    // " 5m\t 15K\tabc12345\tsome/project"
    expect(line).toContain("abc12345");
    expect(line).not.toContain("abc12345-6789");
    expect(line).toContain("some/project");
    expect(line).not.toContain("/home/user");
  });

  test("full: full sessionId and full cwd", () => {
    const now = Math.floor(Date.now() / 1000);
    const session = { ...base, mtime: now - 300 };
    const line = formatSessionLine(session, { full: true, now });
    expect(line).toContain("abc12345-6789-0123-4567-890123456789");
    expect(line).toContain("/home/user/some/project");
  });

  test("with context: appends tab + context", () => {
    const now = Math.floor(Date.now() / 1000);
    const session = { ...base, mtime: now - 60, context: "found keyword here" };
    const line = formatSessionLine(session, { full: false, now });
    expect(line).toContain("\tfound keyword here");
  });
});

describe("formatSessionsOutput", () => {
  test("ヘッダ行 + セッション行を出力", () => {
    const now = Math.floor(Date.now() / 1000);
    const allSessions: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 7200,
        size: 5000,
        sessionId: "aaaaaaaa",
        cwd: "/x/y",
      },
      {
        file: "/a/c.jsonl",
        mtime: now - 300,
        size: 10000,
        sessionId: "bbbbbbbb",
        cwd: "/x/z",
      },
    ];
    const filtered = allSessions;
    const output = formatSessionsOutput(allSessions, filtered, {
      full: false,
      tail: 10,
      now,
    });
    const lines = output.split("\n");
    // ヘッダ行
    expect(lines[0]).toMatch(/^# 2 sessions \(/);
    // セッション行
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 sessions
  });

  test("tail制限: 最後のN件のみ表示", () => {
    const now = Math.floor(Date.now() / 1000);
    const sessions: SessionInfo[] = [];
    for (let i = 0; i < 5; i++) {
      sessions.push({
        file: `/a/s${i}.jsonl`,
        mtime: now - (5 - i) * 60,
        size: 1000,
        sessionId: `sess${i}000`,
        cwd: "/x/y",
      });
    }
    const output = formatSessionsOutput(sessions, sessions, {
      full: false,
      tail: 2,
      now,
    });
    const lines = output.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(lines.length).toBe(2);
    // 最後の2件 = sess3, sess4
    expect(lines[0]).toContain("sess3000");
    expect(lines[1]).toContain("sess4000");
  });

  test("filteredが空でもallが空でなければヘッダは出る", () => {
    const now = Math.floor(Date.now() / 1000);
    const allSessions: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 300,
        size: 5000,
        sessionId: "aaaaaaaa",
        cwd: "/x/y",
      },
    ];
    const output = formatSessionsOutput(allSessions, [], {
      full: false,
      tail: 10,
      now,
    });
    const lines = output.split("\n").filter((l) => l);
    expect(lines.length).toBe(1); // ヘッダのみ
    expect(lines[0]).toMatch(/^# 1 sessions/);
  });
});
