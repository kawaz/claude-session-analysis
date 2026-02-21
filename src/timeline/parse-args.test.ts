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

  test("--colors=invalid でエラー", () => {
    expect(() => parseArgs(["--colors=invalid", "session"])).toThrow(/Invalid --colors value/);
  });

  test("-t の後に値がない場合エラー", () => {
    expect(() => parseArgs(["-t"])).toThrow(/-t requires/);
  });

  test("-w の後に値がない場合エラー", () => {
    expect(() => parseArgs(["-w"])).toThrow(/-w requires/);
  });

  test("-w に非数値を渡した場合エラー", () => {
    expect(() => parseArgs(["-w", "abc", "session"])).toThrow(/-w requires a number/);
  });

  // mdMode tests
  test("デフォルトの mdMode は off", () => {
    const args = parseArgs(["session-id"]);
    expect(args.mdMode).toBe("off");
  });

  test("--md-render → mdMode = render", () => {
    const args = parseArgs(["--md-render", "session-id"]);
    expect(args.mdMode).toBe("render");
  });

  test("--md-source → mdMode = source", () => {
    const args = parseArgs(["--md-source", "session-id"]);
    expect(args.mdMode).toBe("source");
  });

  test("--md-render と --md-source は後勝ち", () => {
    const args = parseArgs(["--md-render", "--md-source", "session-id"]);
    expect(args.mdMode).toBe("source");
  });

  // emoji tests
  test("デフォルトの emoji は auto", () => {
    const args = parseArgs(["session-id"]);
    expect(args.emoji).toBe("auto");
  });

  test("--emoji → emoji = always", () => {
    const args = parseArgs(["--emoji", "session-id"]);
    expect(args.emoji).toBe("always");
  });

  test("--no-emoji → emoji = never", () => {
    const args = parseArgs(["--no-emoji", "session-id"]);
    expect(args.emoji).toBe("never");
  });

  test("--emoji と --no-emoji は後勝ち", () => {
    const args = parseArgs(["--emoji", "--no-emoji", "session-id"]);
    expect(args.emoji).toBe("never");
  });
});
