import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  findSessionDir,
  findBackupFile,
  findOriginalPath,
} from "./resolve.ts";
import { getConfigDirs } from "../lib.ts";

describe("getConfigDirs", () => {
  let fakeHome: string;
  let savedConfigDir: string | undefined;

  beforeAll(async () => {
    // getConfigDirs は引数省略時 process.env.CLAUDE_CONFIG_DIR を見る。
    // テスト実行環境の env がテスト結果を壊さないよう、テスト中は退避する (HOME は触らない)。
    savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;

    fakeHome = await mkdtemp(join(tmpdir(), "config-dirs-test-"));
    // .claude / .claude-personal / .claude-work の 3 つを用意。
    // settings.json があるディレクトリだけ拾われることを検証する。
    await mkdir(join(fakeHome, ".claude"), { recursive: true });
    await writeFile(join(fakeHome, ".claude", "settings.json"), "{}");
    await mkdir(join(fakeHome, ".claude-personal"), { recursive: true });
    await writeFile(join(fakeHome, ".claude-personal", "settings.json"), "{}");
    await mkdir(join(fakeHome, ".claude-work"), { recursive: true });
    await writeFile(join(fakeHome, ".claude-work", "settings.json"), "{}");
    // settings.json なしのディレクトリ -> 拾われないはず
    await mkdir(join(fakeHome, ".claude-empty"), { recursive: true });
  });

  afterAll(async () => {
    await rm(fakeHome, { recursive: true });
    if (savedConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
    }
  });

  test("CLAUDE_CONFIG_DIR 未設定 -> ~/.claude*/settings.json の dirname を全部拾う", () => {
    const dirs = getConfigDirs(undefined, fakeHome);
    expect(dirs.sort()).toEqual(
      [
        join(fakeHome, ".claude"),
        join(fakeHome, ".claude-work"),
        join(fakeHome, ".claude-personal"),
      ].sort(),
    );
  });

  test("CLAUDE_CONFIG_DIR がマッチ済みディレクトリ -> 重複なし", () => {
    const target = join(fakeHome, ".claude-personal");
    const dirs = getConfigDirs(target, fakeHome);
    expect(dirs[0]).toBe(target);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  test("CLAUDE_CONFIG_DIR が glob でマッチしない別パス -> 先頭に追加", () => {
    const dirs = getConfigDirs("/custom/config", fakeHome);
    expect(dirs[0]).toBe("/custom/config");
    expect(dirs).toContain(join(fakeHome, ".claude-personal"));
  });

  test("settings.json なしのディレクトリは拾わない", () => {
    const dirs = getConfigDirs(undefined, fakeHome);
    expect(dirs).not.toContain(join(fakeHome, ".claude-empty"));
  });
});

describe("findSessionDir", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "file-diff-test-"));
    // file-history/abc12345-full-session-id/ ディレクトリを作成
    await mkdir(join(tmpDir, "file-history", "abc12345-6789-0000-0000-000000000000"), {
      recursive: true,
    });
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("前方一致でセッションディレクトリを検索", async () => {
    const result = await findSessionDir("abc12345", [tmpDir]);
    expect(result).toBe(
      join(tmpDir, "file-history", "abc12345-6789-0000-0000-000000000000"),
    );
  });

  test("完全一致でも検索可能", async () => {
    const result = await findSessionDir(
      "abc12345-6789-0000-0000-000000000000",
      [tmpDir],
    );
    expect(result).toBe(
      join(tmpDir, "file-history", "abc12345-6789-0000-0000-000000000000"),
    );
  });

  test("存在しないセッションID -> null", async () => {
    const result = await findSessionDir("ffffffff", [tmpDir]);
    expect(result).toBeNull();
  });

  test("複数ディレクトリを検索", async () => {
    const nonExistentDir = join(tmpDir, "nonexistent");
    const result = await findSessionDir("abc12345", [nonExistentDir, tmpDir]);
    expect(result).toBe(
      join(tmpDir, "file-history", "abc12345-6789-0000-0000-000000000000"),
    );
  });
});

