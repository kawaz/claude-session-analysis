import type { SessionInfo } from "./search.ts";

export interface FormatOptions {
  full: boolean;
  now?: number; // テスト用に固定可能なUnix epoch seconds
}

export interface OutputOptions extends FormatOptions {
  tail: number;
}

/**
 * sh版の h() 相当: ファイルサイズを人間可読形式にフォーマット。
 * 1e9ベースの単位系（K=1e3, M=1e6, G=1e9）。
 * 右寄せ8文字幅。
 */
export function formatHumanSize(bytes: number): string {
  const WIDTH = 8;
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
  if (v >= 100) {
    str = `${Math.floor(v)}${u}`;
  } else if (v >= 10) {
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
  const WIDTH = 8;
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
  // 100d以上: ####d、それ以外: ##.#[dhms]
  const str = (u === "d" && v >= 100) ? `${Math.floor(v)}${u}` : `${v.toFixed(1)}${u}`;
  return str.padStart(WIDTH);
}

/**
 * Unix epoch seconds をローカルタイムゾーン付き ISO8601 にフォーマット。
 * 例: 2026-03-06T10:30:00+09:00
 */
export function formatDateTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const oh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const om = String(Math.abs(off) % 60).padStart(2, "0");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${oh}:${om}`;
}

/**
 * cwdからプロジェクトパスを抽出。
 * full=false: repos/ 以降を返す（repos/がなければ末尾2セグメント）
 * full=true: フルパス
 */
export function formatProjectPath(cwd: string, full: boolean): string {
  if (full) return cwd;
  const reposIdx = cwd.indexOf("/repos/");
  if (reposIdx !== -1) {
    return cwd.slice(reposIdx + "/repos/".length);
  }
  // repos/ がなければ末尾2セグメント
  const segments = cwd.split("/").filter((s) => s !== "");
  if (segments.length <= 2) return cwd;
  return segments.slice(-2).join("/");
}

/**
 * 1セッションの出力行をフォーマット。
 * format: dur end sid path [context]
 */
export function formatSessionLine(
  session: SessionInfo,
  opts: FormatOptions & { now: number },
): string {
  const endStr = formatDateTime(session.endTime);
  const duration = Math.max(0, session.endTime - session.startTime);
  const durStr = formatDuration(duration);
  const sizeStr = formatHumanSize(session.size);

  const sid = opts.full
    ? session.sessionId
    : session.sessionId.slice(0, 8);

  const path = formatProjectPath(session.cwd, opts.full);

  const ctx = session.context ? `  ${session.context}` : "";

  return `${endStr} ${durStr} ${sizeStr} ${sid} ${path}${ctx}`;
}

/**
 * 全セッション出力（ヘッダ + セッション行）をフォーマット。
 */
export function formatSessionsOutput(
  allSessions: SessionInfo[],
  filtered: SessionInfo[],
  opts: OutputOptions,
): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const lines: string[] = [];

  // ヘッダ行: # N sessions (oldest_ago .. newest_ago)
  if (allSessions.length > 0) {
    const oldest = allSessions[0]!;
    const newest = allSessions[allSessions.length - 1]!;
    const oldestAgo = formatAgo(now - oldest.mtime);
    const newestAgo = formatAgo(now - newest.mtime);
    lines.push(
      `# ${allSessions.length} sessions (${oldestAgo} .. ${newestAgo})`,
    );
  }

  // カラムヘッダ
  const sidWidth = opts.full ? 36 : 8;
  const sidLabel = (opts.full ? "SESSION_ID" : "SESSION8").padEnd(sidWidth);
  lines.push(
    `${"END".padEnd(25)} ${"DURATION".padStart(8)} ${"FILESIZE".padStart(8)} ${sidLabel} PATH`,
  );

  // tail 制限
  const output = opts.tail > 0 && filtered.length > opts.tail
    ? filtered.slice(-opts.tail)
    : filtered;

  for (const session of output) {
    lines.push(formatSessionLine(session, { full: opts.full, now }));
  }

  return lines.join("\n");
}
