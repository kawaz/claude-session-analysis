import { resolveSession } from "../resolve-session.ts";
import { omit, redact, redactWithHint } from "../lib.ts";
import { parseMarker, findEntries, findEntriesWithContext } from "./extract.ts";

const OMIT_KEYS = [
  "signature", "isSidechain", "userType", "version", "slug",
  "requestId", "sessionId", "stop_reason", "stop_sequence",
  "usage", "id", "role", "parentUuid", "uuid", "thinkingMetadata",
];
const REDACT_KEYS = ["data"];

export async function run(args: string[]) {
  let rawMode: 0 | 1 | 2 = 0;
  let after = 0;
  let before = 0;

  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--help") {
      printUsage();
      return;
    } else if (arg === "--raw") {
      rawMode = 1;
      i++;
    } else if (arg === "--raw2") {
      rawMode = 2;
      i++;
    } else if (arg === "-A") {
      after = Number(args[i + 1]);
      i += 2;
    } else if (arg === "-B") {
      before = Number(args[i + 1]);
      i += 2;
    } else if (arg === "-C") {
      after = Number(args[i + 1]);
      before = Number(args[i + 1]);
      i += 2;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else {
      positional.push(arg);
      i++;
    }
  }

  const input = positional[0];
  const marker = positional[1];

  if (!input || !marker) {
    printUsage();
    process.exit(1);
  }

  // セッション解決
  const sessionFile = await resolveSession(input);

  // JSONL読み込み
  const text = await Bun.file(sessionFile).text();
  const rawLines = text.split("\n").filter((line) => line.trim());
  const entries: Record<string, unknown>[] = [];
  for (const line of rawLines) {
    try {
      entries.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // 不正なJSON行をスキップ
    }
  }

  // マーカーパース
  const { type, id } = parseMarker(marker);

  // エントリ検索
  let result: Record<string, unknown>[];
  if (before > 0 || after > 0) {
    result = findEntriesWithContext(entries, type, id, before, after);
  } else {
    result = findEntries(entries, type, id);
  }

  if (result.length === 0) {
    console.error(`Not found: ${marker}`);
    process.exit(1);
  }

  // 出力
  const output: string[] = [];
  for (const entry of result) {
    let processed: unknown;
    if (rawMode === 2) {
      // --raw2: omit + redactWithHint
      processed = redactWithHint(omit(entry, OMIT_KEYS), REDACT_KEYS);
    } else if (rawMode === 1) {
      // --raw: omit + redact
      processed = redact(omit(entry, OMIT_KEYS), REDACT_KEYS);
    } else {
      // デフォルト: omit + redact（--raw と同じ pretty print）
      processed = redact(omit(entry, OMIT_KEYS), REDACT_KEYS);
    }
    output.push(JSON.stringify(processed, null, 2));
  }

  await Bun.write(Bun.stdout, output.join("\n") + "\n");
}

function printUsage() {
  const prog = process.env._PROG || "get-by-marker";
  console.log(
    `Usage: ${prog} [--raw] [--raw2] [-A <n>] [-B <n>] [-C <n>] <session_id_or_file> <marker>`,
  );
}