describe("findBackupFile", () => {
  let sessionDir: string;

  beforeAll(async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "file-diff-backup-test-"));
    sessionDir = join(tmpDir, "session");
    await mkdir(sessionDir, { recursive: true });
    // バックアップファイルを作成
    await writeFile(join(sessionDir, "43ce204dabcdef01@v1"), "version1");
    await writeFile(join(sessionDir, "43ce204dabcdef01@v2"), "version2");
    await writeFile(join(sessionDir, "99aabbcc11223344@v1"), "other-file-v1");
  });

  test("ハッシュプレフィックスとバージョンでバックアップファイルを検索", async () => {
    const result = await findBackupFile(sessionDir, "43ce204d", 1);
    expect(result).toBe(join(sessionDir, "43ce204dabcdef01@v1"));
  });

  test("バージョン2のバックアップファイルを検索", async () => {
    const result = await findBackupFile(sessionDir, "43ce204d", 2);
    expect(result).toBe(join(sessionDir, "43ce204dabcdef01@v2"));
  });

  test("別のハッシュのバックアップファイルを検索", async () => {
    const result = await findBackupFile(sessionDir, "99aabbcc", 1);
    expect(result).toBe(join(sessionDir, "99aabbcc11223344@v1"));
  });

  test("存在しないバージョン -> null", async () => {
    const result = await findBackupFile(sessionDir, "43ce204d", 99);
    expect(result).toBeNull();
  });

  test("存在しないハッシュ -> null", async () => {
    const result = await findBackupFile(sessionDir, "deadbeef", 1);
    expect(result).toBeNull();
  });
});

describe("findOriginalPath", () => {
  test("file-history-snapshot からオリジナルパスを検索", () => {
    const jsonlContent = [
      JSON.stringify({ type: "user", uuid: "u1", timestamp: "2024-01-01T00:00:00Z", message: { content: "hello" } }),
      JSON.stringify({
        type: "file-history-snapshot",
        messageId: "m1",
        snapshot: {
          trackedFileBackups: {
            "/home/user/project/src/main.ts": {
              backupFileName: "43ce204dabcdef01@v1",
              backupTime: "2024-01-01T00:00:00Z",
            },
            "/home/user/project/README.md": {
              backupFileName: "99aabbcc11223344@v1",
              backupTime: "2024-01-01T00:00:00Z",
            },
          },
        },
      }),
    ].join("\n");

    const result = findOriginalPath(jsonlContent, "43ce204dabcdef01");
    expect(result).toBe("/home/user/project/src/main.ts");
  });

  test("別のハッシュで検索", () => {
    const jsonlContent = JSON.stringify({
      type: "file-history-snapshot",
      messageId: "m1",
      snapshot: {
        trackedFileBackups: {
          "/home/user/project/src/main.ts": {
            backupFileName: "43ce204dabcdef01@v1",
            backupTime: "2024-01-01T00:00:00Z",
          },
          "/home/user/project/README.md": {
            backupFileName: "99aabbcc11223344@v1",
            backupTime: "2024-01-01T00:00:00Z",
          },
        },
      },
    });

    const result = findOriginalPath(jsonlContent, "99aabbcc11223344");
    expect(result).toBe("/home/user/project/README.md");
  });

  test("見つからないハッシュ -> null", () => {
    const jsonlContent = JSON.stringify({
      type: "file-history-snapshot",
      messageId: "m1",
      snapshot: {
        trackedFileBackups: {
          "/home/user/project/src/main.ts": {
            backupFileName: "43ce204dabcdef01@v1",
            backupTime: "2024-01-01T00:00:00Z",
          },
        },
      },
    });

    const result = findOriginalPath(jsonlContent, "deadbeef12345678");
    expect(result).toBeNull();
  });

  test("file-history-snapshot エントリがない -> null", () => {
    const jsonlContent = JSON.stringify({
      type: "user",
      uuid: "u1",
      timestamp: "2024-01-01T00:00:00Z",
      message: { content: "hello" },
    });

    const result = findOriginalPath(jsonlContent, "43ce204dabcdef01");
    expect(result).toBeNull();
  });

  test("複数の file-history-snapshot エントリがある場合も検索できる", () => {
    const jsonlContent = [
      JSON.stringify({
        type: "file-history-snapshot",
        messageId: "m1",
        snapshot: {
          trackedFileBackups: {
            "/home/user/project/src/main.ts": {
              backupFileName: "43ce204dabcdef01@v1",
              backupTime: "2024-01-01T00:00:00Z",
            },
          },
        },
      }),
      JSON.stringify({
        type: "file-history-snapshot",
        messageId: "m2",
        snapshot: {
          trackedFileBackups: {
            "/home/user/project/README.md": {
              backupFileName: "99aabbcc11223344@v1",
              backupTime: "2024-01-01T00:01:00Z",
            },
          },
        },
      }),
    ].join("\n");

    const result = findOriginalPath(jsonlContent, "99aabbcc11223344");
    expect(result).toBe("/home/user/project/README.md");
  });
});
