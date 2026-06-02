import type { ParsedArgs } from "./types.ts";

/** sessionId パターン: 16進数とハイフンのみ */
const SESSION_ID_RE = /^[0-9a-f][0-9a-f-]*$/;

/** 純粋な数字のみ（turn range として扱う。5桁以上はセッションIDの可能性が高いため除外） */
export const PURE_NUMBER_RE = /^\d{1,4}$/;

/**
 * positional arg が入力（sessionId or ファイルパス）かどうかを判定。
 * - 純粋な数字のみ → range（turn番号）なので false
 * - 数字のみ..数字のみ など .. を含む → range なので false
 * - sessionId パターンにマッチ → true
 * - パス区切り `/` を含む、または `.jsonl` で終わる → true
 */
function isInputArg(arg: string): boolean {
  // 純粋な数字のみは turn range
  if (PURE_NUMBER_RE.test(arg)) return false;
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

/** 次の引数を取得 (なければエラー)。`name` はエラーメッセージ用のオプション名。 */
function takeValue(argv: string[], i: number, name: string): string {
  const v = argv[i];
  if (v === undefined) throw new Error(`${name} requires a value`);
  return v;
}

/** 次の引数を数値として取得。10 進整数のみ受理 ("10abc" / "0x10" / "1.5" は弾く)。 */
function takeNumber(argv: string[], i: number, name: string): number {
  const v = takeValue(argv, i, name);
  if (!/^-?\d+$/.test(v)) throw new Error(`${name} requires an integer, got: ${v}`);
  return Number(v);
}

const COLOR_MODES = ["auto", "always", "none"] as const;
type ColorMode = (typeof COLOR_MODES)[number];
const isColorMode = (v: string): v is ColorMode => (COLOR_MODES as readonly string[]).includes(v);

const MD_MODES = ["auto", "source", "render", "none"] as const;
type MdMode = (typeof MD_MODES)[number];
const isMdMode = (v: string): v is MdMode => (MD_MODES as readonly string[]).includes(v);

const JSONL_MODES = ["none", "redact", "full"] as const;
type JsonlMode = (typeof JSONL_MODES)[number];
const isJsonlMode = (v: string): v is JsonlMode => (JSONL_MODES as readonly string[]).includes(v);

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
    since: "",
    lastTurn: 0,
    lastSince: "",
    after: 0,
    before: 0,
    help: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) break;

    if (arg === "-t") {
      i++;
      result.types = takeValue(argv, i, arg);
    } else if (arg === "--width") {
      i++;
      result.width = takeNumber(argv, i, arg);
    } else if (arg === "--timestamps") {
      result.timestamps = true;
    } else if (arg === "--no-timestamps") {
      result.timestamps = false;
    } else if (arg === "--color") {
      result.color = "always";
    } else if (arg.startsWith("--color=")) {
      const value = arg.slice("--color=".length);
      if (!isColorMode(value)) {
        throw new Error(`Invalid --color value: ${value} (expected: ${COLOR_MODES.join(", ")})`);
      }
      result.color = value;
    } else if (arg === "--md") {
      result.mdMode = "auto";
    } else if (arg.startsWith("--md=")) {
      const value = arg.slice("--md=".length);
      if (!isMdMode(value)) {
        throw new Error(`Invalid --md value: ${value} (expected: ${MD_MODES.join(", ")})`);
      }
      result.mdMode = value;
    } else if (arg === "--emoji") {
      result.emoji = "always";
    } else if (arg === "--no-emoji") {
      result.emoji = "never";
    } else if (arg === "--jsonl") {
      result.jsonlMode = "redact";
    } else if (arg.startsWith("--jsonl=")) {
      const value = arg.slice("--jsonl=".length);
      if (!isJsonlMode(value)) {
        throw new Error(`Invalid --jsonl value: ${value} (expected: ${JSONL_MODES.join(", ")})`);
      }
      result.jsonlMode = value;
    } else if (arg === "--grep") {
      i++;
      result.grep = takeValue(argv, i, arg);
    } else if (arg === "--since") {
      i++;
      result.since = takeValue(argv, i, arg);
    } else if (arg === "--last-turn") {
      i++;
      result.lastTurn = takeNumber(argv, i, arg);
    } else if (arg === "--last-since") {
      i++;
      result.lastSince = takeValue(argv, i, arg);
    } else if (arg === "-A" || arg === "--after") {
      i++;
      result.after = takeNumber(argv, i, arg);
    } else if (arg === "-B" || arg === "--before") {
      i++;
      result.before = takeNumber(argv, i, arg);
    } else if (arg === "-C" || arg === "--context") {
      i++;
      const n = takeNumber(argv, i, arg);
      result.before = n;
      result.after = n;
    } else if (arg === "--help") {
      result.help = true;
    } else if (arg.startsWith("-") && arg !== "-") {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
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
    result.help = true;
  }

  return result;
}
