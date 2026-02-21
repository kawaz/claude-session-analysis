import { describe, expect, test } from "bun:test";
import { truncate, formatSize, omit, redact, pick, shortenPath } from "./lib.ts";

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
    // JSON.stringify("hello") = '"hello"' = 7 chars
    expect(redact({ a: "hello" }, ["a"])).toEqual({ a: "[omitted:7B]" });
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
