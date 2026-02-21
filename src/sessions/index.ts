#!/usr/bin/env bun
import { searchSessions } from "./search.ts";
import { formatSessionsOutput } from "./format.ts";

function printUsage(exitCode: number = 0): never {
  const prog = process.env._PROG || "sessions";
  console.log(`Usage: ${prog} [-g kw] [-mmin N] [-n N] [--full]
  -g: search keyword, output session ID only
  -mmin N: +N=older than N min, -N/N=newer than N min (default: 1440 = 1day)
  -n N: show last N sessions (default: 10)
  --full: show full session ID and cwd`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]) {
  let keyword = "";
  let mmin = "1440";
  let tail = 10;
  let full = false;

  let i = 0;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--help":
      case "-h":
        printUsage(0);
        break; // unreachable
      case "-g":
        keyword = argv[++i] ?? "";
        break;
      case "-mmin":
        mmin = argv[++i] ?? "1440";
        break;
      case "-n":
        tail = parseInt(argv[++i] ?? "10", 10);
        break;
      case "--full":
        full = true;
        break;
      default:
        // 未知の引数は無視（sh版の break 相当）
        break;
    }
    i++;
  }

  return { keyword, mmin, tail, full };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

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

  // 全セッション検索（mminなし）
  const allSessions = await searchSessions({ configDirs });
  allSessions.sort((a, b) => a.mtime - b.mtime);

  // フィルタ適用済み検索
  const filtered = await searchSessions({
    configDirs,
    mmin: args.mmin,
    keyword: args.keyword || undefined,
  });

  // 出力
  const output = formatSessionsOutput(allSessions, filtered, {
    full: args.full,
    tail: args.tail,
  });

  if (output) {
    await Bun.write(Bun.stdout, output + "\n");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
