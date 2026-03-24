import type { SessionInfo, SessionStats } from "./search.ts";
import { formatTzOffset } from "../lib.ts";

export interface FormatOptions {
  now?: number; // テスト用に固定可能なUnix epoch seconds
}

export interface OutputOptions extends FormatOptions {
  tail: number;
  command?: string;
  commandComputed?: string;
  commandHelp?: string;
}

/**
 * sh版の h() 相当: ファイルサイズを人間可読形式にフォーマット。
 * 1e9ベースの単位系（K=1e3, M=1e6, G=1e9）。
 * 右寄せ8文字幅。
 */
export function formatHumanSize(bytes: number): string {
  const WIDTH = 4;
  let v: number;
  let u: string;
  if (bytes >= 1e9) {
    v = bytes / 1e9;
    u = "G";
  } else if (bytes >= 1e6) {
    v = bytes / 1e6;
    u = "M";
  } else {
    v = bytes / 1e3;
    u = "K";
  }

  let str: string;
  if (v >= 10) {
    str = `${Math.floor(v)}${u}`;
  } else {
    str = `${v.toFixed(1)}${u}`;
  }
  return str.padStart(WIDTH);
}

/**
 * sh版の ago() 相当: 経過秒数を人間可読形式にフォーマット。
 * "%2d%s" 形式。
 */
export function formatAgo(seconds: number): string {
  let v: number;
  let u: string;
  if (seconds < 60) {
    v = seconds;
    u = "s";
  } else if (seconds < 3600) {
    v = Math.floor(seconds / 60);
    u = "m";
  } else if (seconds < 86400) {
    v = Math.floor(seconds / 3600);
    u = "h";
  } else {
    v = Math.floor(seconds / 86400);
    u = "d";
  }
  return `${v.toString().padStart(2)}${u}`;
}

/**
 * duration秒を ##.#[dhms] 形式でフォーマット（右寄せ8文字幅）。
 */
export function formatDuration(seconds: number): string {
  const WIDTH = 3;
  let v: number;
  let u: string;
  if (seconds >= 86400) {
    v = seconds / 86400;
    u = "d";
  } else if (seconds >= 3600) {
    v = seconds / 3600;
    u = "h";
  } else if (seconds >= 60) {
    v = seconds / 60;
    u = "m";
  } else {
    v = seconds;
    u = "s";
  }
  return `${Math.floor(v)}${u}`.padStart(WIDTH);
}

/**
 * Unix epoch seconds をローカルタイムゾーン付き ISO8601 にフォーマット。
 * 例: 2026-03-06T10:30:00+09:00
 */
export function formatDateTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${formatTzOffset(d)}`;
}


/**
 * 1セッションの出力行をフォーマット。
 * format: end dur size sid path [context]
 */
export function formatSessionLine(
  session: SessionInfo,
  opts: FormatOptions & { now: number },
): string {
  const endStr = formatDateTime(session.endTime).replace(/[+-]\d{2}:\d{2}$/, "");
  const duration = Math.max(0, session.endTime - session.startTime);
  const durStr = formatDuration(duration);
  const sizeStr = formatHumanSize(session.size);
  const turnStr = String(session.turns).padStart(4);
  const path = session.cwd;
  const ctx = session.context ? `  ${session.context}` : "";
  return `${endStr}  ${durStr}  ${sizeStr}  ${turnStr}  ${session.sessionId.slice(0, 8)}  ${path}${ctx}`;
}

/**
 * セッション一覧をJSONL形式でフォーマット。
 * 各行は1セッションの集計情報を含むJSON。
 */
export function formatSessionsJsonl(
  filtered: SessionInfo[],
  opts: { tail: number },
): string {
  const output = opts.tail > 0 && filtered.length > opts.tail
    ? filtered.slice(-opts.tail)
    : filtered;

  if (output.length === 0) return "";

  const lines: string[] = [];
  for (const s of output) {
    const obj: Record<string, unknown> = {
      sessionId: s.sessionId,
      file: s.file,
      cwd: s.cwd,
      startTime: formatDateTime(s.startTime),
      endTime: formatDateTime(s.endTime),
      duration_ms: Math.max(0, s.endTime - s.startTime) * 1000,
      bytes: s.size,
      lines: s.lines,
      turns: s.turns,
    };
    if (s.context) {
      obj.context = s.context;
    }
    lines.push(JSON.stringify(obj));
  }
  return lines.join("\n");
}

/**
 * 全セッション出力（ヘッダ + セッション行）をフォーマット。
 */
export function formatSessionsOutput(
  stats: SessionStats,
  filtered: SessionInfo[],
  opts: OutputOptions,
): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const lines: string[] = [];

  // メタ情報ヘッダ（command / command_computed / command_help / now）
  if (opts.command) lines.push(`# command: ${opts.command}`);
  if (opts.commandComputed) lines.push(`# command_computed: ${opts.commandComputed}`);
  if (opts.commandHelp) lines.push(`# command_help: ${opts.commandHelp}`);
  const nowStr = new Date(now * 1000).toISOString();
  lines.push(`# now: ${nowStr}`);

  // ヘッダ行: # N sessions (oldest_ago .. newest_ago)
  if (stats.total > 0) {
    const oldestAgo = formatAgo(now - stats.oldestMtime);
    const newestAgo = formatAgo(now - stats.newestMtime);
    lines.push(
      `# ${stats.total} sessions (${oldestAgo} .. ${newestAgo})`,
    );
  }

  // カラムヘッダ（タイムゾーンオフセット付き）
  const tsHeader = `TIMESTAMP_END${formatTzOffset(new Date())}`;
  lines.push(
    `${tsHeader.padEnd(19)}  ${"DUR".padStart(3)}  ${"SIZE".padStart(4)}  TURN  SESSION8  PATH`,
  );

  // tail 制限
  const output = opts.tail > 0 && filtered.length > opts.tail
    ? filtered.slice(-opts.tail)
    : filtered;

  for (const session of output) {
    lines.push(formatSessionLine(session, { now }));
  }

  return lines.join("\n");
}
