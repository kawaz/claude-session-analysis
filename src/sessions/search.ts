import { stat } from "node:fs/promises";
import { isUserTurn, classifyUserTurn, parseDuration, findForkSplit } from "../lib.ts";

export { parseDuration };

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
  effectiveUserTurns: number; // turns のうち classifyUserTurn が "effective" のもの（hidden_tag/short_ascii/slash_only は除外）
  forkedFrom: string | null; // フォーク元 session ID（entry の forkedFrom.sessionId。fork でなければ null）
  forkFirstNewUuid: string | null; // フォーク後最初の新規 entry の uuid（fork でなければ null）
  context?: string; // keyword search context (multi-keyword は " | " 区切りで連結)
}

export interface SessionStats {
  total: number; // stat取得できた有効ファイル総数
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
  keywords?: string[]; // 複数指定時は全キーワードを含むセッション (AND)。各キーワードは行単位 OR
  path?: string; // cwd を正規表現でフィルタ
  files?: string[]; // 直接指定のファイルリスト（指定時はglob検索をスキップ）
}

/**
 * セッションJSONLファイルを検索し、メタ情報を返す。
 * sh版の grep + perl 相当をTS化。
 */
export async function searchSessions(opts: SearchOptions): Promise<SearchResult> {
  const { configDirs, since, keywords, path, files } = opts;

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
    oldestMtime: allValidFiles.length > 0 ? Math.min(...allValidFiles.map((f) => f.mtime)) : 0,
    newestMtime: allValidFiles.length > 0 ? Math.max(...allValidFiles.map((f) => f.mtime)) : 0,
  };

  // 3.6. since で早期フィルタ
  const validFiles = since != null ? allValidFiles.filter((f) => f.mtime >= since) : allValidFiles;

  // 4. ファイル内容を並列読み込み + メタ情報抽出（JSON.parseベース）
  const parseFile = async (entry: {
    file: string;
    size: number;
    mtime: number;
  }): Promise<SessionInfo | null> => {
    let text: string;
    try {
      text = await Bun.file(entry.file).text();
    } catch {
      return null;
    }
    const lines = text.split("\n");
    let sessionId = "?";
    let cwd = "?";
    let startTime = 0;
    let endTime = 0;
    let turns = 0;
    let effectiveUserTurns = 0;
    let lineCount = 0;
    // fork 検出（findings 2026-05-29-btw-fork-session-recording に従う）。
    // 境界判定ロジックは lib.ts の findForkSplit に集約（timeline / sessions の単一の正）。
    // ここでは fork 判定に必要な最小情報（type / uuid / forkedFrom）だけを軽量に蓄積し、
    // ループ後に findForkSplit へ渡す（全 obj を保持してメモリを増やさないため）。
    const forkEntries: { type?: unknown; uuid?: unknown; forkedFrom?: { sessionId?: unknown } }[] =
      [];

    type JsonlRow = {
      type?: unknown;
      uuid?: unknown;
      cwd?: unknown;
      sessionId?: unknown;
      timestamp?: unknown;
      forkedFrom?: { sessionId?: unknown };
      isMeta?: unknown;
      isCompactSummary?: unknown;
      message?: { content?: unknown };
    };
    for (const line of lines) {
      if (line.trim() === "") continue;
      lineCount++;
      let obj: JsonlRow;
      try {
        obj = JSON.parse(line) as JsonlRow;
      } catch {
        continue;
      }

      // timestamp: 最初と最後
      if (typeof obj.timestamp === "string" && obj.timestamp) {
        const ts = Math.floor(new Date(obj.timestamp).getTime() / 1000);
        if (startTime === 0) startTime = ts;
        endTime = ts;
      }

      // sessionId / cwd: 最初に見つかったもの
      if (cwd === "?" && typeof obj.cwd === "string" && obj.cwd) {
        if (typeof obj.sessionId === "string") sessionId = obj.sessionId;
        cwd = obj.cwd;
      }

      // fork 判定用に最小情報を蓄積（境界判定は findForkSplit が行う）
      forkEntries.push({ type: obj.type, uuid: obj.uuid, forkedFrom: obj.forkedFrom });

      // ターンカウント: isUserTurn() で統一判定
      if (isUserTurn(obj)) {
        turns++;
        if (classifyUserTurn(obj) === "effective") {
          effectiveUserTurns++;
        }
      }
    }

    if (startTime === 0) startTime = entry.mtime;
    if (endTime === 0) endTime = entry.mtime;
    if (cwd === "?" && sessionId === "?") return null;

    const split = findForkSplit(forkEntries);
    const forkedFrom = split.parentSessionId;
    const forkFirstNewUuid = split.forkFirstNewUuid;
    return {
      file: entry.file,
      mtime: entry.mtime,
      startTime,
      endTime,
      size: entry.size,
      sessionId,
      cwd,
      turns,
      lines: lineCount,
      effectiveUserTurns,
      forkedFrom,
      forkFirstNewUuid,
    };
  };

  const parseResults = await Promise.all(validFiles.map(parseFile));
  const all = parseResults.filter((r) => r != null);

  // 5. path フィルタ（cwd を正規表現でマッチ）
  let filtered = all;
  if (path) {
    const re = new RegExp(path);
    filtered = filtered.filter((e) => re.test(e.cwd));
  }

  // 6. キーワード検索（正規表現対応、並列）
  //    複数キーワード指定時はセッション単位 AND（各キーワードが少なくとも1行にマッチ）。
  //    context は各キーワードの最初のヒット周辺を " | " で連結。
  if (keywords && keywords.length > 0) {
    const res = keywords.map((k) => new RegExp(k));
    const searchFile = async (e: SessionInfo): Promise<SessionInfo | null> => {
      const text = await Bun.file(e.file).text();
      const lines = text.split("\n");
      const firstCtx: (string | null)[] = res.map(() => null);
      const hitCounts: number[] = res.map(() => 0);
      for (const line of lines) {
        for (let k = 0; k < res.length; k++) {
          const re = res[k];
          if (!re) continue;
          const m = re.exec(line);
          if (m) {
            hitCounts[k] = (hitCounts[k] ?? 0) + 1;
            if (firstCtx[k] === null) {
              const idx = m.index;
              const matchLen = m[0].length;
              const preStart = Math.max(0, idx - 20);
              let pre = line.slice(preStart, idx);
              pre = pre.replace(/.*\n/s, "");
              let post = line.slice(idx + matchLen, idx + matchLen + 50);
              post = post.replace(/\n.*/s, "");
              firstCtx[k] = `${pre}${m[0]}${post}`.replace(/[\r\n]/g, " ");
            }
          }
        }
      }
      // AND: いずれかのキーワードがゼロヒットならセッション全体を捨てる
      if (firstCtx.some((c) => c === null)) return null;
      const totalHits = hitCounts.reduce((a, b) => a + b, 0);
      const header =
        res.length === 1
          ? `[${totalHits} hit${totalHits > 1 ? "s" : ""}]`
          : `[${totalHits} hits / ${res.length} kw]`;
      const ctx = `${header} ${firstCtx.join(" | ")}`;
      return { ...e, context: ctx };
    };
    const matchResults = await Promise.all(filtered.map(searchFile));
    filtered = matchResults.filter((r) => r != null);
  }

  // 7. mtime昇順ソート
  filtered.sort((a, b) => a.mtime - b.mtime);

  return { sessions: filtered, stats };
}
