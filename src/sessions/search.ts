import { stat } from "node:fs/promises";

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
  size: number;
  sessionId: string;
  cwd: string;
  context?: string; // keyword search context
}

export interface SearchOptions {
  configDirs: string[];
  since?: number; // Unix epoch seconds (cutoff): sessions with mtime >= since are included
  keyword?: string;
}

/**
 * セッションJSONLファイルを検索し、メタ情報を返す。
 * sh版の grep + perl 相当をTS化。
 */
export async function searchSessions(
  opts: SearchOptions,
): Promise<SessionInfo[]> {
  const { configDirs, since, keyword } = opts;

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
  const allFiles: string[] = [];
  for (const pDir of projectDirs) {
    for await (const match of glob.scan(pDir)) {
      // agent-*.jsonl を除外
      const filename = match.split("/").pop() ?? "";
      if (filename.startsWith("agent-")) continue;
      allFiles.push(`${pDir}/${match}`);
    }
  }

  // 3. 各ファイルからメタ情報を抽出
  const all: SessionInfo[] = [];

  for (const file of allFiles) {
    let fileStat;
    try {
      fileStat = await stat(file);
    } catch {
      continue;
    }

    const size = fileStat.size;
    if (size === 0) continue;

    const mtime = Math.floor(fileStat.mtimeMs / 1000);

    // 最初の "cwd" を含む行からsessionIdとcwdを抽出
    // sh版: grep -m1 '"cwd"' で最初のcwd行を取得
    const text = await Bun.file(file).text();
    const lines = text.split("\n");
    let sessionId = "?";
    let cwd = "?";

    for (const line of lines) {
      if (line.includes('"cwd"')) {
        // sessionId抽出
        const sidMatch = line.match(/"sessionId"\s*:\s*"([^"]+)"/);
        if (sidMatch) sessionId = sidMatch[1]!;

        // cwd抽出（エスケープ文字対応）
        const cwdMatch = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (cwdMatch) cwd = cwdMatch[1]!;

        break;
      }
    }

    // sh版: grep -rm1 '"cwd"' で "cwd" を含む行がないファイルはスキップ
    if (cwd === "?" && sessionId === "?") {
      // cwdもsessionIdも見つからない = "cwd"行がない → スキップ
      continue;
    }

    all.push({ file, mtime, size, sessionId, cwd });
  }

  // 4. since フィルタ (cutoff: epoch seconds)
  let filtered = all;
  if (since != null) {
    filtered = all.filter((e) => e.mtime >= since);
  }

  // 5. キーワード検索（正規表現対応）
  if (keyword) {
    const re = new RegExp(keyword);
    const matched: SessionInfo[] = [];
    for (const e of filtered) {
      const text = await Bun.file(e.file).text();
      const lines = text.split("\n");
      for (const line of lines) {
        const match = re.exec(line);
        if (match) {
          // 前後20文字のコンテキスト
          const idx = match.index;
          const matchLen = match[0].length;
          const preStart = Math.max(0, idx - 20);
          let pre = line.slice(preStart, idx);
          // sh版: $pre=~s/.*\n//s → 改行以降を除去（行内なので不要だが念のため）
          pre = pre.replace(/.*\n/s, "");
          let post = line.slice(idx + matchLen, idx + matchLen + 20);
          post = post.replace(/\n.*/s, "");
          const ctx = `${pre}${match[0]}${post}`.replace(/[\r\n]/g, " ");
          matched.push({ ...e, context: ctx });
          break;
        }
      }
    }
    filtered = matched;
  }

  // 6. mtime昇順ソート
  filtered.sort((a, b) => a.mtime - b.mtime);

  return filtered;
}
