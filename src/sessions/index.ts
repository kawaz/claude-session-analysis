import { searchSessions, parseDuration, type SessionInfo } from "./search.ts";
import { formatSessionsOutput } from "./format.ts";

const DURATION_RE = /^(\d+[smhd])+$/;

function printUsage(exitCode: number = 0): never {
  const prog = process.env._PROG || "sessions";
  const out = exitCode !== 0 ? process.stderr : process.stdout;
  out.write(`Usage: ${prog} [--grep <pattern>] [--path <pattern>] [--since <spec>] [--limit <N>]

Options:
  --grep <pattern>   Filter sessions by content (regex)
  --path <pattern>   Filter sessions by path (regex)
  --since <spec>     Time filter. Duration: 5m, 1h, 2d, 1h30m
                     or date string: 2024-01-01, 2024-01-01T12:00:00
                     (default: 2d)
  --limit <N>        Show last N sessions (default: 20)
  --help             Show this help\n`);
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
  let pathFilter = "";
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
      case "--path":
        i++;
        if (i >= rawArgs.length) {
          console.error("Error: --path requires a value");
          printUsage(1);
        }
        pathFilter = rawArgs[i] ?? "";
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

  return { keyword, pathFilter, since, tail, sinceExplicit, limitExplicit, grepExplicit };
}

function buildCommandHelp(): string {
  const prog = process.env._PROG || "sessions";
  return `${prog} [--since <=${DEFAULT_SINCE}>] [--limit <N=${DEFAULT_LIMIT}>] [--path <REGEXP>] [--grep <REGEXP>] [--help]`;
}

function buildCommandComputed(opts: ReturnType<typeof parseOpts>): string {
  const prog = process.env._PROG || "sessions";
  const parts = [prog];
  parts.push(`--since ${opts.since}`);
  parts.push(`--limit ${opts.tail}`);
  if (opts.pathFilter) {
    parts.push(`--path ${opts.pathFilter}`);
  }
  if (opts.keyword) {
    parts.push(`--grep ${opts.keyword}`);
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

  const prog = process.env._PROG || "sessions";
  const command = `${prog} ${args.join(" ")}`;
  const commandHelp = buildCommandHelp();

  try {
    const { sessions: filtered, stats } = await searchSessions({
      configDirs,
      since: cutoff,
      keyword: opts.keyword || undefined,
      path: opts.pathFilter || undefined,
    });
    const output = formatSessionsOutput(stats, filtered, {
      tail: opts.tail,
      command,
      commandComputed: buildCommandComputed(opts),
      commandHelp,
    });
    if (output) console.log(output);
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`Error: Invalid regex pattern: ${opts.keyword} (${e.message})`);
      process.exit(1);
    }
    throw e;
  }
}
