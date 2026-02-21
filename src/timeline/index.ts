#!/usr/bin/env bun
import { parseArgs } from "./parse-args.ts";
import { resolveSession } from "../resolve-session.ts";
import { extractEvents } from "./extract.ts";
import { pipeline } from "./filter.ts";
import { formatEvents } from "./format.ts";
import { omit, redact, redactWithHint } from "../lib.ts";
import type { SessionEntry } from "./types.ts";

const OMIT_KEYS = [
  "signature", "isSidechain", "userType", "version", "slug",
  "requestId", "sessionId", "stop_reason", "stop_sequence",
  "usage", "id", "role", "parentUuid", "uuid", "thinkingMetadata",
];
const REDACT_KEYS = ["data"];

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
  const rawLines = text.split("\n").filter((line) => line.trim());
  const entries: SessionEntry[] = rawLines.map((line) => JSON.parse(line));

  // イベント抽出
  const events = extractEvents(entries);

  // フィルタリング
  const filtered = pipeline(events, {
    types: args.types,
    from: args.from,
    to: args.to,
  });

  // --raw / --raw2: マーカーからエントリを検索して JSON 出力
  if (args.rawMode > 0) {
    // 全エントリを解析済みオブジェクトとして保持（uuid/messageId でルックアップ）
    const parsed: Record<string, unknown>[] = rawLines.map((line) => JSON.parse(line));
    const output: string[] = [];
    for (const event of filtered) {
      const marker = `${event.kind}${event.ref}`;
      const id = marker.slice(1); // type prefix を除去
      const matchType = marker[0];

      // エントリ検索（複数マッチ対応）
      const matches = parsed.filter((e: Record<string, unknown>) => {
        if (matchType === "F") {
          return (
            ((e.messageId as string) || "").slice(0, 8) === id ||
            ((e.uuid as string) || "").slice(0, 8) === id
          );
        }
        return ((e.uuid as string) || "").slice(0, 8) === id;
      });

      for (const entry of matches) {
        let processed: unknown;
        if (args.rawMode === 2) {
          // --raw2: redact with hint (no omit)
          processed = redactWithHint(entry, REDACT_KEYS);
        } else {
          // --raw: omit + redact
          processed = redact(omit(entry, OMIT_KEYS), REDACT_KEYS);
        }
        output.push(JSON.stringify(processed, null, 2));
      }
    }
    await Bun.write(Bun.stdout, output.join("\n") + "\n");
    return;
  }

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
