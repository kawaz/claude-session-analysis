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
 * 100以上 → "%3d", 10以上 → "%3d", それ以下 → "%3.1f"
 * 全体4文字幅。
 */
export function formatHumanSize(bytes: number): string {
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

  if (v >= 100) {
    return `${Math.floor(v).toString().padStart(3)}${u}`;
  } else if (v >= 10) {
    return `${Math.floor(v).toString().padStart(3)}${u}`;
  } else {
    return `${v.toFixed(1)}${u}`;
  }
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
 * duration秒を固定6文字幅でフォーマット。
 * < 1日: HHhMMm (例: "04h32m", "00h13m")
 * >= 1日: Nd 右寄せ (例: "    1d", "  100d")
 */
export function formatDuration(seconds: number): string {
  const WIDTH = 6;
  const d = Math.floor(seconds / 86400);
  if (d > 0) {
    return `${d}d`.padStart(WIDTH);
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h${String(m).padStart(2, "0")}m`.padStart(WIDTH);
  }
  if (m > 0) {
    return `${m}m`.padStart(WIDTH);
  }
  return `${seconds}s`.padStart(WIDTH);
}

/**
 * Unix epoch seconds をローカルの "MM/DD HH:MM" 形式にフォーマット。
 */
export function formatDateTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd}T${hh}:${mi}`;
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
 * format: start end (mtime_ago duration) sid path [context]
 */
export function formatSessionLine(
  session: SessionInfo,
  opts: FormatOptions & { now: number },
): string {
  const startStr = formatDateTime(session.startTime);
  const endStr = formatDateTime(session.endTime);
  const duration = Math.max(0, session.endTime - session.startTime);
  const durStr = formatDuration(duration);
  const sizeStr = formatHumanSize(session.size);

  const sid = opts.full
    ? session.sessionId
    : session.sessionId.slice(0, 8);

  const path = formatProjectPath(session.cwd, opts.full);

  const ctx = session.context ? `\t${session.context}` : "";

  return `${durStr}  ${endStr}\t${sizeStr}\t${sid}\t${path}${ctx}`;
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
  const sidLabel = opts.full ? "SessionId" : "SessId8 ";
  lines.push(
    `# ${"Start".padStart(6)}  ${"End".padEnd(11)}\tSize\t${sidLabel}\tPath`,
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
