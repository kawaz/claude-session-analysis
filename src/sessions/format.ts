import type { SessionInfo } from "./search.ts";
import { lastSegments } from "../lib.ts";

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
 * 1セッションの出力行をフォーマット。
 * sh版: printf"%s\t%s\t%s\t%s%s\n",ago($e->[1]),h($e->[2]),$sid,$dir,$ctx
 */
export function formatSessionLine(
  session: SessionInfo,
  opts: FormatOptions & { now: number },
): string {
  const age = opts.now - session.mtime;
  const agoStr = formatAgo(age);
  const sizeStr = formatHumanSize(session.size);

  const sid = opts.full
    ? session.sessionId
    : session.sessionId.slice(0, 8);

  // sh版: unless($full){$dir=~s|.*/([^/]+/[^/]+)$|$1|}
  const dir = opts.full
    ? session.cwd
    : lastSegments(session.cwd, 2);

  const ctx = session.context ? `\t${session.context}` : "";

  return `${agoStr}\t${sizeStr}\t${sid}\t${dir}${ctx}`;
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

  // tail 制限
  const output = opts.tail > 0 && filtered.length > opts.tail
    ? filtered.slice(-opts.tail)
    : filtered;

  for (const session of output) {
    lines.push(formatSessionLine(session, { full: opts.full, now }));
  }

  return lines.join("\n");
}
