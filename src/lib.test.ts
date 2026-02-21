import { describe, expect, test } from "bun:test";
import { truncate, formatSize, omit, redact, redactWithHint, pick, shortenPath, lastSegments } from "./lib.ts";

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
});
