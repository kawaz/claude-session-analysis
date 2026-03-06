import { searchSessions, parseDuration } from "./search.ts";
import { formatSessionsOutput } from "./format.ts";

const DURATION_RE = /^(\d+[smhd])+$/;

function printUsage(exitCode: number = 0): never {
  const prog = process.env._PROG || "sessions";
  const out = exitCode !== 0 ? console.error : console.log;
  out(`Usage: ${prog} [--grep <keyword>] [--since <spec>] [--limit <N>]

Options:
  --grep <pattern>  Filter sessions by content (regex)
  --since <spec>    Time filter. Duration: 5m, 1h, 2d, 1h30m
                    or date string: 2024-01-01, 2024-01-01T12:00:00
                    (default: 2d)
  --limit <N>       Show last N sessions (default: 20)
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

const DEFAULT_SINCE = "2d";
const DEFAULT_LIMIT = 20;

function parseOpts(rawArgs: string[]) {
  let keyword = "";
  let since = DEFAULT_SINCE;
  let tail = DEFAULT_LIMIT;
  let sinceExplicit = false;
  let limitExplicit = false;
  let grepExplicit = false;
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
        grepExplicit = true;
        break;
      case "--since":
        i++;
        if (i >= rawArgs.length) {
          console.error("Error: --since requires a value");
          printUsage(1);
        }
        since = rawArgs[i] ?? DEFAULT_SINCE;
        sinceExplicit = true;
        break;
      case "--limit":
        i++;
        if (i >= rawArgs.length) {
          console.error("Error: --limit requires a value");
          printUsage(1);
        }
        tail = parseInt(rawArgs[i] ?? String(DEFAULT_LIMIT), 10);
        limitExplicit = true;
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

  return { keyword, since, tail, sinceExplicit, limitExplicit, grepExplicit };
}

function buildCommandLine(opts: ReturnType<typeof parseOpts>): string {
  const prog = process.env._PROG || "sessions";
  const parts = [prog];
  const since = opts.sinceExplicit ? opts.since : `${DEFAULT_SINCE}`;
  parts.push(`${opts.sinceExplicit ? "" : "["}--since ${since}${opts.sinceExplicit ? "" : "]"}`);
  const limit = opts.limitExplicit ? String(opts.tail) : String(DEFAULT_LIMIT);
  parts.push(`${opts.limitExplicit ? "" : "["}--limit ${limit}${opts.limitExplicit ? "" : "]"}`);
  if (opts.grepExplicit) {
    parts.push(`--grep ${opts.keyword}`);
  } else {
    parts.push("[--grep <REGEXP>]");
  }
  return parts.join(" ");
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
      tail: opts.tail,
      commandLine: buildCommandLine(opts),
    });

    if (output) {
      console.log(output);
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`Error: Invalid regex pattern: ${opts.keyword} (${e.message})`);
      process.exit(1);
    }
    throw e;
  }
}
