/**
 * セッションIDの検索ディレクトリを構築する。
 */
function getSearchDirs(): string[] {
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
  return searchDirs;
}

/**
 * セッションID（またはファイルパス）からマッチする全セッションファイルのパスを返す。
 */
export async function resolveSessionAll(input: string): Promise<string[]> {
  // 1. ファイルとして存在するか確認
  if (await Bun.file(input).exists()) {
    return [input];
  }

  // 2. セッションIDとして解決
  if (!/^[a-f0-9-]+$/.test(input)) {
    throw new Error(`Invalid session ID: ${input}`);
  }

  const searchDirs = getSearchDirs();
  const glob = new Bun.Glob(`projects/*/${input}*.jsonl`);
  const results: string[] = [];
  for (const dir of searchDirs) {
    for (const match of glob.scanSync(dir)) {
      results.push(`${dir}/${match}`);
    }
  }

  if (results.length === 0) {
    throw new Error(`Session not found: ${input}`);
  }
  return results;
}

/**
 * セッションID（またはファイルパス）からセッションJSONLファイルのパスを解決する。
 * 複数マッチした場合は最初の1件を返す。
 */
export async function resolveSession(input: string): Promise<string> {
  const results = await resolveSessionAll(input);
  return results[0];
}
