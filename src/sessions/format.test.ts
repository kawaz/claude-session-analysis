import { describe, expect, test } from "bun:test";
import {
  formatHumanSize,
  formatAgo,
  formatDuration,
  formatDateTime,
  formatProjectPath,
  formatSessionLine,
  formatSessionsOutput,
} from "./format.ts";
import type { SessionInfo } from "./search.ts";

describe("formatHumanSize", () => {
  test("KB range: 1500 -> 1.5K", () => {
    expect(formatHumanSize(1500)).toBe("1.5K");
  });
  test("KB range: 10000 -> 10K (integer)", () => {
    expect(formatHumanSize(10000)).toBe(" 10K");
  });
  test("KB range: 150000 -> 150K", () => {
    expect(formatHumanSize(150000)).toBe("150K");
  });
  test("MB range: 1500000 -> 1.5M", () => {
    expect(formatHumanSize(1500000)).toBe("1.5M");
  });
  test("MB range: 15000000 -> 15M", () => {
    expect(formatHumanSize(15000000)).toBe(" 15M");
  });
  test("MB range: 150000000 -> 150M", () => {
    expect(formatHumanSize(150000000)).toBe("150M");
  });
  test("GB range: 1500000000 -> 1.5G", () => {
    expect(formatHumanSize(1500000000)).toBe("1.5G");
  });
  test("small: 500 -> 0.5K", () => {
    expect(formatHumanSize(500)).toBe("0.5K");
  });
  test("zero: 0 -> 0.0K", () => {
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

describe("formatDuration", () => {
  test("under 1min: 45s -> right-aligned 45s", () => {
    expect(formatDuration(45)).toBe("   45s");
  });
  test("minutes: 300s -> right-aligned 5m", () => {
    expect(formatDuration(300)).toBe("    5m");
  });
  test("hours and minutes: 3661s -> 1h01m", () => {
    expect(formatDuration(3661)).toBe(" 1h01m");
  });
  test("exact hours: 7200s -> 2h00m", () => {
    expect(formatDuration(7200)).toBe(" 2h00m");
  });
  test("13h54m", () => {
    expect(formatDuration(50040)).toBe("13h54m");
  });
  test("days: 90060s -> right-aligned 1d", () => {
    expect(formatDuration(90060)).toBe("    1d");
  });
  test("many days: 8640000s -> right-aligned 100d", () => {
    expect(formatDuration(8640000)).toBe("  100d");
  });
  test("zero: right-aligned 0s", () => {
    expect(formatDuration(0)).toBe("    0s");
  });
});

describe("formatDateTime", () => {
  test("formats epoch to MM/DD HH:MM", () => {
    // 2026-03-06 10:30:00 JST = 2026-03-06T01:30:00Z
    const d = new Date(2026, 2, 6, 10, 30, 0);
    const epoch = Math.floor(d.getTime() / 1000);
    expect(formatDateTime(epoch)).toBe("03-06T10:30");
  });
});

describe("formatProjectPath", () => {
  test("repos/ 以降を返す", () => {
    expect(formatProjectPath("/Users/kawaz/.local/share/repos/github.com/kawaz/project", false))
      .toBe("github.com/kawaz/project");
  });
  test("repos/ がなければ末尾2セグメント", () => {
    expect(formatProjectPath("/home/user/some/project", false))
      .toBe("some/project");
  });
  test("full=true はフルパス", () => {
    expect(formatProjectPath("/Users/kawaz/.local/share/repos/github.com/kawaz/project", true))
      .toBe("/Users/kawaz/.local/share/repos/github.com/kawaz/project");
  });
});

describe("formatSessionLine", () => {
  const now = Math.floor(new Date(2026, 2, 6, 12, 0, 0).getTime() / 1000);
  const base: SessionInfo = {
    file: "/home/.claude/projects/kawaz/myproject/abc12345-6789-0123-4567-890123456789.jsonl",
    mtime: now - 300, // 5min ago
    startTime: now - 3900, // 1h5m ago
    endTime: now - 300,
    size: 15000,
    sessionId: "abc12345-6789-0123-4567-890123456789",
    cwd: "/Users/kawaz/.local/share/repos/github.com/kawaz/myproject",
  };

  test("default: start end (ago duration) short_sid short_path", () => {
    const line = formatSessionLine(base, { full: false, now });
    // contains start/end datetime
    expect(line).toContain("03-06T");
    // contains duration
    expect(line).toContain("1h");
    // short sid
    expect(line).toContain("abc12345");
    expect(line).not.toContain("abc12345-6789");
    // short path (repos/ 以降)
    expect(line).toContain("github.com/kawaz/myproject");
    expect(line).not.toContain("/Users/kawaz");
  });

  test("full: full sessionId and full cwd", () => {
    const line = formatSessionLine(base, { full: true, now });
    expect(line).toContain("abc12345-6789-0123-4567-890123456789");
    expect(line).toContain("/Users/kawaz/.local/share/repos/github.com/kawaz/myproject");
  });

  test("with context: appends tab + context", () => {
    const session = { ...base, context: "found keyword here" };
    const line = formatSessionLine(session, { full: false, now });
    expect(line).toContain("\tfound keyword here");
  });
});

describe("formatSessionsOutput", () => {
  const now = Math.floor(new Date(2026, 2, 6, 12, 0, 0).getTime() / 1000);

  test("ヘッダ行 + セッション行を出力", () => {
    const allSessions: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 7200,
        startTime: now - 7500,
        endTime: now - 7200,
        size: 5000,
        sessionId: "aaaaaaaa",
        cwd: "/x/y",
      },
      {
        file: "/a/c.jsonl",
        mtime: now - 300,
        startTime: now - 600,
        endTime: now - 300,
        size: 10000,
        sessionId: "bbbbbbbb",
        cwd: "/x/z",
      },
    ];
    const output = formatSessionsOutput(allSessions, allSessions, {
      full: false,
      tail: 10,
      now,
    });
    const lines = output.split("\n");
    expect(lines[0]).toMatch(/^# 2 sessions \(/);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  test("tail制限: 最後のN件のみ表示", () => {
    const sessions: SessionInfo[] = [];
    for (let i = 0; i < 5; i++) {
      const t = now - (5 - i) * 60;
      sessions.push({
        file: `/a/s${i}.jsonl`,
        mtime: t,
        startTime: t - 30,
        endTime: t,
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
    expect(lines[0]).toContain("sess3000");
    expect(lines[1]).toContain("sess4000");
  });

  test("filteredが空でもallが空でなければヘッダは出る", () => {
    const allSessions: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 300,
        startTime: now - 600,
        endTime: now - 300,
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
    expect(lines.length).toBe(2);
    expect(lines[0]).toMatch(/^# 1 sessions/);
    expect(lines[1]).toMatch(/^# +Start/);
  });
});
