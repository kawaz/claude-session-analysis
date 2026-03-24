import { searchSessions, parseDuration, type SessionInfo } from "./search.ts";
import { formatSessionsOutput, formatSessionsJsonl } from "./format.ts";
import { getConfigDirs, writeJsonl, DURATION_RE, progName } from "../lib.ts";
import { resolveSessionAll } from "../resolve-session.ts";
import * as path from "node:path";

type Format = "list" | "jsonl";

function printUsage(exitCode: number = 0): never {
  const prog = progName("sessions");
  const out = exitCode !== 0 ? process.stderr : process.stdout;
  out.write(`Usage: ${prog} [options] [<session_id_or_file> ...]

Options:
  --grep <pattern>      Filter sessions by content (regex)
  --path <pattern>      Filter sessions by path (regex)
  --since <spec>        Time filter. Duration: 5m, 1h, 2d, 1h30m
                        or date string: 2024-01-01, 2024-01-01T12:00:00
                        (default: 2d, disabled when session IDs given)
  --limit <N>           Show last N sessions (default: 20)
  --format <list|jsonl>  Output format (default: list)
  --help                Show this help\n`);
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
  let format: Format = "list";
  const positionals: string[] = [];
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
      case "--format":
        i++;
        if (i >= rawArgs.length) {
          console.error("Error: --format requires a value");
          printUsage(1);
        }
        {
          const v = rawArgs[i] ?? "";
          if (v !== "list" && v !== "jsonl") {
            console.error(`Error: --format must be 'list' or 'jsonl', got '${v}'`);
            printUsage(1);
          }
          format = v;
        }
        break;
      default:
        if (rawArgs[i]!.startsWith("-")) {
          console.error(`Unknown option: ${rawArgs[i]}`);
          printUsage(1);
        }
        positionals.push(rawArgs[i]!);
        break;
    }
    i++;
  }

  return { keyword, pathFilter, since, tail, format, positionals, sinceExplicit, limitExplicit, grepExplicit };
}

function buildCommandHelp(): string {
  const prog = progName("sessions");
  return `${prog} [--since <=${DEFAULT_SINCE}>] [--limit <N=${DEFAULT_LIMIT}>] [--path <REGEXP>] [--grep <REGEXP>] [--format <list|jsonl>] [--help]`;
}

function buildCommandComputed(opts: ReturnType<typeof parseOpts>): string {
  const prog = progName("sessions");
  const parts = [prog];
  parts.push(`--since ${opts.since}`);
  parts.push(`--limit ${opts.tail}`);
  if (opts.pathFilter) {
    parts.push(`--path ${opts.pathFilter}`);
  }
  if (opts.keyword) {
    parts.push(`--grep ${opts.keyword}`);
  }
  if (opts.format !== "list") {
    parts.push(`--format ${opts.format}`);
  }
  return parts.join(" ");
}



export async function run(args: string[]) {
  const opts = parseOpts(args);
  const cutoff = parseSince(opts.since);

  const configDirs = getConfigDirs();

  const prog = progName("sessions");
  const command = `${prog} ${args.join(" ")}`;
  const commandHelp = buildCommandHelp();

  // 位置引数をセッションファイルに解決
  let sessionFiles: Set<string> | undefined;
  if (opts.positionals.length > 0) {
    sessionFiles = new Set<string>();
    for (const input of opts.positionals) {
      try {
        const resolved = await resolveSessionAll(input);
        for (const f of resolved) sessionFiles.add(f);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    }
  }

  try {
    const { sessions: filtered, stats } = await searchSessions({
      configDirs,
      since: sessionFiles ? undefined : cutoff,
      keyword: opts.keyword || undefined,
      path: opts.pathFilter || undefined,
      files: sessionFiles ? [...sessionFiles] : undefined,
    });
    if (opts.format === "jsonl") {
      const output = formatSessionsJsonl(filtered, { tail: opts.tail });
      await writeJsonl(output);
    } else {
      const output = formatSessionsOutput(stats, filtered, {
        tail: opts.tail,
        command,
        commandComputed: buildCommandComputed(opts),
        commandHelp,
      });
      if (output) console.log(output);
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      const pattern = opts.keyword || opts.pathFilter || "";
      console.error(`Error: Invalid regex pattern: ${pattern} (${e.message})`);
      process.exit(1);
    }
    throw e;
  }
}
