import { describe, test, expect } from "bun:test";
import { parseArgs, parseRange } from "./parse-args.ts";

describe("parseRange", () => {
  test("空文字列 → 全範囲", () => {
    expect(parseRange("")).toEqual({ from: "", to: "" });
  });

  test("..marker → 先頭からmarkerまで", () => {
    expect(parseRange("..marker")).toEqual({ from: "", to: "marker" });
  });

  test("marker.. → markerから末尾まで", () => {
    expect(parseRange("marker..")).toEqual({ from: "marker", to: "" });
  });

  test("from..to → fromからtoまで", () => {
    expect(parseRange("from..to")).toEqual({ from: "from", to: "to" });
  });

  test("marker (..なし) → 単一", () => {
    expect(parseRange("marker")).toEqual({ from: "marker", to: "marker" });
  });
});

describe("parseArgs", () => {
  test("デフォルト値", () => {
    const args = parseArgs(["session-id"]);
    expect(args.types).toBe("UTRFWBGASQDI");
    expect(args.width).toBe(55);
    expect(args.timestamps).toBe(false);
    expect(args.colors).toBe("auto");
    expect(args.rawMode).toBe(0);
    expect(args.input).toBe("session-id");
    expect(args.from).toBe("");
    expect(args.to).toBe("");
    expect(args.help).toBe(false);
  });

  test("-t でタイプフィルタ指定", () => {
    const args = parseArgs(["-t", "UTR", "session-id"]);
    expect(args.types).toBe("UTR");
    expect(args.input).toBe("session-id");
  });

  test("-w で幅指定", () => {
    const args = parseArgs(["-w", "80", "session-id"]);
    expect(args.width).toBe(80);
    expect(args.input).toBe("session-id");
  });

  test("--timestamps", () => {
    const args = parseArgs(["--timestamps", "session-id"]);
    expect(args.timestamps).toBe(true);
  });

  test("--colors=always", () => {
    const args = parseArgs(["--colors=always", "session-id"]);
    expect(args.colors).toBe("always");
  });

  test("--colors=never", () => {
    const args = parseArgs(["--colors=never", "session-id"]);
    expect(args.colors).toBe("never");
  });

  test("--colors (値なし) → always", () => {
    const args = parseArgs(["--colors", "session-id"]);
    expect(args.colors).toBe("always");
  });

  test("--no-colors", () => {
    const args = parseArgs(["--no-colors", "session-id"]);
    expect(args.colors).toBe("never");
  });

  test("--raw", () => {
    const args = parseArgs(["--raw", "session-id"]);
    expect(args.rawMode).toBe(1);
  });

  test("--raw2", () => {
    const args = parseArgs(["--raw2", "session-id"]);
    expect(args.rawMode).toBe(2);
  });

  test("--help", () => {
    const args = parseArgs(["--help"]);
    expect(args.help).toBe(true);
  });

  test("-h", () => {
    const args = parseArgs(["-h"]);
    expect(args.help).toBe(true);
  });

  test("範囲付き: session-id from..to", () => {
    const args = parseArgs(["session-id", "from..to"]);
    expect(args.input).toBe("session-id");
    expect(args.from).toBe("from");
    expect(args.to).toBe("to");
  });

  test("input未指定でhelpでない場合はエラー", () => {
    expect(() => parseArgs([])).toThrow();
  });

  test("helpの場合はinput未指定でもエラーにならない", () => {
    expect(() => parseArgs(["--help"])).not.toThrow();
  });

  test("不明オプションでエラー", () => {
    expect(() => parseArgs(["--unknown", "session-id"])).toThrow();
    expect(() => parseArgs(["-z", "session-id"])).toThrow();
  });
});
