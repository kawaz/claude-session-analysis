import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  truncate,
  formatSize,
  omit,
  redact,
  redactWithHint,
  pick,
  shortenPath,
  lastSegments,
  getSessionCwd,
  formatTzOffset,
  progName,
  parseDuration,
  classifyUserTurnKind,
  isSlashCommandContent,
  extractUserTurnText,
  classifyUserTurn,
  isUserTurn,
  getForkedFromSessionId,
  findForkSplit,
} from "./lib.ts";

describe("truncate", () => {
  test("returns string as-is when within width", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("truncates and appends remaining count", () => {
    expect(truncate("hello world", 5)).toBe("hello[+6]");
  });

  test("returns string as-is when width is 0", () => {
    expect(truncate("abc", 0)).toBe("abc");
  });

  test("returns empty string as-is", () => {
    expect(truncate("", 5)).toBe("");
  });

  test("負数widthは元文字列を返す", () => {
    expect(truncate("hello", -1)).toBe("hello");
  });
});

describe("formatSize", () => {
  test("formats 0 bytes", () => {
    expect(formatSize(0)).toBe("0B");
  });

  test("formats bytes below 1K", () => {
    expect(formatSize(1023)).toBe("1023B");
  });

  test("formats exactly 1K", () => {
    expect(formatSize(1024)).toBe("1.0K");
  });

  test("formats exactly 1M", () => {
    expect(formatSize(1048576)).toBe("1.0M");
  });

  test("formats 2.5M", () => {
    expect(formatSize(2621440)).toBe("2.5M");
  });
});

describe("omit", () => {
  test("removes specified keys from top-level object", () => {
    expect(omit({ a: 1, b: 2 }, ["b"])).toEqual({ a: 1 });
  });

  test("removes specified keys recursively from nested objects", () => {
    expect(omit({ a: { b: 1, c: 2 } }, ["b"])).toEqual({ a: { c: 2 } });
  });

  test("applies recursively to array elements", () => {
    expect(omit([{ a: 1, b: 2 }], ["b"])).toEqual([{ a: 1 }]);
  });
});

describe("redact", () => {
  test("replaces specified key values with [omitted:SIZE]", () => {
    // jq tostring: string -> そのまま (引用符なし) = "hello".length = 5 chars
    expect(redact({ a: "hello" }, ["a"])).toEqual({ a: "[omitted:5B]" });
  });
});

describe("pick", () => {
  test("picks only specified keys from top-level", () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });
});

describe("shortenPath", () => {
  test("shortens path to last n segments", () => {
    expect(shortenPath("/usr/local/bin/bun", 2)).toBe("\u2026/bin/bun");
  });

  test("returns path as-is when segments <= n", () => {
    expect(shortenPath("bin/bun", 2)).toBe("bin/bun");
  });

  test("returns path as-is when split results in <= n non-empty segments", () => {
    expect(shortenPath("/a", 2)).toBe("/a");
  });
  test("undefined → 空文字列", () => {
    expect(shortenPath(undefined)).toBe("");
  });
  test("null → 空文字列", () => {
    expect(shortenPath(null)).toBe("");
  });
});

describe("redactWithHint", () => {
  test("値を [omitted:SIZE --raw --no-redact] に置換", () => {
    const result = redactWithHint({ a: "hello" }, ["a"]);
    expect(result).toEqual({ a: "[omitted:5B --raw --no-redact]" });
  });
});

describe("lastSegments", () => {
  test("末尾2要素を返す（…/なし）", () => {
    expect(lastSegments("/usr/local/bin/bun")).toBe("bin/bun");
  });
  test("要素数が2以下ならそのまま", () => {
    expect(lastSegments("bin/bun")).toBe("bin/bun");
  });
  test("先頭スラッシュ付き1要素", () => {
    expect(lastSegments("/bun")).toBe("/bun");
  });
  test("undefined → 空文字列", () => {
    expect(lastSegments(undefined)).toBe("");
  });
  test("null → 空文字列", () => {
    expect(lastSegments(null)).toBe("");
  });
});

