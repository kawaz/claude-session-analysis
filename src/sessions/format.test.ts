import { describe, expect, test } from "bun:test";
import {
  formatHumanSize,
  formatAgo,
  formatDuration,
  formatDateTime,
  formatProjectPath,
  formatSessionLine,
  formatSessionsOutput,
  formatSessionsJsonl,
} from "./format.ts";
import type { SessionInfo, SessionStats } from "./search.ts";

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
  test("0s -> 0s", () => {
    expect(formatDuration(0)).toBe(" 0s");
  });
  test("5s -> 5s", () => {
    expect(formatDuration(5)).toBe(" 5s");
  });
  test("45s -> 45s", () => {
    expect(formatDuration(45)).toBe("45s");
  });
  test("300s -> 5m", () => {
    expect(formatDuration(300)).toBe(" 5m");
  });
  test("900s -> 15m", () => {
    expect(formatDuration(900)).toBe("15m");
  });
  test("3661s -> 1h", () => {
    expect(formatDuration(3661)).toBe(" 1h");
  });
  test("5400s -> 1h", () => {
    expect(formatDuration(5400)).toBe(" 1h");
  });
  test("50040s -> 13h", () => {
    expect(formatDuration(50040)).toBe("13h");
  });
  test("90060s -> 1d", () => {
    expect(formatDuration(90060)).toBe(" 1d");
  });
  test("216000s -> 2d", () => {
    expect(formatDuration(216000)).toBe(" 2d");
  });
  test("99d -> 99d", () => {
    expect(formatDuration(99 * 86400)).toBe("99d");
  });
  test("100d -> 100d", () => {
    expect(formatDuration(100 * 86400)).toBe("100d");
  });
  test("8640000s -> 100d", () => {
    expect(formatDuration(8640000)).toBe("100d");
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
  test("フルパスを返す", () => {
    expect(formatProjectPath("/Users/kawaz/.local/share/repos/github.com/kawaz/project"))
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
    turns: 42,
  };

  test("end, duration, full sessionId, turns, full path を含む", () => {
    const line = formatSessionLine(base, { now });
    expect(line).toMatch(/2026-03-06T\d{2}:\d{2}:\d{2}/);
    expect(line).not.toMatch(/2026-03-06T\d{2}:\d{2}:\d{2}[+-]/);
    expect(line).toContain(" 1h");
    expect(line).toContain("  42");
    expect(line).toContain("abc12345");
    expect(line).not.toContain("abc12345-");
    expect(line).toContain("/Users/kawaz/.local/share/repos/github.com/kawaz/myproject");
  });

  test("with context: appends context", () => {
    const session = { ...base, context: "found keyword here" };
    const line = formatSessionLine(session, { now });
    expect(line).toContain("  found keyword here");
  });
});

describe("formatSessionsOutput", () => {
  const now = Math.floor(new Date(2026, 2, 6, 12, 0, 0).getTime() / 1000);

  test("ヘッダ行 + セッション行を出力", () => {
    const stats: SessionStats = {
      total: 2,
      oldestMtime: now - 7200,
      newestMtime: now - 300,
    };
    const filtered: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 7200,
        startTime: now - 7500,
        endTime: now - 7200,
        size: 5000,
        sessionId: "aaaaaaaa",
        cwd: "/x/y",
        turns: 5,
      },
      {
        file: "/a/c.jsonl",
        mtime: now - 300,
        startTime: now - 600,
        endTime: now - 300,
        size: 10000,
        sessionId: "bbbbbbbb",
        cwd: "/x/z",
        turns: 10,
      },
    ];
    const output = formatSessionsOutput(stats, filtered, {
      tail: 10,
      now,
    });
    const lines = output.split("\n");
    expect(output).toContain("# now:");
    expect(output).toMatch(/# 2 sessions \(/);
    // now + sessions summary + column header + 2 data lines
    expect(lines.length).toBeGreaterThanOrEqual(5);
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
        turns: i + 1,
      });
    }
    const stats: SessionStats = {
      total: 5,
      oldestMtime: sessions[0]!.mtime,
      newestMtime: sessions[4]!.mtime,
    };
    const output = formatSessionsOutput(stats, sessions, {
      tail: 2,
      now,
    });
    const lines = output.split("\n");
    // データ行は末尾2行
    const dataLines = lines.filter((l) => !l.startsWith("#") && !l.startsWith("TIMESTAMP") && l.trim());
    expect(dataLines.length).toBe(2);
    expect(dataLines[0]).toContain("sess3000");
    expect(dataLines[1]).toContain("sess4000");
  });

  test("filteredが空でもstatsが空でなければヘッダは出る", () => {
    const stats: SessionStats = {
      total: 1,
      oldestMtime: now - 300,
      newestMtime: now - 300,
    };
    const output = formatSessionsOutput(stats, [], {
      tail: 10,
      now,
    });
    const lines = output.split("\n").filter((l) => l);
    expect(lines.length).toBe(3); // now + sessions summary + column header
    expect(output).toContain("# now:");
    expect(output).toMatch(/# 1 sessions/);
    expect(output).toMatch(/TIMESTAMP_END[+-]\d{2}:\d{2}\s+DUR\b/);
  });
});

