/**
 * file-ops: Read/Write/Edit tool_use からファイル操作を抽出する。
 * Edit は Write にマージされる（jq版と同様）。
 */

export interface FileOpsResult {
  Read?: string[];
  Write?: string[];
}

const FILE_OPS_TOOLS = new Set(["Read", "Write", "Edit"]);

/**
 * パース済みエントリの配列からファイル操作を抽出する。
 */
export function extractFileOps(entries: Record<string, unknown>[]): FileOpsResult {
  const readSet = new Set<string>();
  const writeSet = new Set<string>();

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

      // Edit -> Write (jq版と同じ)
      const tool = name === "Edit" ? "Write" : name;
      if (tool === "Read") {
        readSet.add(filePath);
      } else {
        writeSet.add(filePath);
      }
    }
  }

  const result: FileOpsResult = {};
  if (readSet.size > 0) result.Read = [...readSet].sort();
  if (writeSet.size > 0) result.Write = [...writeSet].sort();
  return result;
}

/**
 * JSONL テキストからファイル操作を抽出する。
 * 不正JSON行はスキップする。
 */
export function extractFileOpsFromJsonl(jsonl: string): FileOpsResult {
  const entries: Record<string, unknown>[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // 不正なJSON行をスキップ
    }
  }
  return extractFileOps(entries);
}
