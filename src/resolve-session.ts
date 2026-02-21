/**
 * セッションID（またはファイルパス）からセッションJSONLファイルのパスを解決する。
 */
export async function resolveSession(input: string): Promise<string> {
  // 1. ファイルとして存在するか確認
  if (await Bun.file(input).exists()) {
    return input;
  }

  // 2. セッションIDとして解決
  // バリデーション
  if (!/^[a-f0-9-]+$/.test(input)) {
    throw new Error(`Invalid session ID: ${input}`);
  }

  // 検索ディレクトリの構築
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  const defaultDir = `${process.env.HOME}/.claude`;
  const searchDirs: string[] = [];

  if (configDir) {
    searchDirs.push(configDir);
    if (configDir !== defaultDir) {
      searchDirs.push(defaultDir);
    }
  } else {
    searchDirs.push(defaultDir);
  }

  // 各ディレクトリで Glob 検索
  const glob = new Bun.Glob(`projects/*/${input}*.jsonl`);
  for (const dir of searchDirs) {
    for (const match of glob.scanSync(dir)) {
      return `${dir}/${match}`;
    }
  }

  throw new Error(`Session not found: ${input}`);
}