describe("formatSessionsJsonl", () => {
  const now = Math.floor(new Date(2026, 2, 6, 12, 0, 0).getTime() / 1000);

  test("各セッションが1行のJSONとして出力される", () => {
    const sessions: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 7200,
        startTime: now - 7500,
        endTime: now - 7200,
        size: 5000,
        sessionId: "aaaaaaaa-1111-2222-3333-444444444444",
        cwd: "/x/y",
        turns: 5,
      },
      {
        file: "/a/c.jsonl",
        mtime: now - 300,
        startTime: now - 600,
        endTime: now - 300,
        size: 10000,
        sessionId: "bbbbbbbb-1111-2222-3333-444444444444",
        cwd: "/x/z",
        turns: 10,
      },
    ];
    const output = formatSessionsJsonl(sessions, { tail: 10 });
    const lines = output.split("\n").filter((l) => l);
    expect(lines.length).toBe(2);

    const obj0 = JSON.parse(lines[0]!);
    expect(obj0.sessionId).toBe("aaaaaaaa-1111-2222-3333-444444444444");
    expect(obj0.file).toBe("/a/b.jsonl");
    expect(obj0.cwd).toBe("/x/y");
    expect(obj0.bytes).toBe(5000);
    expect(obj0.turns).toBe(5);
    expect(obj0.duration_ms).toBe(300000);
    expect(obj0.startTime).toMatch(/^2026-03-06T/);
    expect(obj0.endTime).toMatch(/^2026-03-06T/);

    const obj1 = JSON.parse(lines[1]!);
    expect(obj1.sessionId).toBe("bbbbbbbb-1111-2222-3333-444444444444");
    expect(obj1.turns).toBe(10);
  });

  test("tail制限が適用される", () => {
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
        turns: i + 1,
      });
    }
    const output = formatSessionsJsonl(sessions, { tail: 2 });
    const lines = output.split("\n").filter((l) => l);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).sessionId).toBe("sess3000");
    expect(JSON.parse(lines[1]!).sessionId).toBe("sess4000");
  });

  test("contextがあれば含まれる", () => {
    const sessions: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 300,
        startTime: now - 600,
        endTime: now - 300,
        size: 5000,
        sessionId: "aaaaaaaa",
        cwd: "/x/y",
        turns: 3,
        context: "[2 hits] some match context",
      },
    ];
    const output = formatSessionsJsonl(sessions, { tail: 10 });
    const obj = JSON.parse(output.trim());
    expect(obj.context).toBe("[2 hits] some match context");
  });

  test("contextがなければフィールドに含まれない", () => {
    const sessions: SessionInfo[] = [
      {
        file: "/a/b.jsonl",
        mtime: now - 300,
        startTime: now - 600,
        endTime: now - 300,
        size: 5000,
        sessionId: "aaaaaaaa",
        cwd: "/x/y",
        turns: 3,
      },
    ];
    const output = formatSessionsJsonl(sessions, { tail: 10 });
    const obj = JSON.parse(output.trim());
    expect(obj).not.toHaveProperty("context");
  });

  test("空配列なら空文字列", () => {
    const output = formatSessionsJsonl([], { tail: 10 });
    expect(output).toBe("");
  });
});
