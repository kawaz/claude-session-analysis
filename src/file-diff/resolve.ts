/**
 * file-diff のバックアップファイル解決ロジック
 */
import { statSync } from "fs";
import { parseJsonl } from "../lib.ts";

/**
 * file-history ディレクトリ内でセッションID前方一致のディレクトリを検索する。
 * 複数の config ディレクトリを順に検索し、最初にマッチしたものを返す。
 */
export async function findSessionDir(
  sessionId: string,
  configDirs: string[],
): Promise<string | null> {
  const glob = new Bun.Glob(`${sessionId}*`);
  for (const dir of configDirs) {
    const fileHistoryDir = `${dir}/file-history`;
    try {
      for (const match of glob.scanSync({ cwd: fileHistoryDir, onlyFiles: false })) {
        const fullPath = `${fileHistoryDir}/${match}`;
        try {
          if (statSync(fullPath).isDirectory()) {
            return fullPath;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // file-history ディレクトリが存在しない場合はスキップ
      continue;
    }
  }
  return null;
}

/**
 * セッションディレクトリ内でバックアップファイルを検索する。
 * hash_prefix と version から `{hash_prefix}*@v{version}` パターンでマッチ。
 */
export async function findBackupFile(
  sessionDir: string,
  hashPrefix: string,
  version: number,
): Promise<string | null> {
  const glob = new Bun.Glob(`${hashPrefix}*@v${version}`);
  for (const match of glob.scanSync(sessionDir)) {
    return `${sessionDir}/${match}`;
  }
  return null;
}

/**
 * JSONL コンテンツからフルハッシュに対応するオリジナルファイルパスを検索する。
 * file-history-snapshot エントリの trackedFileBackups を走査し、
 * backupFileName が `{fullHash}@` で始まるエントリの key を返す。
 */
export function findOriginalPath(
  jsonlContent: string,
  fullHash: string,
): string | null {
  const entries = parseJsonl(jsonlContent);
  for (const entry of entries) {
    if (entry.type !== "file-history-snapshot") continue;

    const snapshot = entry.snapshot as {
      trackedFileBackups?: Record<
        string,
        { backupFileName?: string }
      >;
    };
    const backups = snapshot?.trackedFileBackups;
    if (!backups) continue;

    for (const [filePath, backup] of Object.entries(backups)) {
      const backupFileName = backup.backupFileName ?? "";
      if (backupFileName.startsWith(`${fullHash}@`)) {
        return filePath;
      }
    }
  }
  return null;
}
