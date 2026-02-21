import type { ParsedArgs } from "./types.ts";

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
 * argv は process.argv.slice(2) 相当（bun/scriptパス除去済み）。
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    types: "UTRFWBGASQDI",
    width: 55,
    timestamps: false,
    colors: "auto",
    rawMode: 0,
    input: "",
    from: "",
    to: "",
    mdMode: "off",
    emoji: "auto",
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
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
    i++;
  }

  result.input = positional[0] ?? "";

  if (positional.length >= 2) {
    const { from, to } = parseRange(positional[1]);
    result.from = from;
    result.to = to;
  }

  if (!result.help && result.input === "") {
    throw new Error("Input is required (session ID or file path)");
  }

  return result;
}
