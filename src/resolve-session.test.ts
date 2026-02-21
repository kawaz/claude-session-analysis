import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolveSession } from "./resolve-session.ts";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("resolveSession", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "resolve-session-test-"));
    // テスト用のセッションファイルを作成
    const projectDir = join(tmpDir, "projects", "test-project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "abc12345-6789-0000-0000-000000000000.jsonl"), "{}");
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("ファイルパスが存在する → そのまま返す", async () => {
    const filePath = join(tmpDir, "projects", "test-project", "abc12345-6789-0000-0000-000000000000.jsonl");
    expect(await resolveSession(filePath)).toBe(filePath);
  });

  test("完全セッションID → パス解決", async () => {
    const originalEnv = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;
    try {
      const result = await resolveSession("abc12345-6789-0000-0000-000000000000");
      expect(result).toContain("abc12345");
      expect(result).toEndWith(".jsonl");
    } finally {
      process.env.CLAUDE_CONFIG_DIR = originalEnv;
    }
  });

  test("短縮セッションID → 前方一致", async () => {
    const originalEnv = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;
    try {
      const result = await resolveSession("abc12345");
      expect(result).toContain("abc12345");
    } finally {
      process.env.CLAUDE_CONFIG_DIR = originalEnv;
    }
  });

  test("不正なセッションID → エラー", async () => {
    await expect(resolveSession("invalid!id")).rejects.toThrow();
  });

  test("存在しないID → エラー", async () => {
    const originalEnv = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;
    try {
      await expect(resolveSession("ffffffff")).rejects.toThrow(/not found/i);
    } finally {
      process.env.CLAUDE_CONFIG_DIR = originalEnv;
    }
  });
});
