import type { TimelineEvent } from "./types.ts";
import { truncate } from "../lib.ts";

/** ソートサフィックス _NNNNN を除去 */
export function cleanTime(time: string): string {
  return time.split("_")[0];
}

const MARKER_RE = /([UTRFWBGASQDI])([0-9a-f]{8})/;

const COLOR_MAP: Record<string, { ansi: string; emoji: string }> = {
  U: { ansi: "\x1b[32m", emoji: "👤" },
  T: { ansi: "\x1b[3;34m", emoji: "🧠" },
  R: { ansi: "\x1b[34m", emoji: "🤖" },
  Q: { ansi: "\x1b[34m", emoji: "🤖" },
  B: { ansi: "\x1b[2m", emoji: "▶️" },
  F: { ansi: "\x1b[2m", emoji: "👀" }, // default for F; overridden dynamically
  W: { ansi: "\x1b[2m", emoji: "🛜" },
  S: { ansi: "\x1b[2m", emoji: "⚡️" },
  G: { ansi: "\x1b[2m", emoji: "🔍" },
  A: { ansi: "\x1b[2m", emoji: "👻" },
  D: { ansi: "\x1b[2m", emoji: "✅" },
  I: { ansi: "\x1b[2m", emoji: "ℹ️" },
};

/** colorize のオプション */
export interface ColorizeOpts {
  colors: boolean;
  emoji: boolean;
}

/** 行内マーカーを検出し、ANSIカラー+絵文字を付与 */
export function colorize(line: string, opts?: ColorizeOpts): string {
  // デフォルト: 後方互換のため両方true
  const useColors = opts?.colors ?? true;
  const useEmoji = opts?.emoji ?? true;

  // 両方無効なら何もしない
  if (!useColors && !useEmoji) return line;

  const m = MARKER_RE.exec(line);
  if (!m) return line;

  const kind = m[1];
  const marker = m[0];
  const idx = m.index;
  const beforeMarker = line.slice(0, idx);
  const afterMarker = line.slice(idx + marker.length);

  const color = COLOR_MAP[kind];
  if (!color) return line;

  let { ansi, emoji } = color;

  // F の絵文字は条件分岐
  if (kind === "F") {
    if (afterMarker.includes("no-backup-") || /@v/.test(afterMarker)) {
      emoji = "📝";
    } else {
      emoji = "👀";
    }
  }

  const emojiPrefix = useEmoji ? `${emoji} ` : "";
  const ansiStart = useColors ? ansi : "";
  const ansiEnd = useColors ? "\x1b[0m" : "";

  if (kind === "U") {
    return `${ansiStart}\n\n${emojiPrefix}${beforeMarker}${marker}${afterMarker}${ansiEnd}`;
  }
  return `${ansiStart}${emojiPrefix}${beforeMarker}${marker}${afterMarker}${ansiEnd}`;
}

/** QTRU タイプかどうか */
const QTRU_KINDS = new Set(["Q", "T", "R", "U"]);

/** 単一イベントをフォーマット */
export function formatEvent(
  event: TimelineEvent,
  opts: { rawMode: number; width: number; timestamps: boolean; mdMode?: "off" | "render" | "source" },
): string {
  if (opts.rawMode > 0) {
    return `${event.kind}${event.ref}`;
  }

  const isMd = opts.mdMode === "render" || opts.mdMode === "source";

  // mdモードでQTRUの場合: マーカー行のみ（descなし）
  if (isMd && QTRU_KINDS.has(event.kind)) {
    if (opts.timestamps) {
      return `${cleanTime(event.time)} ${event.kind}${event.ref}`;
    }
    return `${event.kind}${event.ref}`;
  }

  let desc: string;
  if (isMd || event.notrunc) {
    // mdモードではtruncateしない
    desc = event.notrunc ? event.desc : event.desc.replace(/\n/g, " ");
  } else {
    desc = truncate(event.desc.replace(/\n/g, " "), opts.width);
  }

  if (opts.timestamps) {
    return `${cleanTime(event.time)} ${event.kind}${event.ref} ${desc}`;
  }
  return `${event.kind}${event.ref} ${desc}`;
}

/** formatEvents のオプション型 */
export interface FormatEventsOpts {
  rawMode: number;
  width: number;
  timestamps: boolean;
  colors: boolean;
  emoji: boolean;
  mdMode: "off" | "render" | "source";
}

/** 複数イベントをフォーマットして結合 */
export function formatEvents(
  events: TimelineEvent[],
  opts: FormatEventsOpts,
): string {
  const isMd = opts.mdMode === "render" || opts.mdMode === "source";
  const needColorize = opts.colors || opts.emoji;

  const output: string[] = [];
  for (const e of events) {
    let line = formatEvent(e, opts);
    if (needColorize) {
      line = colorize(line, { colors: opts.colors, emoji: opts.emoji });
    }

    if (isMd && QTRU_KINDS.has(e.kind)) {
      // QTRU: マーカー行 + 空行 + desc本文 + 空行
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
