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
    expect(formatHumanSize(1500)).toBe("    1.5K");
  });
  test("KB range: 10000 -> 10K (integer)", () => {
    expect(formatHumanSize(10000)).toBe("     10K");
  });
  test("KB range: 150000 -> 150K", () => {
    expect(formatHumanSize(150000)).toBe("    150K");
  });
  test("MB range: 1500000 -> 1.5M", () => {
    expect(formatHumanSize(1500000)).toBe("    1.5M");
  });
  test("MB range: 15000000 -> 15M", () => {
    expect(formatHumanSize(15000000)).toBe("     15M");
  });
  test("MB range: 150000000 -> 150M", () => {
    expect(formatHumanSize(150000000)).toBe("    150M");
  });
  test("GB range: 1500000000 -> 1.5G", () => {
    expect(formatHumanSize(1500000000)).toBe("    1.5G");
  });
  test("small: 500 -> 0.5K", () => {
    expect(formatHumanSize(500)).toBe("    0.5K");
  });
  test("zero: 0 -> 0.0K", () => {
    expect(formatHumanSize(0)).toBe("    0.0K");
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
  test("0s -> 0.0s", () => {
    expect(formatDuration(0)).toBe("    0.0s");
  });
  test("5s -> 5.0s", () => {
    expect(formatDuration(5)).toBe("    5.0s");
  });
  test("45s -> 45.0s", () => {
    expect(formatDuration(45)).toBe("   45.0s");
  });
  test("300s -> 5.0m", () => {
    expect(formatDuration(300)).toBe("    5.0m");
  });
  test("900s -> 15.0m", () => {
    expect(formatDuration(900)).toBe("   15.0m");
  });
  test("3661s -> 1.0h", () => {
    expect(formatDuration(3661)).toBe("    1.0h");
  });
  test("5400s -> 1.5h", () => {
    expect(formatDuration(5400)).toBe("    1.5h");
  });
  test("50040s -> 13.9h", () => {
    expect(formatDuration(50040)).toBe("   13.9h");
  });
  test("90060s -> 1.0d", () => {
    expect(formatDuration(90060)).toBe("    1.0d");
  });
  test("216000s -> 2.5d", () => {
    expect(formatDuration(216000)).toBe("    2.5d");
  });
  test("99d -> 99.0d (##.#d)", () => {
    expect(formatDuration(99 * 86400)).toBe("   99.0d");
  });
  test("100d -> 100d (####d)", () => {
    expect(formatDuration(100 * 86400)).toBe("    100d");
  });
  test("8640000s -> 100d", () => {
    expect(formatDuration(8640000)).toBe("    100d");
  });
});

describe("formatDateTime", () => {
  test("ローカルTZ付きISO8601形式", () => {
    const d = new Date(2026, 2, 6, 10, 30, 0);
    const epoch = Math.floor(d.getTime() / 1000);
    const result = formatDateTime(epoch);
    expect(result).toMatch(/^2026-03-06T10:30:00[+-]\d{2}:\d{2}$/);
    // 変換結果が同じ瞬間を表す
    expect(new Date(result).getTime()).toBe(d.getTime());
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

  test("default: dur end short_sid short_path", () => {
    const line = formatSessionLine(base, { full: false, now });
    // contains end datetime in ISO8601 with TZ
    expect(line).toMatch(/2026-03-06T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/);
    // contains duration
    expect(line).toContain("1.0h");
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
    const lines = output.split("\n");
    // ヘッダ2行(サマリ + カラム) + データ2行
    const dataLines = lines.slice(2);
    expect(dataLines.length).toBe(2);
    expect(dataLines[0]).toContain("sess3000");
    expect(dataLines[1]).toContain("sess4000");
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
    expect(lines[1]).toMatch(/^End/);
  });
});
