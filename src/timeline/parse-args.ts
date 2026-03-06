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
    color: "auto",
    jsonlMode: "none",
    inputs: [],
    from: "",
    to: "",
    mdMode: "none",
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
    } else if (arg === "--width") {
      i++;
      if (i >= argv.length) throw new Error("--width requires a value");
      const w = parseInt(argv[i], 10);
      if (isNaN(w)) throw new Error(`--width requires a number, got: ${argv[i]}`);
      result.width = w;
    } else if (arg === "--timestamps") {
      result.timestamps = true;
    } else if (arg === "--no-timestamps") {
      result.timestamps = false;
    } else if (arg === "--color") {
      result.color = "always";
    } else if (arg.startsWith("--color=")) {
      const value = arg.slice("--color=".length);
      const validColors = ["auto", "always", "none"];
      if (!validColors.includes(value)) {
        throw new Error(`Invalid --color value: ${value} (expected: auto, always, none)`);
      }
      result.color = value as "auto" | "always" | "none";
    } else if (arg === "--md") {
      result.mdMode = "auto";
    } else if (arg.startsWith("--md=")) {
      const value = arg.slice("--md=".length);
      const validMdModes = ["auto", "source", "render", "none"];
      if (!validMdModes.includes(value)) {
        throw new Error(`Invalid --md value: ${value} (expected: auto, source, render, none)`);
      }
      result.mdMode = value as "auto" | "source" | "render" | "none";
    } else if (arg === "--emoji") {
      result.emoji = "always";
    } else if (arg === "--no-emoji") {
      result.emoji = "never";
    } else if (arg === "--jsonl") {
      result.jsonlMode = "redact";
    } else if (arg.startsWith("--jsonl=")) {
      const value = arg.slice("--jsonl=".length);
      const validJsonl = ["none", "redact", "full"];
      if (!validJsonl.includes(value)) {
        throw new Error(`Invalid --jsonl value: ${value} (expected: none, redact, full)`);
      }
      result.jsonlMode = value as "none" | "redact" | "full";
    } else if (arg === "--grep") {
      i++;
      if (i >= argv.length) throw new Error("--grep requires a value");
      result.grep = argv[i];
    } else if (arg === "--help") {
      result.help = true;
    } else if (arg.startsWith("-") && arg !== "-") {
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
