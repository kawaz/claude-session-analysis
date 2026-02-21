import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { searchSessions, type SessionInfo } from "./search.ts";
import { mkdtemp, rm, mkdir, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("searchSessions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "sessions-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /** ヘルパー: jsonlファイルを作成 */
  async function createSession(
    projectPath: string,
    filename: string,
    lines: string[],
    mtime?: Date,
  ): Promise<string> {
    const dir = join(tmpDir, "projects", projectPath);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, filename);
    await writeFile(filePath, lines.join("\n") + "\n");
    if (mtime) {
      await utimes(filePath, mtime, mtime);
    }
    return filePath;
  }

  test("基本: jsonlからsessionIdとcwdを抽出", async () => {
    await createSession("myproject", "abc12345-session.jsonl", [
      '{"sessionId":"abc12345-6789-0123-4567-890123456789","cwd":"/home/user/project","type":"human"}',
      '{"type":"assistant","message":"hello"}',
    ]);

    const results = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]!.sessionId).toBe("abc12345-6789-0123-4567-890123456789");
    expect(results[0]!.cwd).toBe("/home/user/project");
    expect(results[0]!.size).toBeGreaterThan(0);
  });

  test("空ファイル（サイズ0）はスキップ", async () => {
    // サイズ0のファイルを直接作成
    const dir = join(tmpDir, "projects", "myproject");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "empty.jsonl"), "");

    const results = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(0);
  });

  test("agent-*.jsonl は除外", async () => {
    await createSession("myproject", "agent-abc123.jsonl", [
      '{"sessionId":"abc12345","cwd":"/home/user/project","type":"human"}',
    ]);
    await createSession("myproject", "normal-session.jsonl", [
      '{"sessionId":"def67890","cwd":"/home/user/project2","type":"human"}',
    ]);

    const results = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]!.sessionId).toBe("def67890");
  });

  test("mmin フィルタ: 正の値（N分以内）", async () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    await createSession(
      "p1",
      "recent.jsonl",
      ['{"sessionId":"recent111","cwd":"/a","type":"human"}'],
      fiveMinAgo,
    );
    await createSession(
      "p2",
      "old.jsonl",
      ['{"sessionId":"oldold22","cwd":"/b","type":"human"}'],
      twoHoursAgo,
    );

    // 10分以内 → recentのみ
    const results = await searchSessions({
      configDirs: [tmpDir],
      mmin: "10",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.sessionId).toBe("recent111");
  });

  test("mmin フィルタ: +N（N分より古い）", async () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    await createSession(
      "p1",
      "recent.jsonl",
      ['{"sessionId":"recent111","cwd":"/a","type":"human"}'],
      fiveMinAgo,
    );
    await createSession(
      "p2",
      "old.jsonl",
      ['{"sessionId":"oldold22","cwd":"/b","type":"human"}'],
      twoHoursAgo,
    );

    // +10分（10分より古い） → oldのみ
    const results = await searchSessions({
      configDirs: [tmpDir],
      mmin: "+10",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.sessionId).toBe("oldold22");
  });

  test("キーワード検索: ファイル内容から検索しコンテキスト付き", async () => {
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"match1234","cwd":"/a","type":"human"}',
      '{"type":"assistant","message":"the quick brown fox jumps"}',
    ]);
    await createSession("p2", "s2.jsonl", [
      '{"sessionId":"nomatch12","cwd":"/b","type":"human"}',
      '{"type":"assistant","message":"nothing here"}',
    ]);

    const results = await searchSessions({
      configDirs: [tmpDir],
      keyword: "brown fox",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.sessionId).toBe("match1234");
    expect(results[0]!.context).toContain("brown fox");
  });

  test("キーワード検索: 前後20文字のコンテキスト", async () => {
    const prefix = "a".repeat(30);
    const suffix = "z".repeat(30);
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"ctx12345","cwd":"/a","type":"human"}',
      `{"message":"${prefix}KEYWORD${suffix}"}`,
    ]);

    const results = await searchSessions({
      configDirs: [tmpDir],
      keyword: "KEYWORD",
    });
    expect(results.length).toBe(1);
    // 前後20文字に切り詰め
    expect(results[0]!.context!.length).toBeLessThanOrEqual(20 + "KEYWORD".length + 20);
    expect(results[0]!.context).toContain("KEYWORD");
  });

  test("結果はmtimeでソートされる（昇順）", async () => {
    const now = new Date();

    await createSession(
      "p1",
      "s1.jsonl",
      ['{"sessionId":"second22","cwd":"/a","type":"human"}'],
      new Date(now.getTime() - 60 * 1000),
    );
    await createSession(
      "p2",
      "s2.jsonl",
      ['{"sessionId":"first111","cwd":"/b","type":"human"}'],
      new Date(now.getTime() - 120 * 1000),
    );
    await createSession(
      "p3",
      "s3.jsonl",
      ['{"sessionId":"third333","cwd":"/c","type":"human"}'],
      new Date(now.getTime() - 30 * 1000),
    );

    const results = await searchSessions({ configDirs: [tmpDir] });
    expect(results.map((r) => r.sessionId)).toEqual([
      "first111",
      "second22",
      "third333",
    ]);
  });

  test("複数のconfigDirsを検索", async () => {
    const tmpDir2 = await mkdtemp(join(tmpdir(), "sessions-test2-"));
    try {
      const dir1 = join(tmpDir, "projects", "p1");
      await mkdir(dir1, { recursive: true });
      await writeFile(
        join(dir1, "s1.jsonl"),
        '{"sessionId":"from_dir1","cwd":"/a","type":"human"}\n',
      );

      const dir2 = join(tmpDir2, "projects", "p2");
      await mkdir(dir2, { recursive: true });
      await writeFile(
        join(dir2, "s2.jsonl"),
        '{"sessionId":"from_dir2","cwd":"/b","type":"human"}\n',
      );

      const results = await searchSessions({
        configDirs: [tmpDir, tmpDir2],
      });
      const ids = results.map((r) => r.sessionId);
      expect(ids).toContain("from_dir1");
      expect(ids).toContain("from_dir2");
    } finally {
      await rm(tmpDir2, { recursive: true, force: true });
    }
  });

  test("sessionIdが見つからない場合は '?' になる（cwdはある行）", async () => {
    await createSession("p1", "s1.jsonl", [
      '{"cwd":"/a","type":"human"}',
    ]);

    const results = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]!.sessionId).toBe("?");
    expect(results[0]!.cwd).toBe("/a");
  });

  test("cwdを含む行がないファイルはスキップ（sh版grep -m1互換）", async () => {
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"abc12345","type":"human"}',
    ]);

    const results = await searchSessions({ configDirs: [tmpDir] });
    // "cwd"キーを含む行がないので、sh版同様スキップされる
    expect(results.length).toBe(0);
  });

  test("projectsディレクトリが存在しない場合は空結果", async () => {
    const nonExistentDir = join(tmpDir, "nonexistent");
    const results = await searchSessions({
      configDirs: [nonExistentDir],
    });
    expect(results.length).toBe(0);
  });
});
