import { resolveSession } from "../resolve-session.ts";
import {
  getClaudeConfigDirs,
  findSessionDir,
  findBackupFile,
  findOriginalPath,
} from "./resolve.ts";

export async function run(args: string[]) {
  if (args[0] === "--help") {
    const prog = process.env._PROG || "file-diff";
    console.log(
      `Usage: ${prog} <session_id_prefix> <backup_hash_prefix> <v1> [v2]`,
    );
    console.log("  v2 omitted: diff backup v1 vs current file");
    return;
  }

  const [sessionId, hashPrefix, v1Str, v2Str] = args;

  // 引数バリデーション
  if (!sessionId || !hashPrefix || !v1Str) {
    const prog = process.env._PROG || "file-diff";
    console.error(
      `Usage: ${prog} <session_id_prefix> <backup_hash_prefix> <v1> [v2]`,
    );
    console.error("  v2 omitted: diff backup v1 vs current file");
    process.exit(1);
  }

  if (!/^[a-f0-9-]+$/.test(sessionId)) {
    console.error(`Invalid session ID: ${sessionId}`);
    process.exit(1);
  }

  if (!/^[a-f0-9]+$/.test(hashPrefix)) {
    console.error(`Invalid hash prefix: ${hashPrefix}`);
    process.exit(1);
  }

  const v1 = Number(v1Str);
  if (!/^[0-9]+$/.test(v1Str)) {
    console.error(`Invalid version number v1: ${v1Str}`);
    process.exit(1);
  }

  if (v2Str !== undefined && !/^[0-9]+$/.test(v2Str)) {
    console.error(`Invalid version number v2: ${v2Str}`);
    process.exit(1);
  }
  const v2 = v2Str !== undefined ? Number(v2Str) : undefined;

  // 検索ディレクトリの構築
  const configDirs = getClaudeConfigDirs(
    process.env.CLAUDE_CONFIG_DIR,
    process.env.HOME!,
  );

  // セッションディレクトリの検索
  const sessionDir = await findSessionDir(sessionId, configDirs);
  if (!sessionDir) {
    console.error(`Session not found: ${sessionId}`);
    console.error(
      "Hint: Use 'claude-session-analysis sessions' to list available sessions",
    );
    process.exit(1);
  }

  // v1 バックアップファイルの検索
  const file1 = await findBackupFile(sessionDir, hashPrefix, v1);
  if (!file1) {
    console.error(`File not found: ${hashPrefix}*@v${v1}`);
    console.error(
      "Hint: Use 'claude-session-analysis timeline <session_id> -t F' to list file operations",
    );
    process.exit(1);
  }

  let file2: string;

  if (v2 !== undefined) {
    // 2つのバックアップバージョンを比較
    const found = await findBackupFile(sessionDir, hashPrefix, v2);
    if (!found) {
      console.error(`File not found: ${hashPrefix}*@v${v2}`);
      console.error(
        "Hint: Use 'claude-session-analysis timeline <session_id> -t F' to list file operations",
      );
      process.exit(1);
    }
    file2 = found;
  } else {
    // バックアップと現在のファイルを比較
    // バックアップファイル名からフルハッシュを取得
    const backupFilename = file1.split("/").pop()!;
    const fullHash = backupFilename.replace(/@v\d+$/, "");

    // セッションファイルからオリジナルパスを検索
    const sessionFile = await resolveSession(sessionId);
    const jsonlContent = await Bun.file(sessionFile).text();
    const originalPath = findOriginalPath(jsonlContent, fullHash);

    if (!originalPath) {
      console.error(
        `Could not find original file path for hash: ${fullHash}`,
      );
      process.exit(1);
    }

    if (!(await Bun.file(originalPath).exists())) {
      console.error(`Original file no longer exists: ${originalPath}`);
      process.exit(1);
    }

    file2 = originalPath;
  }

  // diff 実行
  console.log(`# diff ${file1} ${file2}`);
  const proc = Bun.spawn(["diff", file1, file2], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  // diff は差分がある場合 exit code 1 を返すが、これは正常
  // exit code 2 以上はエラー
  if (exitCode >= 2) {
    process.exit(exitCode);
  }
}
