/**
 * file-ops: Read/Write/Edit tool_use からファイル操作をパス毎に抽出する。
 */
import { isUserTurn } from "../lib.ts";

/** --summary 出力: パス毎のサマリ */
export interface FileOpSummary {
  Read: number;
  Write: number;
  path: string;
}

/** --ops 出力: 個別操作（フラット） */
export interface FileOpEntry {
  timestamp: string;
  turn: number;
  tool: string; // "Read" | "Write" | "Edit"
  path: string;
  snapshot?: string; // backupFileName ("hash@vN"), index.ts でフルパスに解決
  // --ops-detail 用の追加フィールド
  offset?: number;       // Read: 開始行
  limit?: number;        // Read: 行数制限
  old_string?: string;   // Edit: 置換前
  new_string?: string;   // Edit: 置換後
  content_lines?: number; // Write: content の行数
}

const FILE_OPS_TOOLS = new Set(["Read", "Write", "Edit"]);

/**
 * パース済みエントリの配列からファイル操作サマリをパス毎に抽出する。
 */
export function extractFileOps(entries: Record<string, unknown>[]): FileOpSummary[] {
  const pathMap = new Map<string, { Read: number; Write: number }>();

  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const content = message.content as Record<string, unknown>[] | undefined;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type !== "tool_use") continue;
      const name = block.name as string;
      if (!FILE_OPS_TOOLS.has(name)) continue;

      const input = block.input as Record<string, unknown> | undefined;
      if (!input) continue;
      const filePath = input.file_path as string | undefined;
      if (!filePath) continue;

      let rec = pathMap.get(filePath);
      if (!rec) {
        rec = { Read: 0, Write: 0 };
        pathMap.set(filePath, rec);
      }

      const category = name === "Edit" ? "Write" : name as "Read" | "Write";
      rec[category]++;
    }
  }

  const sorted = [...pathMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  return sorted.map(([path, rec]) => ({
    Read: rec.Read,
    Write: rec.Write,
    path,
  }));
}

/**
 * パース済みエントリの配列から個別操作をフラットに抽出する（--details 用）。
 * 時系列順（エントリ出現順）。
 */
export function extractFileOpsDetailed(entries: Record<string, unknown>[]): FileOpEntry[] {
  const snapshotMap = buildSnapshotMap(entries);
  const result: FileOpEntry[] = [];
  let turn = 0;

  for (const entry of entries) {
    if (isUserTurn(entry)) {
      turn++;
      continue;
    }
    if (entry.type !== "assistant") continue;
    const uuid = entry.uuid as string | undefined;
    const timestamp = entry.timestamp as string || "";
    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const content = message.content as Record<string, unknown>[] | undefined;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type !== "tool_use") continue;
      const name = block.name as string;
      if (!FILE_OPS_TOOLS.has(name)) continue;

      const input = block.input as Record<string, unknown> | undefined;
      if (!input) continue;
      const filePath = input.file_path as string | undefined;
      if (!filePath) continue;

      const op: FileOpEntry = { timestamp, turn, tool: name, path: filePath };
      if (uuid) {
        const snapshot = snapshotMap.get(uuid)?.get(filePath);
        if (snapshot) op.snapshot = snapshot;
      }
      result.push(op);
    }
  }

  return result;
}

/**
 * パース済みエントリの配列から個別操作を詳細付きで抽出する（--ops-detail 用）。
 * extractFileOpsDetailed の結果に加えて、各ツールの入力詳細を含む。
 */
export function extractFileOpsFullDetail(entries: Record<string, unknown>[]): FileOpEntry[] {
  const snapshotMap = buildSnapshotMap(entries);
  const result: FileOpEntry[] = [];
  let turn = 0;

  for (const entry of entries) {
    if (isUserTurn(entry)) {
      turn++;
      continue;
    }
    if (entry.type !== "assistant") continue;
    const uuid = entry.uuid as string | undefined;
    const timestamp = entry.timestamp as string || "";
    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const content = message.content as Record<string, unknown>[] | undefined;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type !== "tool_use") continue;
      const name = block.name as string;
      if (!FILE_OPS_TOOLS.has(name)) continue;

      const input = block.input as Record<string, unknown> | undefined;
      if (!input) continue;
      const filePath = input.file_path as string | undefined;
      if (!filePath) continue;

      const op: FileOpEntry = { timestamp, turn, tool: name, path: filePath };
      if (uuid) {
        const snapshot = snapshotMap.get(uuid)?.get(filePath);
        if (snapshot) op.snapshot = snapshot;
      }

      // ツール固有の詳細フィールドを追加
      if (name === "Read") {
        if (typeof input.offset === "number") op.offset = input.offset;
        if (typeof input.limit === "number") op.limit = input.limit;
      } else if (name === "Edit") {
        if (typeof input.old_string === "string") op.old_string = input.old_string;
        if (typeof input.new_string === "string") op.new_string = input.new_string;
      } else if (name === "Write") {
        const writeContent = input.content;
        if (typeof writeContent === "string") {
          op.content_lines = writeContent.split("\n").length;
        }
      }

      result.push(op);
    }
  }

  return result;
}

/**
 * messageId -> filePath -> backupFileName のマップを構築。
 */
function buildSnapshotMap(entries: Record<string, unknown>[]): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();

  let sessionCwd = "";
  for (const e of entries) {
    if (e.cwd) {
      sessionCwd = e.cwd as string;
      break;
    }
  }

  for (const entry of entries) {
    if (entry.type !== "file-history-snapshot") continue;
    const messageId = entry.messageId as string | undefined;
    if (!messageId) continue;

    const snapshot = entry.snapshot as {
      trackedFileBackups?: Record<string, { backupFileName?: string }>;
    } | undefined;
    const backups = snapshot?.trackedFileBackups;
    if (!backups) continue;

    let fileMap = result.get(messageId);
    if (!fileMap) {
      fileMap = new Map();
      result.set(messageId, fileMap);
    }

    for (const [key, backup] of Object.entries(backups)) {
      if (!backup.backupFileName) continue;
      let path = key;
      if (!path.startsWith("/") && sessionCwd) {
        path = `${sessionCwd}/${path}`;
      }
      fileMap.set(path, backup.backupFileName);
    }
  }

  return result;
}

/**
 * JSONL テキストをパースしてエントリ配列を返す。
 */
export function parseJsonl(jsonl: string): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // 不正なJSON行をスキップ
    }
  }
  return entries;
}
