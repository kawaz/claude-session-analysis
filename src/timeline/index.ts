#!/usr/bin/env bun
import { parseArgs } from "./parse-args.ts";
import { resolveSession } from "../resolve-session.ts";
import { extractEvents } from "./extract.ts";
import { pipeline } from "./filter.ts";
import { formatEvents } from "./format.ts";
import type { SessionEntry } from "./types.ts";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // セッション解決
  const sessionFile = await resolveSession(args.input);

  // JSONL読み込み
  const text = await Bun.file(sessionFile).text();
  const entries: SessionEntry[] = text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  // イベント抽出
  const events = extractEvents(entries);

  // フィルタリング
  const filtered = pipeline(events, {
    types: args.types,
    from: args.from,
    to: args.to,
  });

  // カラー判定
  const useColors =
    args.colors === "always"
      ? true
      : args.colors === "never"
        ? false
        : process.stdout.isTTY ?? false;

  // 出力
  const output = formatEvents(filtered, {
    rawMode: args.rawMode,
    width: args.width,
    timestamps: args.timestamps,
    colors: useColors,
  });

  await Bun.write(Bun.stdout, output + "\n");
}

function printUsage() {
  const prog = process.env._PROG || "timeline";
  console.log(`Usage: ${prog} [options] <session_id_or_file> [range]

Options:
  -t <types>                  Filter by type (default: UTRFWBGASQDI)
  -w <width>                  Truncation width (default: 55)
  --timestamps                Show timestamps
  --colors[=auto|always|never] Color output (default: auto)
  --no-colors                 Disable colors
  --raw                       Output markers only (for get-by-marker)
  --raw2                      Output markers only (redact only)
  --help, -h                  Show this help

Types:
  U=User T=Think R=Response F=File W=Web B=Bash
  G=Grep/Glob A=Agent S=Skill Q=Question D=toDo I=Info

Range:
  ..marker    From start to marker
  marker..    From marker to end
  from..to    Between markers
  marker      Single marker only`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
