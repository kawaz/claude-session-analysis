import type { ParsedArgs } from "./types.ts";

/** sessionId パターン: 16進数とハイフンのみ */
const SESSION_ID_RE = /^[0-9a-f][0-9a-f-]*$/;

/**
 * positional arg が入力（sessionId or ファイルパス）かどうかを判定。
 * - sessionId パターンにマッチ
 * - パス区切り `/` を含む、または `.jsonl` で終わる
 */
function isInputArg(arg: string): boolean {
  if (SESSION_ID_RE.test(arg)) return true;
  if (arg.includes("/") || arg.endsWith(".jsonl")) return true;
  return false;
}

/**
 * 範囲文字列をパースする。
 * - ""          → { from: "", to: "" }       全範囲
 * - "..marker"  → { from: "", to: "marker" } 先頭からmarkerまで
 * - "marker.."  → { from: "marker", to: "" } markerから末尾まで
 * - "from..to"  → { from: "from", to: "to" }
 * - "marker"    → { from: "marker", to: "marker" } 単一マーカー
 */
export function parseRange(range: string): { from: string; to: string } {
  if (range === "") {
    return { from: "", to: "" };
  }
  const dotIdx = range.indexOf("..");
  if (dotIdx === -1) {
    return { from: range, to: range };
  }
  return {
    from: range.slice(0, dotIdx),
    to: range.slice(dotIdx + 2),
  };
}

/**
 * CLI引数をパースする。
 * argv はサブコマンド以降の引数（bun/scriptパス・サブコマンド名除去済み）。
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    types: "UTRFWBGASQDI",
    width: 55,
    timestamps: false,
    colors: "auto",
    rawMode: 0,
    inputs: [],
    from: "",
    to: "",
    mdMode: "off",
    emoji: "auto",
    grep: "",
    help: false,
  };

  const positional: string[] = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "-t") {
      i++;
      if (i >= argv.length) throw new Error("-t requires a value");
      result.types = argv[i];
    } else if (arg === "-w") {
      i++;
      if (i >= argv.length) throw new Error("-w requires a value");
      const w = parseInt(argv[i], 10);
      if (isNaN(w)) throw new Error(`-w requires a number, got: ${argv[i]}`);
      result.width = w;
    } else if (arg === "--timestamps") {
      result.timestamps = true;
    } else if (arg === "--no-timestamps") {
      result.timestamps = false;
    } else if (arg === "--colors") {
      result.colors = "always";
    } else if (arg.startsWith("--colors=")) {
      const value = arg.slice("--colors=".length);
      const validColors = ["auto", "always", "never"];
      if (!validColors.includes(value)) {
        throw new Error(`Invalid --colors value: ${value} (expected: auto, always, never)`);
      }
      result.colors = value as "auto" | "always" | "never";
    } else if (arg === "--no-colors") {
      result.colors = "never";
    } else if (arg === "--md-render") {
      result.mdMode = "render";
    } else if (arg === "--md-source") {
      result.mdMode = "source";
    } else if (arg === "--emoji") {
      result.emoji = "always";
    } else if (arg === "--no-emoji") {
      result.emoji = "never";
    } else if (arg === "--raw") {
      result.rawMode = 1;
    } else if (arg === "--raw2") {
      result.rawMode = 2;
    } else if (arg === "--grep") {
      i++;
      if (i >= argv.length) throw new Error("--grep requires a value");
      result.grep = argv[i];
    } else if (arg === "--help") {
      result.help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
    i++;
  }

  // positional args を inputs と range に分類
  for (const arg of positional) {
    if (isInputArg(arg)) {
      result.inputs.push(arg);
    } else {
      // range（最後に見つかったものが有効）
      const { from, to } = parseRange(arg);
      result.from = from;
      result.to = to;
    }
  }

  if (!result.help && result.inputs.length === 0) {
    throw new Error("Input is required (session ID or file path)");
  }

  return result;
}
