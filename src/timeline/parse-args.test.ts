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
    const args = parseArgs(["abc12345"]);
    expect(args.types).toBe("UTRFWBGASQDI");
    expect(args.width).toBe(55);
    expect(args.timestamps).toBe(false);
    expect(args.colors).toBe("auto");
    expect(args.rawMode).toBe(0);
    expect(args.inputs).toEqual(["abc12345"]);
    expect(args.from).toBe("");
    expect(args.to).toBe("");
    expect(args.help).toBe(false);
  });

  test("-t でタイプフィルタ指定", () => {
    const args = parseArgs(["-t", "UTR", "abc12345"]);
    expect(args.types).toBe("UTR");
    expect(args.inputs).toEqual(["abc12345"]);
  });

  test("-w で幅指定", () => {
    const args = parseArgs(["-w", "80", "abc12345"]);
    expect(args.width).toBe(80);
    expect(args.inputs).toEqual(["abc12345"]);
  });

  test("--timestamps", () => {
    const args = parseArgs(["--timestamps", "abc12345"]);
    expect(args.timestamps).toBe(true);
  });

  test("--colors=always", () => {
    const args = parseArgs(["--colors=always", "abc12345"]);
    expect(args.colors).toBe("always");
  });

  test("--colors=never", () => {
    const args = parseArgs(["--colors=never", "abc12345"]);
    expect(args.colors).toBe("never");
  });

  test("--colors (値なし) → always", () => {
    const args = parseArgs(["--colors", "abc12345"]);
    expect(args.colors).toBe("always");
  });

  test("--no-colors", () => {
    const args = parseArgs(["--no-colors", "abc12345"]);
    expect(args.colors).toBe("never");
  });

  test("--raw", () => {
    const args = parseArgs(["--raw", "abc12345"]);
    expect(args.rawMode).toBe(1);
  });

  test("--raw2", () => {
    const args = parseArgs(["--raw2", "abc12345"]);
    expect(args.rawMode).toBe(2);
  });

  test("--help", () => {
    const args = parseArgs(["--help"]);
    expect(args.help).toBe(true);
  });

  test("-h is unknown option", () => {
    expect(() => parseArgs(["-h"])).toThrow("Unknown option: -h");
  });

  test("範囲付き: session-id from..to", () => {
    const args = parseArgs(["abc12345", "from..to"]);
    expect(args.inputs).toEqual(["abc12345"]);
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
    expect(() => parseArgs(["--unknown", "abc12345"])).toThrow();
    expect(() => parseArgs(["-z", "abc12345"])).toThrow();
  });

  test("--colors=invalid でエラー", () => {
    expect(() => parseArgs(["--colors=invalid", "abc12345"])).toThrow(/Invalid --colors value/);
  });

  test("-t の後に値がない場合エラー", () => {
    expect(() => parseArgs(["-t"])).toThrow(/-t requires/);
  });

  test("-w の後に値がない場合エラー", () => {
    expect(() => parseArgs(["-w"])).toThrow(/-w requires/);
  });

  test("-w に非数値を渡した場合エラー", () => {
    expect(() => parseArgs(["-w", "abc", "abc12345"])).toThrow(/-w requires a number/);
  });

  // mdMode tests
  test("デフォルトの mdMode は off", () => {
    const args = parseArgs(["abc12345"]);
    expect(args.mdMode).toBe("off");
  });

  test("--md → mdMode = auto", () => {
    const args = parseArgs(["--md", "abc12345"]);
    expect(args.mdMode).toBe("auto");
  });

  test("--md=source → mdMode = source", () => {
    const args = parseArgs(["--md=source", "abc12345"]);
    expect(args.mdMode).toBe("source");
  });

  test("--md=render → mdMode = render", () => {
    const args = parseArgs(["--md=render", "abc12345"]);
    expect(args.mdMode).toBe("render");
  });

  test("--md=auto → mdMode = auto", () => {
    const args = parseArgs(["--md=auto", "abc12345"]);
    expect(args.mdMode).toBe("auto");
  });

  test("--md=invalid でエラー", () => {
    expect(() => parseArgs(["--md=invalid", "abc12345"])).toThrow(/Invalid --md value/);
  });

  // emoji tests
  test("デフォルトの emoji は auto", () => {
    const args = parseArgs(["abc12345"]);
    expect(args.emoji).toBe("auto");
  });

  test("--emoji → emoji = always", () => {
    const args = parseArgs(["--emoji", "abc12345"]);
    expect(args.emoji).toBe("always");
  });

  test("--no-emoji → emoji = never", () => {
    const args = parseArgs(["--no-emoji", "abc12345"]);
    expect(args.emoji).toBe("never");
  });

  test("--emoji と --no-emoji は後勝ち", () => {
    const args = parseArgs(["--emoji", "--no-emoji", "abc12345"]);
    expect(args.emoji).toBe("never");
  });

  // grep tests
  test("--grep でパターン指定", () => {
    const args = parseArgs(["--grep", "README", "abc12345"]);
    expect(args.grep).toBe("README");
  });

  test("デフォルトの grep は空文字列", () => {
    const args = parseArgs(["abc12345"]);
    expect(args.grep).toBe("");
  });

  test("--grep の後に値がない場合エラー", () => {
    expect(() => parseArgs(["--grep"])).toThrow(/--grep requires/);
  });

  // 複数 sessionId テスト
  test("複数の sessionId を受け付ける", () => {
    const args = parseArgs(["abc12345", "def67890"]);
    expect(args.inputs).toEqual(["abc12345", "def67890"]);
  });

  test("sessionId と range の分類", () => {
    const args = parseArgs(["abc12345", "Uabc1234..Rabc5678"]);
    expect(args.inputs).toEqual(["abc12345"]);
    expect(args.from).toBe("Uabc1234");
    expect(args.to).toBe("Rabc5678");
  });

  test("UUID形式の sessionId を認識", () => {
    const args = parseArgs(["abc12345-6789-0123-4567-890123456789"]);
    expect(args.inputs).toEqual(["abc12345-6789-0123-4567-890123456789"]);
  });

  test("ファイルパスを入力として認識", () => {
    const args = parseArgs(["./path/to/session.jsonl"]);
    expect(args.inputs).toEqual(["./path/to/session.jsonl"]);
  });

  test("単一マーカーは range として扱われる", () => {
    const args = parseArgs(["abc12345", "Uabc1234"]);
    expect(args.inputs).toEqual(["abc12345"]);
    expect(args.from).toBe("Uabc1234");
    expect(args.to).toBe("Uabc1234");
  });
});