describe("getSessionCwd", () => {
  test("空配列 → 空文字列を返す", () => {
    expect(getSessionCwd([])).toBe("");
  });

  test("全エントリに cwd がない → 空文字列を返す", () => {
    expect(getSessionCwd([{ type: "user" }, { type: "assistant" }])).toBe("");
  });

  test("最初のエントリに cwd がある → その値を返す", () => {
    expect(
      getSessionCwd([
        { cwd: "/home/user/project", type: "user" },
        { cwd: "/other", type: "assistant" },
      ]),
    ).toBe("/home/user/project");
  });

  test("最初のエントリに cwd がないが後続にある → 後続の cwd を返す", () => {
    expect(
      getSessionCwd([{ type: "user" }, { cwd: "/home/user/project2", type: "assistant" }]),
    ).toBe("/home/user/project2");
  });
});

describe("formatTzOffset", () => {
  test("+HH:MM または -HH:MM 形式の文字列を返す", () => {
    const result = formatTzOffset(new Date());
    expect(result).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  test("異なるDateオブジェクトでも形式が正しい", () => {
    const result = formatTzOffset(new Date("2024-06-15T12:00:00Z"));
    expect(result).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
});

describe("progName", () => {
  let originalProg: string | undefined;

  beforeEach(() => {
    originalProg = process.env._PROG;
  });

  afterEach(() => {
    if (originalProg !== undefined) {
      process.env._PROG = originalProg;
    } else {
      delete process.env._PROG;
    }
  });

  test("_PROG が設定されている場合はその値を返す", () => {
    process.env._PROG = "my-custom-prog";
    expect(progName()).toBe("my-custom-prog");
  });

  test("未設定でデフォルト名を渡した場合はデフォルト名を返す", () => {
    delete process.env._PROG;
    expect(progName("my-default")).toBe("my-default");
  });

  test("未設定でデフォルト名も渡さない場合は 'claude-session-analysis' を返す", () => {
    delete process.env._PROG;
    expect(progName()).toBe("claude-session-analysis");
  });
});

describe("parseDuration", () => {
  test("1h → 3600", () => {
    expect(parseDuration("1h")).toBe(3600);
  });

  test("30m → 1800", () => {
    expect(parseDuration("30m")).toBe(1800);
  });

  test("1h30m → 5400", () => {
    expect(parseDuration("1h30m")).toBe(5400);
  });

  test("2d → 172800", () => {
    expect(parseDuration("2d")).toBe(172800);
  });

  test("空文字列 → 0", () => {
    expect(parseDuration("")).toBe(0);
  });

  test("不正な単位は throw", () => {
    expect(() => parseDuration("5x")).toThrow(/Invalid duration/);
  });

  test("部分マッチを silent 受理しない (5d5x10m → throw)", () => {
    expect(() => parseDuration("5d5x10m")).toThrow(/Invalid duration/);
  });

  test("数字なし → throw", () => {
    expect(() => parseDuration("abc")).toThrow(/Invalid duration/);
  });
});

describe("classifyUserTurnKind", () => {
  describe("hidden_tag", () => {
    test("system-reminder タグのみ → hidden_tag", () => {
      expect(classifyUserTurnKind("<system-reminder>do not do X</system-reminder>")).toBe(
        "hidden_tag",
      );
    });

    test("user-prompt-submit-hook タグのみ → hidden_tag", () => {
      expect(
        classifyUserTurnKind("<user-prompt-submit-hook>injected</user-prompt-submit-hook>"),
      ).toBe("hidden_tag");
    });

    test("local-command-stdout タグのみ → hidden_tag", () => {
      expect(classifyUserTurnKind("<local-command-stdout>output here</local-command-stdout>")).toBe(
        "hidden_tag",
      );
    });

    test("タグ + 短い ASCII 相槌 (残文字≤20) → hidden_tag", () => {
      expect(classifyUserTurnKind("<system-reminder>x</system-reminder> ok thanks")).toBe(
        "hidden_tag",
      );
    });

    test("複数タグ混在 → hidden_tag", () => {
      expect(
        classifyUserTurnKind(
          "<system-reminder>a</system-reminder><local-command-stdout>b</local-command-stdout>",
        ),
      ).toBe("hidden_tag");
    });

    // 修正5(b): HIDDEN_TAG_RESIDUE_MAX=20 の境界。残文字を複数 word にして short_ascii(word≤2) と干渉させない。
    test("残文字19文字（複数word ASCII）→ hidden_tag（≤20）", () => {
      expect("aa bb cc dd ee ff g".length).toBe(19);
      expect(classifyUserTurnKind(`<system-reminder>x</system-reminder> aa bb cc dd ee ff g`)).toBe(
        "hidden_tag",
      );
    });

    test("残文字20文字（複数word ASCII）→ hidden_tag（境界内）", () => {
      expect("aa bb cc dd ee ff gg".length).toBe(20);
      expect(
        classifyUserTurnKind(`<system-reminder>x</system-reminder> aa bb cc dd ee ff gg`),
      ).toBe("hidden_tag");
    });

    test("残文字21文字（複数word ASCII）→ effective（閾値超過）", () => {
      expect("aa bb cc dd ee ff ggg".length).toBe(21);
      expect(
        classifyUserTurnKind(`<system-reminder>x</system-reminder> aa bb cc dd ee ff ggg`),
      ).toBe("effective");
    });
  });

  describe("hidden_tag にならない", () => {
    // タグ + 20文字超の実指示 ASCII → 残文字が word≤2 でなければ effective
    test("タグ + 20文字超の ASCII 実指示 (3 word 以上) → effective", () => {
      expect(
        classifyUserTurnKind(
          "<system-reminder>x</system-reminder> please refactor the whole module now",
        ),
      ).toBe("effective");
    });

    // タグ + 20文字超の ASCII。HIDDEN_TAG の残文字チェック (≤20) を超えて非該当。
    // short_ascii / effective の再判定は「タグ除去前の元テキスト全体」で行われるため、
    // <system-reminder>...</system-reminder> 部分が空白を含み 3 word 以上 → effective。
    test("タグ + 20文字超の ASCII (元テキストは 3 word 以上) → effective", () => {
      // 残文字 "supercalifragilistic expialidocious" は 35 文字 (>20)
      expect(
        classifyUserTurnKind(
          "<system-reminder>x</system-reminder> supercalifragilistic expialidocious",
        ),
      ).toBe("effective");
    });

    test("タグ + 日本語残文字 → effective", () => {
      expect(classifyUserTurnKind("<system-reminder>x</system-reminder> これを直して")).toBe(
        "effective",
      );
    });
  });

  describe("short_ascii", () => {
    test("ok (1 word) → short_ascii", () => {
      expect(classifyUserTurnKind("ok")).toBe("short_ascii");
    });

    test("yes please (2 word) → short_ascii", () => {
      expect(classifyUserTurnKind("yes please")).toBe("short_ascii");
    });
  });

  describe("effective", () => {
    test("日本語を含む → effective", () => {
      expect(classifyUserTurnKind("これを直して")).toBe("effective");
    });

    test("ASCII 3 word 以上 → effective", () => {
      expect(classifyUserTurnKind("fix this bug")).toBe("effective");
    });

    test("空文字列 → effective (フォールバック)", () => {
      expect(classifyUserTurnKind("")).toBe("effective");
    });

    test("空白のみ → effective (フォールバック)", () => {
      expect(classifyUserTurnKind("   ")).toBe("effective");
    });
  });

  describe("注意ケース", () => {
    // <message>hello</message> は SYSTEM_TAGS 非該当 → stripped=false で hidden_tag にならない。
    // また < > は \s で区切られないため全体が 1 word の ASCII → short_ascii。
    test("<message>hello</message> (SYSTEM_TAGS 非該当) → short_ascii (1 word)", () => {
      expect(classifyUserTurnKind("<message>hello</message>")).toBe("short_ascii");
    });
  });
});

describe("isSlashCommandContent (extract.ts と統一した slash 判定)", () => {
  // extract.ts の判定基準: trimmed.startsWith("<") && trimmed.endsWith(">") && includes("<command-name>")
  test("XML 風スラッシュコマンド全体は slash", () => {
    expect(
      isSlashCommandContent("<command-name>/clear</command-name><command-args></command-args>"),
    ).toBe(true);
  });

  test("前後に空白があっても trim 後に判定", () => {
    expect(isSlashCommandContent("  <command-name>/fork</command-name>  ")).toBe(true);
  });

  test("本文に <command-name> を引用しただけ（先頭が < でない）は slash でない", () => {
    expect(isSlashCommandContent("これは <command-name> の説明です")).toBe(false);
  });

  test("先頭は < だが末尾が > でない（引用混じり本文）は slash でない", () => {
    expect(isSlashCommandContent("<command-name> について説明して")).toBe(false);
  });

  test("<command-name> を含まない XML 風は slash でない", () => {
    expect(isSlashCommandContent("<message>hello</message>")).toBe(false);
  });
});

describe("extractUserTurnText (isUserTurn と classifyUserTurn で同一本文を見る)", () => {
  test("string content はそのまま返す", () => {
    expect(extractUserTurnText({ message: { content: "これを直して" } })).toBe("これを直して");
  });

  test("複数 text ブロックは改行連結（情報欠落しない方向）", () => {
    expect(
      extractUserTurnText({
        message: {
          content: [
            { type: "text", text: "これは" },
            { type: "text", text: "日本語の指示" },
          ],
        },
      }),
    ).toBe("これは\n日本語の指示");
  });

  test("text 以外のブロックは無視", () => {
    expect(
      extractUserTurnText({
        message: {
          content: [
            { type: "tool_result", content: "x" },
            { type: "text", text: "本文" },
          ],
        },
      }),
    ).toBe("本文");
  });

  test("content 無しは空文字", () => {
    expect(extractUserTurnText({})).toBe("");
  });
});

describe("classifyUserTurn: slash 判定の誤検知防止 (修正1)", () => {
  test("本文に <command-name> を引用しただけの user は slash_only にならず effective", () => {
    const entry = { type: "user", message: { content: "これは <command-name> の説明です" } };
    expect(classifyUserTurn(entry)).toBe("effective");
  });

  test("真の slash コマンド entry は slash_only", () => {
    const entry = {
      type: "user",
      message: { content: "<command-name>/clear</command-name><command-args></command-args>" },
    };
    expect(classifyUserTurn(entry)).toBe("slash_only");
  });
});

describe("isUserTurn と classifyUserTurn の本文一致 (修正3)", () => {
  // 1ブロック目が除外前置だが、本文全体としては実指示があるケース。
  // どちらのヘルパも同一の本文抽出を使う前提を担保する。
  test("複数 text ブロックの先頭が通常テキストなら両者とも turn として扱う", () => {
    const entry = {
      type: "user",
      message: {
        content: [
          { type: "text", text: "これは" },
          { type: "text", text: "日本語の長い指示です" },
        ],
      },
    };
    expect(isUserTurn(entry)).toBe(true);
    expect(classifyUserTurn(entry)).toBe("effective");
  });

  test("[Request interrupted 前置は isUserTurn が false（既存除外を維持）", () => {
    const entry = { type: "user", message: { content: "[Request interrupted by user]" } };
    expect(isUserTurn(entry)).toBe(false);
  });
});

// --- fork 境界判定の共通化（修正4: timeline/sessions の単一の正） ---
describe("getForkedFromSessionId", () => {
  test("forkedFrom.sessionId があれば返す", () => {
    expect(getForkedFromSessionId({ forkedFrom: { sessionId: "parent-abc" } })).toBe("parent-abc");
  });
  test("forkedFrom が無ければ null", () => {
    expect(getForkedFromSessionId({ type: "user" })).toBeNull();
  });
  test("forkedFrom.sessionId が非文字列なら null", () => {
    expect(getForkedFromSessionId({ forkedFrom: { sessionId: 123 } })).toBeNull();
    expect(getForkedFromSessionId({ forkedFrom: {} })).toBeNull();
  });
});

describe("findForkSplit (fork 境界判定: findings の単一の正)", () => {
  test("forkedFrom が無いセッションは hasFork=false", () => {
    const entries = [
      { type: "user", uuid: "u1", message: { content: "hello" } },
      { type: "assistant", uuid: "a1", message: { content: [{ type: "text", text: "hi" }] } },
    ];
    const r = findForkSplit(entries);
    expect(r.hasFork).toBe(false);
    expect(r.parentSessionId).toBeNull();
    expect(r.forkFirstNewUuid).toBeNull();
  });

  test("単純な fork: 最初の非コピー user が境界", () => {
    const entries = [
      {
        type: "user",
        uuid: "c1",
        forkedFrom: { sessionId: "parent-abc" },
        message: { content: "親" },
      },
      {
        type: "assistant",
        uuid: "c2",
        forkedFrom: { sessionId: "parent-abc" },
        message: { content: [{ type: "text", text: "応答" }] },
      },
      { type: "user", uuid: "new-first", message: { content: "fork後" } },
    ];
    const r = findForkSplit(entries);
    expect(r.hasFork).toBe(true);
    expect(r.parentSessionId).toBe("parent-abc");
    expect(r.lastCopyIndex).toBe(1);
    expect(r.forkFirstNewUuid).toBe("new-first");
    expect(r.splitIndex).toBe(2);
  });

  test("境界直後に非 user（custom-title/assistant/system/file-history-snapshot）が挟まっても最初の user を採用", () => {
    const entries = [
      {
        type: "user",
        uuid: "c1",
        forkedFrom: { sessionId: "parent-xyz" },
        message: { content: "親" },
      },
      // 非コピー（forkedFrom 無し）だが非 user の境界群
      { type: "system", subtype: "custom_title", uuid: "ct-1", content: "btw: x" },
      {
        type: "assistant",
        uuid: "auto-1",
        message: { content: [{ type: "text", text: "No response requested." }] },
      },
      {
        type: "system",
        subtype: "local_command",
        uuid: "sys-1",
        content: "<command-name>/fork</command-name>",
      },
      { type: "file-history-snapshot", messageId: "fhs-1", snapshot: { trackedFileBackups: {} } },
      // 真の最初の user prompt（fork args）
      { type: "user", uuid: "user-first", message: { content: "fork後の最初のユーザー発言" } },
    ];
    const r = findForkSplit(entries);
    expect(r.hasFork).toBe(true);
    expect(r.parentSessionId).toBe("parent-xyz");
    expect(r.lastCopyIndex).toBe(0);
    expect(r.forkFirstNewUuid).toBe("user-first");
    // splitIndex は最初の非コピー user の位置（= 非 user 境界群はスキップ）
    expect(r.splitIndex).toBe(5);
  });

  test("forkedFrom が複数の異なる親を指しても最初の値を採用", () => {
    const entries = [
      {
        type: "user",
        uuid: "c1",
        forkedFrom: { sessionId: "parent-A" },
        message: { content: "x" },
      },
      {
        type: "user",
        uuid: "c2",
        forkedFrom: { sessionId: "parent-B" },
        message: { content: "y" },
      },
      { type: "user", uuid: "first-new", message: { content: "z" } },
    ];
    const r = findForkSplit(entries);
    expect(r.parentSessionId).toBe("parent-A");
    expect(r.lastCopyIndex).toBe(1);
    expect(r.forkFirstNewUuid).toBe("first-new");
    expect(r.splitIndex).toBe(2);
  });
});
