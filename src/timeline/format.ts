import type { TimelineEvent } from "./types.ts";
import { truncate } from "../lib.ts";

/** ソートサフィックス _NNNNN を除去 */
export function cleanTime(time: string): string {
  return time.split("_")[0];
}

/** ローカルタイムゾーン付き ISO8601 (秒精度) に変換 */
export function localTime(time: string): string {
  const d = new Date(time.split("_")[0]);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}

/** ローカルタイムゾーン付き ISO8601 (ミリ秒精度, now用) */
export function localTimeMs(): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}${sign}${hh}${mm}`;
}

const EMOJI_MAP: Record<string, string> = {
  U: "👤",
  T: "🧠",
  R: "🤖",
  Q: "🤖",
  B: "▶️",
  F: "👀",
  W: "🛜",
  S: "⚡️",
  G: "🔍",
  A: "👻",
  D: "✅",
  I: "ℹ️",
};

const ANSI_MAP: Record<string, string> = {
  U: "\x1b[32m",
  T: "\x1b[3;34m",
  R: "\x1b[34m",
  Q: "\x1b[34m",
  B: "\x1b[2m",
  F: "\x1b[2m",
  W: "\x1b[2m",
  S: "\x1b[2m",
  G: "\x1b[2m",
  A: "\x1b[2m",
  D: "\x1b[2m",
  I: "\x1b[2m",
};

/** colorize のオプション */
export interface ColorizeOpts {
  colors: boolean;
  emoji: boolean;
}

/** 行全体にANSIカラーを付与 */
export function colorize(line: string, opts?: ColorizeOpts): string {
  const useColors = opts?.colors ?? true;
  if (!useColors) return line;

  // 行内から kind 文字を検出してカラーを決定
  // フォーマット: {emoji?} {timestamp?} {kind}{ref} {turn} ...
  const m = line.match(/([UTRFWBGASQDI])[0-9a-f]{8} \d+/);
  if (!m) return line;

  const kind = m[1];
  const ansi = ANSI_MAP[kind];
  if (!ansi) return line;

  return `${ansi}${line}\x1b[0m`;
}

/** QTRU タイプかどうか */
const QTRU_KINDS = new Set(["Q", "T", "R", "U"]);

/** イベントの emoji を取得 */
function eventEmoji(event: TimelineEvent): string {
  if (event.kind === "F") {
    if (event.desc.includes("no-backup-") || /@v/.test(event.desc)) {
      return "📝";
    }
    return "👀";
  }
  return EMOJI_MAP[event.kind] || "";
}

/** 単一イベントをフォーマット: {emoji?} {timestamp?} {kind}{ref} {turn} {content} */
export function formatEvent(
  event: TimelineEvent,
  opts: { jsonlMode: "none" | "redact" | "full"; width: number; timestamps: boolean; mdMode?: "none" | "render" | "source"; emoji?: boolean },
): string {
  const useEmoji = opts.emoji ?? false;
  const emojiPrefix = useEmoji ? `${eventEmoji(event)} ` : "";

  if (opts.jsonlMode !== "none") {
    return `${event.kind}${event.ref} ${event.turn}`;
  }

  const isMd = opts.mdMode === "render" || opts.mdMode === "source";
  const fmtTime = isMd ? localTime : cleanTime;

  const head = opts.timestamps
    ? `${emojiPrefix}${fmtTime(event.time)} ${event.kind}${event.ref} ${event.turn}`
    : `${emojiPrefix}${event.kind}${event.ref} ${event.turn}`;

  if (isMd && QTRU_KINDS.has(event.kind)) {
    return head;
  }

  let desc: string;
  if (isMd || event.notrunc) {
    desc = event.notrunc ? event.desc : event.desc.replace(/\n/g, " ");
  } else {
    desc = truncate(event.desc.replace(/\n/g, " "), opts.width);
  }

  return `${head} ${desc}`;
}

/** formatEvents のオプション型 */
export interface FormatEventsOpts {
  jsonlMode: "none" | "redact" | "full";
  width: number;
  timestamps: boolean;
  colors: boolean;
  emoji: boolean;
  mdMode: "none" | "render" | "source";
}

/** mdモード用 YAML front matter を生成 */
export function mdFrontMatter(command: string, commandComputed: string, commandHelp: string, now: string): string {
  return `---\ncommand: ${command}\ncommand_computed: ${commandComputed}\ncommand_help: ${commandHelp}\nnow: ${now}\n---\n\n`;
}

/** 複数イベントをフォーマットして結合 */
export function formatEvents(
  events: TimelineEvent[],
  opts: FormatEventsOpts,
): string {
  const isMd = opts.mdMode === "render" || opts.mdMode === "source";

  const output: string[] = [];
  let mdQtruSeen = false;
  for (const e of events) {
    let line = formatEvent(e, opts);
    if (opts.colors) {
      line = colorize(line, { colors: opts.colors, emoji: opts.emoji });
    }

    if (isMd && QTRU_KINDS.has(e.kind)) {
      if (mdQtruSeen) {
        output.push("");
        output.push("---");
        output.push("");
      }
      mdQtruSeen = true;
      output.push(line);
      output.push("");
      output.push(e.desc);
      output.push("");
    } else {
      output.push(line);
    }
  }
  return output.join("\n");
}
