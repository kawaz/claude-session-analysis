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

/** 行内マーカーを検出し、ANSIカラー+絵文字を付与 */
export function colorize(line: string): string {
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

  if (kind === "U") {
    return `${ansi}\n\n${emoji} ${beforeMarker}${marker}${afterMarker}\x1b[0m`;
  }
  return `${ansi}${emoji} ${beforeMarker}${marker}${afterMarker}\x1b[0m`;
}

/** 単一イベントをフォーマット */
export function formatEvent(
  event: TimelineEvent,
  opts: { rawMode: number; width: number; timestamps: boolean },
): string {
  if (opts.rawMode > 0) {
    return `${event.kind}${event.ref}`;
  }

  let desc: string;
  if (event.notrunc) {
    desc = event.desc;
  } else {
    desc = truncate(event.desc.replace(/\n/g, " "), opts.width);
  }

  if (opts.timestamps) {
    return `${cleanTime(event.time)} ${event.kind}${event.ref} ${desc}`;
  }
  return `${event.kind}${event.ref} ${desc}`;
}

/** 複数イベントをフォーマットして結合 */
export function formatEvents(
  events: TimelineEvent[],
  opts: { rawMode: number; width: number; timestamps: boolean; colors: boolean },
): string {
  const lines = events.map((e) => {
    let line = formatEvent(e, opts);
    if (opts.colors) {
      line = colorize(line);
    }
    return line;
  });
  return lines.join("\n");
}
