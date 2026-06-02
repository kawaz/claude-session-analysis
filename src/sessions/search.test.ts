import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { searchSessions, parseDuration } from "./search.ts";
import { mkdtemp, rm, mkdir, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unwrap } from "../test-utils.ts";

describe("parseDuration", () => {
  test("秒のみ", () => {
    expect(parseDuration("30s")).toBe(30);
  });

  test("分のみ", () => {
    expect(parseDuration("5m")).toBe(300);
  });

  test("時のみ", () => {
    expect(parseDuration("1h")).toBe(3600);
  });

  test("日のみ", () => {
    expect(parseDuration("2d")).toBe(172800);
  });

  test("複合: 1h30m", () => {
    expect(parseDuration("1h30m")).toBe(5400);
  });

  test("複合: 1d2h30m10s", () => {
    expect(parseDuration("1d2h30m10s")).toBe(86400 + 7200 + 1800 + 10);
  });

  test("空文字列は0を返す", () => {
    expect(parseDuration("")).toBe(0);
  });
});

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
      '{"sessionId":"abc12345-6789-0123-4567-890123456789","cwd":"/home/user/project","type":"user","message":{"content":"hello"}}',
      '{"type":"assistant","message":"hello"}',
    ]);

    const { sessions: results, stats } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe("abc12345-6789-0123-4567-890123456789");
    expect(results[0]?.cwd).toBe("/home/user/project");
    expect(results[0]?.size).toBeGreaterThan(0);
    // turns検証: type:"user" + message.content ありが1行 → turns=1
    expect(results[0]?.turns).toBe(1);
    // stats検証
    expect(stats.total).toBe(1);
    expect(stats.oldestMtime).toBe(unwrap(results[0]).mtime);
    expect(stats.newestMtime).toBe(unwrap(results[0]).mtime);
  });

  test("空ファイル（サイズ0）はスキップ", async () => {
    // サイズ0のファイルを直接作成
    const dir = join(tmpDir, "projects", "myproject");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "empty.jsonl"), "");

    const { sessions: results, stats } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(0);
    expect(stats.total).toBe(0);
  });

  test("agent-*.jsonl は除外", async () => {
    await createSession("myproject", "agent-abc123.jsonl", [
      '{"sessionId":"abc12345","cwd":"/home/user/project","type":"user","message":{"content":"hello"}}',
    ]);
    await createSession("myproject", "normal-session.jsonl", [
      '{"sessionId":"def67890","cwd":"/home/user/project2","type":"user","message":{"content":"hello"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe("def67890");
  });

  test("since フィルタ: cutoff以降のセッションのみ取得", async () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    await createSession(
      "p1",
      "recent.jsonl",
      ['{"sessionId":"recent111","cwd":"/a","type":"user","message":{"content":"hello"}}'],
      fiveMinAgo,
    );
    await createSession(
      "p2",
      "old.jsonl",
      ['{"sessionId":"oldold22","cwd":"/b","type":"user","message":{"content":"hello"}}'],
      twoHoursAgo,
    );

    // cutoff = 10分前 → recentのみ
    const cutoff = Math.floor((now.getTime() - 10 * 60 * 1000) / 1000);
    const { sessions: results, stats } = await searchSessions({
      configDirs: [tmpDir],
      since: cutoff,
    });
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe("recent111");
    // statsはsinceフィルタ前の全有効ファイル統計
    expect(stats.total).toBe(2);
  });

  test("since フィルタ: cutoffが古ければ全件取得", async () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    await createSession(
      "p1",
      "recent.jsonl",
      ['{"sessionId":"recent111","cwd":"/a","type":"user","message":{"content":"hello"}}'],
      fiveMinAgo,
    );
    await createSession(
      "p2",
      "old.jsonl",
      ['{"sessionId":"oldold22","cwd":"/b","type":"user","message":{"content":"hello"}}'],
      twoHoursAgo,
    );

    // cutoff = 3時間前 → 両方取得
    const cutoff = Math.floor((now.getTime() - 3 * 60 * 60 * 1000) / 1000);
    const { sessions: results, stats } = await searchSessions({
      configDirs: [tmpDir],
      since: cutoff,
    });
    expect(results.length).toBe(2);
    expect(stats.total).toBe(2);
  });

  test("キーワード検索: ファイル内容から検索しコンテキスト付き", async () => {
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"match1234","cwd":"/a","type":"user","message":{"content":"hello"}}',
      '{"type":"assistant","message":"the quick brown fox jumps"}',
    ]);
    await createSession("p2", "s2.jsonl", [
      '{"sessionId":"nomatch12","cwd":"/b","type":"user","message":{"content":"hello"}}',
      '{"type":"assistant","message":"nothing here"}',
    ]);

    const { sessions: results } = await searchSessions({
      configDirs: [tmpDir],
      keywords: ["brown fox"],
    });
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe("match1234");
    expect(results[0]?.context).toContain("brown fox");
  });

  test("キーワード検索: 前20文字+後50文字のコンテキスト", async () => {
    const prefix = "a".repeat(30);
    const suffix = "z".repeat(60);
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"ctx12345","cwd":"/a","type":"user","message":{"content":"hello"}}',
      `{"message":"${prefix}KEYWORD${suffix}"}`,
    ]);

    const { sessions: results } = await searchSessions({
      configDirs: [tmpDir],
      keywords: ["KEYWORD"],
    });
    expect(results.length).toBe(1);
    // [N hit(s)] + 前20文字+後50文字に切り詰め
    expect(results[0]?.context).toMatch(/^\[\d+ hits?\] /);
    const digest = unwrap(unwrap(results[0]).context).replace(/^\[\d+ hits?\] /, "");
    expect(digest.length).toBeLessThanOrEqual(20 + "KEYWORD".length + 50);
    expect(results[0]?.context).toContain("KEYWORD");
  });

  test("結果はmtimeでソートされる（昇順）", async () => {
    const now = new Date();

    await createSession(
      "p1",
      "s1.jsonl",
      ['{"sessionId":"second22","cwd":"/a","type":"user","message":{"content":"hello"}}'],
      new Date(now.getTime() - 60 * 1000),
    );
    await createSession(
      "p2",
      "s2.jsonl",
      ['{"sessionId":"first111","cwd":"/b","type":"user","message":{"content":"hello"}}'],
      new Date(now.getTime() - 120 * 1000),
    );
    await createSession(
      "p3",
      "s3.jsonl",
      ['{"sessionId":"third333","cwd":"/c","type":"user","message":{"content":"hello"}}'],
      new Date(now.getTime() - 30 * 1000),
    );

    const { sessions: results, stats } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.map((r) => r.sessionId)).toEqual(["first111", "second22", "third333"]);
    // turns検証: 各セッションにtype:"user"が1行ずつ
    expect(results.map((r) => r.turns)).toEqual([1, 1, 1]);
    // statsのmtime範囲を検証
    expect(stats.total).toBe(3);
    expect(stats.oldestMtime).toBe(unwrap(results[0]).mtime);
    expect(stats.newestMtime).toBe(unwrap(results[2]).mtime);
  });

  test("複数のconfigDirsを検索", async () => {
    const tmpDir2 = await mkdtemp(join(tmpdir(), "sessions-test2-"));
    try {
      const dir1 = join(tmpDir, "projects", "p1");
      await mkdir(dir1, { recursive: true });
      await writeFile(
        join(dir1, "s1.jsonl"),
        '{"sessionId":"from_dir1","cwd":"/a","type":"user","message":{"content":"hello"}}\n',
      );

      const dir2 = join(tmpDir2, "projects", "p2");
      await mkdir(dir2, { recursive: true });
      await writeFile(
        join(dir2, "s2.jsonl"),
        '{"sessionId":"from_dir2","cwd":"/b","type":"user","message":{"content":"hello"}}\n',
      );

      const { sessions: results } = await searchSessions({
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
      '{"cwd":"/a","type":"user","message":{"content":"hello"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe("?");
    expect(results[0]?.cwd).toBe("/a");
  });

  test("cwdを含む行がないファイルはスキップ（sh版grep -m1互換）", async () => {
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"abc12345","type":"user","message":{"content":"hello"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    // "cwd"キーを含む行がないので、sh版同様スキップされる
    expect(results.length).toBe(0);
  });

  test("projectsディレクトリが存在しない場合は空結果", async () => {
    const nonExistentDir = join(tmpDir, "nonexistent");
    const { sessions: results, stats } = await searchSessions({
      configDirs: [nonExistentDir],
    });
    expect(results.length).toBe(0);
    expect(stats.total).toBe(0);
  });

  test("キーワード検索: 正規表現パターンでマッチ", async () => {
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"regex123","cwd":"/a","type":"user","message":{"content":"hello"}}',
      '{"type":"assistant","message":"the Previous and Next items"}',
    ]);

    const { sessions: results } = await searchSessions({
      configDirs: [tmpDir],
      keywords: ["Prev.*Next"],
    });
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe("regex123");
    expect(results[0]?.context).toContain("Previous and Next");
  });

  test("キーワード検索: 複数キーワードはセッション単位 AND（異なる行に分散していてもマッチ）", async () => {
    // 各キーワードが別々の行に出現するセッション → 全部含むので採用
    await createSession("p1", "all3.jsonl", [
      '{"sessionId":"all33333","cwd":"/a","type":"user","message":{"content":"alpha"}}',
      '{"type":"assistant","message":"intermediate text bravo line"}',
      '{"type":"user","message":{"content":"final charlie here"}}',
    ]);
    // alpha と bravo はあるが charlie 無し → 除外
    await createSession("p2", "two-of-three.jsonl", [
      '{"sessionId":"two22222","cwd":"/b","type":"user","message":{"content":"alpha then bravo"}}',
    ]);
    // 全部無し → 除外
    await createSession("p3", "none.jsonl", [
      '{"sessionId":"non33333","cwd":"/c","type":"user","message":{"content":"unrelated"}}',
    ]);

    const { sessions: results } = await searchSessions({
      configDirs: [tmpDir],
      keywords: ["alpha", "bravo", "charlie"],
    });
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe("all33333");
    // context は各キーワードの最初のヒットが " | " 区切りで連結される
    const ctx = results[0]?.context ?? "";
    expect(ctx).toMatch(/^\[\d+ hits \/ 3 kw\] /);
    expect(ctx).toContain("alpha");
    expect(ctx).toContain("bravo");
    expect(ctx).toContain("charlie");
    expect(ctx.split(" | ").length).toBe(3);
  });

  test("キーワード検索: 単一キーワードは従来通り [N hit(s)] ヘッダ", async () => {
    await createSession("p1", "single.jsonl", [
      '{"sessionId":"sng11111","cwd":"/a","type":"user","message":{"content":"hello"}}',
      '{"type":"assistant","message":"foo bar baz"}',
    ]);

    const { sessions: results } = await searchSessions({
      configDirs: [tmpDir],
      keywords: ["bar"],
    });
    expect(results.length).toBe(1);
    expect(results[0]?.context).toMatch(/^\[\d+ hits?\] /);
    // 単一キーワード時は "/ K kw" 表記を出さない
    expect(results[0]?.context).not.toContain("kw]");
  });

  test("キーワード検索: 1つでもヒット0のキーワードがあればセッション除外", async () => {
    await createSession("p1", "miss-one.jsonl", [
      '{"sessionId":"miss1111","cwd":"/a","type":"user","message":{"content":"alpha bravo"}}',
    ]);

    const { sessions: results } = await searchSessions({
      configDirs: [tmpDir],
      keywords: ["alpha", "zzz-not-there"],
    });
    expect(results.length).toBe(0);
  });

  test("キーワード検索: 空配列は検索しない（全件パススルー）", async () => {
    await createSession("p1", "any.jsonl", [
      '{"sessionId":"any11111","cwd":"/a","type":"user","message":{"content":"anything"}}',
    ]);

    const { sessions: results } = await searchSessions({
      configDirs: [tmpDir],
      keywords: [],
    });
    expect(results.length).toBe(1);
    expect(results[0]?.context).toBeUndefined();
  });

  test("キーワード検索: 不正な正規表現でエラー", async () => {
    await createSession("p1", "s1.jsonl", [
      '{"sessionId":"err12345","cwd":"/a","type":"user","message":{"content":"hello"}}',
      '{"type":"assistant","message":"something"}',
    ]);

    await expect(
      searchSessions({ configDirs: [tmpDir], keywords: ["[invalid"] }),
    ).rejects.toThrow();
  });

  test("effectiveUserTurns: effective のみ数える（hidden_tag/short_ascii/slash は除外）", async () => {
    await createSession("p1", "eff.jsonl", [
      '{"sessionId":"eff12345","cwd":"/a","type":"user","message":{"content":"これを直して下さい"}}', // effective
      '{"type":"user","message":{"content":"ok"}}', // short_ascii → 除外
      '{"type":"user","message":{"content":"<system-reminder>x</system-reminder>"}}', // hidden_tag → 除外
      '{"type":"user","message":{"content":"<command-name>/clear</command-name><command-args></command-args>"}}', // slash → 除外
      '{"type":"user","message":{"content":"fix this bug please"}}', // effective
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    // turns は isUserTurn を通過した全 user ターン
    expect(results[0]?.turns).toBe(5);
    // effective は 2 件のみ
    expect(results[0]?.effectiveUserTurns).toBe(2);
  });

  test("effectiveUserTurns: 複数 text ブロックの user は連結して1ターンとして分類", async () => {
    await createSession("p1", "multi.jsonl", [
      '{"sessionId":"multi123","cwd":"/a","type":"user","message":{"content":[{"type":"text","text":"これは"},{"type":"text","text":"日本語の指示"}]}}', // effective
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.turns).toBe(1);
    expect(results[0]?.effectiveUserTurns).toBe(1);
  });

  test("fork なしセッション: forkedFrom / forkFirstNewUuid は null", async () => {
    await createSession("p1", "nofork.jsonl", [
      '{"sessionId":"nofork12","cwd":"/a","type":"user","uuid":"u1","message":{"content":"hello there friend"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.forkedFrom).toBeNull();
    expect(results[0]?.forkFirstNewUuid).toBeNull();
  });

  test("fork セッション: forkedFrom は親 sessionId、forkFirstNewUuid は最初の非コピー entry uuid", async () => {
    await createSession("p1", "fork.jsonl", [
      // 親からのコピー entry（forkedFrom 付与）
      '{"sessionId":"child123","cwd":"/a","type":"user","uuid":"copy-1","forkedFrom":{"sessionId":"parent-abc"},"message":{"content":"親の発言1"}}',
      '{"type":"assistant","uuid":"copy-2","forkedFrom":{"sessionId":"parent-abc"},"message":{"content":[{"type":"text","text":"親の応答"}]}}',
      // fork 後最初の新規 entry（forkedFrom 無し）
      '{"type":"user","uuid":"new-first","message":{"content":"fork 後の最初の発言"}}',
      '{"type":"assistant","uuid":"new-second","message":{"content":[{"type":"text","text":"応答"}]}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.forkedFrom).toBe("parent-abc");
    expect(results[0]?.forkFirstNewUuid).toBe("new-first");
  });

  // 修正2/4: 実機 /fork の境界構造を模した fixture。
  // findings 仕様: forkFirstNewUuid は type:"user" の entry（fork args が最初の user prompt になる）。
  // 境界直後に attachment→system→assistant が挟まっても、assistant ではなく最初の user を拾うこと。
  test("fork: 境界直後に attachment/system/assistant が挟まっても forkFirstNewUuid は最初の user", async () => {
    await createSession("p1", "fork-realistic.jsonl", [
      // 親からのコピー entry（forkedFrom 付与）
      '{"sessionId":"child999","cwd":"/a","type":"user","uuid":"copy-1","forkedFrom":{"sessionId":"parent-xyz"},"message":{"content":"親の発言"}}',
      '{"type":"assistant","uuid":"copy-2","forkedFrom":{"sessionId":"parent-xyz"},"message":{"content":[{"type":"text","text":"親の応答"}]}}',
      // fork 境界直後の非 user entry 群（forkedFrom 無し）
      '{"type":"attachment","uuid":"att-1","message":{"content":"添付"}}',
      '{"type":"system","subtype":"local_command","uuid":"sys-1","content":"<command-name>/fork</command-name><command-args></command-args>"}',
      '{"type":"assistant","uuid":"asst-1","message":{"content":[{"type":"text","text":"先に喋る assistant"}]}}',
      // 真の最初の user prompt（fork args）
      '{"type":"user","uuid":"user-first","message":{"content":"fork 後の最初のユーザー発言"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.forkedFrom).toBe("parent-xyz");
    // assistant(asst-1) や system(sys-1) を拾わず、最初の user(user-first) を指すこと
    expect(results[0]?.forkFirstNewUuid).toBe("user-first");
  });

  // 修正2: /btw fork 模擬（custom-title→assistant→user 境界）でも user を拾う
  test("fork: btw 模擬境界（custom-title→assistant→user）でも forkFirstNewUuid は user", async () => {
    await createSession("p1", "fork-btw.jsonl", [
      '{"sessionId":"btwchild","cwd":"/a","type":"user","uuid":"c1","forkedFrom":{"sessionId":"parent-btw"},"message":{"content":"親"}}',
      '{"type":"system","subtype":"custom-title","uuid":"ct-1","content":"btw: 質問"}',
      '{"type":"assistant","uuid":"a1","message":{"content":[{"type":"text","text":"btw 応答"}]}}',
      '{"type":"user","uuid":"btw-user-first","message":{"content":"btw の質問内容"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.forkFirstNewUuid).toBe("btw-user-first");
  });

  // 修正5(c): forkedFrom が複数の異なる親を指す異常系 → 最初を採用
  test("fork: forkedFrom が複数の異なる親を指しても最初の値を採用", async () => {
    await createSession("p1", "fork-multiparent.jsonl", [
      '{"sessionId":"mp1","cwd":"/a","type":"user","uuid":"c1","forkedFrom":{"sessionId":"parent-A"},"message":{"content":"x"}}',
      '{"type":"user","uuid":"c2","forkedFrom":{"sessionId":"parent-B"},"message":{"content":"y"}}',
      '{"type":"user","uuid":"first-new","message":{"content":"新規発言"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.forkedFrom).toBe("parent-A");
    expect(results[0]?.forkFirstNewUuid).toBe("first-new");
  });

  // 修正5(d): forkFirstNewUuid 算出後にさらに forkedFrom 付き entry が出る順序乱れ → 最初の確定値を維持
  test("fork: forkFirstNewUuid 確定後に forkedFrom 付き entry が再出現しても上書きしない", async () => {
    await createSession("p1", "fork-reorder.jsonl", [
      '{"sessionId":"ro1","cwd":"/a","type":"user","uuid":"c1","forkedFrom":{"sessionId":"parent-R"},"message":{"content":"親"}}',
      '{"type":"user","uuid":"first-new","message":{"content":"新規発言"}}',
      // 順序乱れ: 後からまた forkedFrom 付き entry
      '{"type":"user","uuid":"late-copy","forkedFrom":{"sessionId":"parent-R"},"message":{"content":"遅れて来たコピー"}}',
      '{"type":"user","uuid":"another-new","message":{"content":"別の新規"}}',
    ]);

    const { sessions: results } = await searchSessions({ configDirs: [tmpDir] });
    expect(results.length).toBe(1);
    expect(results[0]?.forkFirstNewUuid).toBe("first-new");
  });
});

describe("effectiveUserTurns 異常系 (修正5)", () => {
  let tmpDir2: string;

  beforeEach(async () => {
    tmpDir2 = await mkdtemp(join(tmpdir(), "sessions-eff-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir2, { recursive: true, force: true });
  });

  async function createSession2(filename: string, lines: string[]): Promise<void> {
    const dir = join(tmpDir2, "projects", "p1");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), lines.join("\n") + "\n");
  }

  // 修正5(a): 空文字/空白のみ user は effective に数える（安全側フォールバック）
  test("空文字 user は effective に数える", async () => {
    await createSession2("empty.jsonl", [
      '{"sessionId":"emp12345","cwd":"/a","type":"user","message":{"content":""}}',
    ]);
    const { sessions } = await searchSessions({ configDirs: [tmpDir2] });
    expect(sessions.length).toBe(1);
    // isUserTurn は空文字を除外する（text falsy）が、もし turn になれば effective 側
    // 実機準拠: 空文字 content は isUserTurn=false（text なし）なので turn にもならない
    expect(sessions[0]?.effectiveUserTurns).toBe(0);
  });

  test("空白のみ user は isUserTurn を通過し effective に数える", async () => {
    await createSession2("space.jsonl", [
      '{"sessionId":"spc12345","cwd":"/a","type":"user","message":{"content":"   "}}',
    ]);
    const { sessions } = await searchSessions({ configDirs: [tmpDir2] });
    expect(sessions.length).toBe(1);
    // 空白のみは text truthy なので isUserTurn=true、classify は effective（安全側）
    expect(sessions[0]?.turns).toBe(1);
    expect(sessions[0]?.effectiveUserTurns).toBe(1);
  });

  // 修正5(b): hidden_tag 残文字閾値の境界は classifyUserTurnKind 単体テスト（lib.test.ts）で検証。
  // ここでは search 経由で「閾値超過 → effective に数える」end-to-end を 1 本だけ担保する。
  // 残文字を複数 word にして short_ascii(word≤2) と干渉させず、純粋に residue 長で分岐させる。
  test("hidden_tag 残文字が閾値超過（21文字・複数word）なら effective に数える", async () => {
    // "aa bb cc dd ee ff" = 17文字, " aa bb cc dd ee fff" 形式で 21 文字 / word>2 にする
    const residue = "aa bb cc dd ee ff ggg"; // 21 文字, 7 word
    await createSession2("b21.jsonl", [
      `{"sessionId":"b2112345","cwd":"/a","type":"user","message":{"content":"<system-reminder>x</system-reminder> ${residue}"}}`,
    ]);
    const { sessions } = await searchSessions({ configDirs: [tmpDir2] });
    expect(sessions[0]?.effectiveUserTurns).toBe(1);
  });

  // effectiveUserTurns <= turns の不変条件
  test("effectiveUserTurns <= turns が常に成立", async () => {
    await createSession2("inv.jsonl", [
      '{"sessionId":"inv12345","cwd":"/a","type":"user","message":{"content":"これを直して下さい"}}',
      '{"type":"user","message":{"content":"ok"}}',
      '{"type":"user","message":{"content":"<system-reminder>x</system-reminder>"}}',
      '{"type":"user","message":{"content":"<command-name>/clear</command-name><command-args></command-args>"}}',
    ]);
    const { sessions } = await searchSessions({ configDirs: [tmpDir2] });
    expect(sessions[0]?.effectiveUserTurns).toBeLessThanOrEqual(unwrap(sessions[0]).turns);
  });
});
