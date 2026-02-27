import { searchSessions, parseDuration } from "./search.ts";
import { formatSessionsOutput } from "./format.ts";

const DURATION_RE = /^(\d+[smhd])+$/;

function printUsage(exitCode: number = 0): never {
  const prog = process.env._PROG || "sessions";
  const out = exitCode !== 0 ? console.error : console.log;
  out(`Usage: ${prog} [--grep <keyword>] [--since <spec>] [--limit <N>] [--full]

Options:
  --grep <pattern>  Filter sessions by content (regex)
  --since <spec>    Time filter. Duration: 5m, 1h, 2d, 1h30m
                    or date string: 2024-01-01, 2024-01-01T12:00:00
                    (default: 1d)
  --limit <N>       Show last N sessions (default: 10)
  --full            Show full session ID and cwd
  --help            Show this help`);
  process.exit(exitCode);
}

/**
 * --since の値をパースし、cutoff (Unix epoch seconds) を返す。
 * - duration形式 (e.g. "1h30m"): now - duration
 * - Date parseable文字列: new Date(spec)
 * - Invalid: エラーメッセージを出して exit(1)
 */
function parseSince(spec: string): number {
  if (DURATION_RE.test(spec)) {
    const seconds = parseDuration(spec);
    return Math.floor(Date.now() / 1000) - seconds;
  }
  const d = new Date(spec);
  if (isNaN(d.getTime())) {
    console.error(`Error: Invalid --since value: ${spec}`);
    process.exit(1);
  }
  return Math.floor(d.getTime() / 1000);
}

function parseOpts(rawArgs: string[]) {
  let keyword = "";
  let since = "1d";
  let tail = 10;
  let full = false;

  let i = 0;
  while (i < rawArgs.length) {
    switch (rawArgs[i]) {
      case "--help":
        printUsage(0);
        break; // unreachable
      case "--grep":
        i++;
        if (i >= rawArgs.length) {
          console.error("Error: --grep requires a value");
          printUsage(1);
        }
        keyword = rawArgs[i] ?? "";
        break;
      case "--since":
        i++;
        if (i >= rawArgs.length) {
          console.error("Error: --since requires a value");
          printUsage(1);
        }
        since = rawArgs[i] ?? "1d";
        break;
      case "--limit":
        i++;
        if (i >= rawArgs.length) {
          console.error("Error: --limit requires a value");
          printUsage(1);
        }
        tail = parseInt(rawArgs[i] ?? "10", 10);
        break;
      case "--full":
        full = true;
        break;
      default:
        if (rawArgs[i]!.startsWith("-")) {
          console.error(`Unknown option: ${rawArgs[i]}`);
          printUsage(1);
        }
        // 位置引数は無視
        break;
    }
    i++;
  }

  return { keyword, since, tail, full };
}

export async function run(args: string[]) {
  const opts = parseOpts(args);
  const cutoff = parseSince(opts.since);

  // 検索ディレクトリの構築（sh版と同じロジック）
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  const defaultDir = `${process.env.HOME}/.claude`;
  const configDirs: string[] = [];

  if (configDir) {
    configDirs.push(configDir);
    if (configDir !== defaultDir) {
      configDirs.push(defaultDir);
    }
  } else {
    configDirs.push(defaultDir);
  }

  // 全セッション検索（sinceなし）
  const allSessions = await searchSessions({ configDirs });
  allSessions.sort((a, b) => a.mtime - b.mtime);

  // フィルタ適用済み検索
  try {
    const filtered = await searchSessions({
      configDirs,
      since: cutoff,
      keyword: opts.keyword || undefined,
    });

    // 出力
    const output = formatSessionsOutput(allSessions, filtered, {
      full: opts.full,
      tail: opts.tail,
    });

    if (output) {
      await Bun.write(Bun.stdout, output + "\n");
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`Error: Invalid regex pattern: ${opts.keyword} (${e.message})`);
      process.exit(1);
    }
    throw e;
  }
}
