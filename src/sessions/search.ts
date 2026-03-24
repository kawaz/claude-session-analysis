import { stat } from "node:fs/promises";
import { isUserTurn } from "../lib.ts";

/**
 * duration文字列を秒数に変換する。
 * 対応形式: "5m", "1h", "30s", "2d", "1h30m" など
 * s=秒, m=分, h=時, d=日
 */
export function parseDuration(spec: string): number {
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  let total = 0;
  const re = /(\d+)([smhd])/g;
  let match;
  while ((match = re.exec(spec)) !== null) {
    total += parseInt(match[1]!, 10) * units[match[2]!]!;
  }
  return total;
}

export interface SessionInfo {
  file: string;
  mtime: number; // Unix epoch seconds
  startTime: number; // Unix epoch seconds (from first JSONL line timestamp)
  endTime: number; // Unix epoch seconds (from last JSONL line timestamp)
  size: number;
  sessionId: string;
  cwd: string;
  turns: number; // Uイベント（ユーザーターン）の数
  lines: number; // JSONLファイルの行数（空行除く）
  context?: string; // keyword search context
}

export interface SessionStats {
  total: number;       // stat取得できた有効ファイル総数
  oldestMtime: number; // 最古のmtime (Unix epoch seconds)
  newestMtime: number; // 最新のmtime (Unix epoch seconds)
}

export interface SearchResult {
  sessions: SessionInfo[];
  stats: SessionStats;
}

export interface SearchOptions {
  configDirs: string[];
  since?: number; // Unix epoch seconds (cutoff): sessions with mtime >= since are included
  keyword?: string;
  path?: string; // cwd を正規表現でフィルタ
  files?: string[]; // 直接指定のファイルリスト（指定時はglob検索をスキップ）
}

/**
 * セッションJSONLファイルを検索し、メタ情報を返す。
 * sh版の grep + perl 相当をTS化。
 */
export async function searchSessions(
  opts: SearchOptions,
): Promise<SearchResult> {
  const { configDirs, since, keyword, path, files } = opts;

  let allFiles: string[];
  if (files) {
    // 直接指定のファイルリスト
    allFiles = files;
  } else {
    // 1. projects/ ディレクトリを収集
    const projectDirs: string[] = [];
    for (const dir of configDirs) {
      const pDir = `${dir}/projects`;
      try {
        const s = await stat(pDir);
        if (s.isDirectory()) projectDirs.push(pDir);
      } catch {
        // ディレクトリが存在しない
      }
    }

    // 2. *.jsonl ファイルを Glob で検索（agent-*.jsonl は除外）
    const glob = new Bun.Glob("**/*.jsonl");
    allFiles = [];
    for (const pDir of projectDirs) {
      for await (const match of glob.scan(pDir)) {
        // agent-*.jsonl を除外
        const filename = match.split("/").pop() ?? "";
        if (filename.startsWith("agent-")) continue;
        allFiles.push(`${pDir}/${match}`);
      }
    }
  }

  // 3. stat を並列取得
  const statResults = await Promise.all(
    allFiles.map(async (file) => {
      try {
        const s = await stat(file);
        if (s.size === 0) return null;
        const mtime = Math.floor(s.mtimeMs / 1000);
        return { file, size: s.size, mtime };
      } catch {
        return null;
      }
    }),
  );
  const allValidFiles = statResults.filter((r) => r != null);

  // 3.5. stats を計算（フィルタ前の全ファイル統計、高速）
  const stats: SessionStats = {
    total: allValidFiles.length,
    oldestMtime: allValidFiles.length > 0
      ? Math.min(...allValidFiles.map((f) => f.mtime))
      : 0,
    newestMtime: allValidFiles.length > 0
      ? Math.max(...allValidFiles.map((f) => f.mtime))
      : 0,
  };

  // 3.6. since で早期フィルタ
  const validFiles = since != null
    ? allValidFiles.filter((f) => f.mtime >= since)
    : allValidFiles;

  // 4. ファイル内容を並列読み込み + メタ情報抽出（JSON.parseベース）
  const parseFile = async (entry: { file: string; size: number; mtime: number }): Promise<SessionInfo | null> => {
    const text = await Bun.file(entry.file).text();
    const lines = text.split("\n");
    let sessionId = "?";
    let cwd = "?";
    let startTime = 0;
    let endTime = 0;
    let turns = 0;
    let lineCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === "") continue;
      lineCount++;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      // timestamp: 最初と最後
      if (obj.timestamp) {
        const ts = Math.floor(new Date(obj.timestamp).getTime() / 1000);
        if (startTime === 0) startTime = ts;
        endTime = ts;
      }

      // sessionId / cwd: 最初に見つかったもの
      if (cwd === "?" && obj.cwd) {
        if (obj.sessionId) sessionId = obj.sessionId;
        cwd = obj.cwd;
      }

      // ターンカウント: isUserTurn() で統一判定
      if (isUserTurn(obj as Record<string, unknown>)) {
        turns++;
      }
    }

    if (startTime === 0) startTime = entry.mtime;
    if (endTime === 0) endTime = entry.mtime;
    if (cwd === "?" && sessionId === "?") return null;
    return { file: entry.file, mtime: entry.mtime, startTime, endTime, size: entry.size, sessionId, cwd, turns, lines: lineCount };
  };

  const parseResults = await Promise.all(validFiles.map(parseFile));
  const all = parseResults.filter((r) => r != null);

  // 5. path フィルタ（cwd を正規表現でマッチ）
  let filtered = all;
  if (path) {
    const re = new RegExp(path);
    filtered = filtered.filter((e) => re.test(e.cwd));
  }

  // 6. キーワード検索（正規表現対応、並列、全マッチ行を収集）
  if (keyword) {
    const re = new RegExp(keyword);
    const searchFile = async (e: SessionInfo): Promise<SessionInfo | null> => {
      const text = await Bun.file(e.file).text();
      const lines = text.split("\n");
      let firstCtx = "";
      let matchCount = 0;
      for (const line of lines) {
        const m = re.exec(line);
        if (m) {
          matchCount++;
          if (matchCount === 1) {
            const idx = m.index;
            const matchLen = m[0].length;
            const preStart = Math.max(0, idx - 20);
            let pre = line.slice(preStart, idx);
            pre = pre.replace(/.*\n/s, "");
            let post = line.slice(idx + matchLen, idx + matchLen + 50);
            post = post.replace(/\n.*/s, "");
            firstCtx = `${pre}${m[0]}${post}`.replace(/[\r\n]/g, " ");
          }
        }
      }
      if (matchCount === 0) return null;
      const ctx = `[${matchCount} hit${matchCount > 1 ? "s" : ""}] ${firstCtx}`;
      return { ...e, context: ctx };
    };
    const matchResults = await Promise.all(filtered.map(searchFile));
    filtered = matchResults.filter((r) => r != null);
  }

  // 7. mtime昇順ソート
  filtered.sort((a, b) => a.mtime - b.mtime);

  return { sessions: filtered, stats };
}
