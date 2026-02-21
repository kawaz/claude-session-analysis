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
  const entries: SessionEntry[] = [];
  for (const line of rawLines) {
    try {
      entries.push(JSON.parse(line) as SessionEntry);
    } catch {
      // 不正なJSON行をスキップ（書き込み途中のデータ等）
    }
  }

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
    // rawMode で使う parsed は entries をそのまま Record<string, unknown>[] として使用
    const parsed = entries as unknown as Record<string, unknown>[];
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

  // 絵文字判定
  const useEmoji =
    args.emoji === "always"
      ? true
      : args.emoji === "never"
        ? false
        : useColors; // auto: colors に連動（従来と同じ）

  // mdモード時のtimestampsデフォルト: 明示的に指定がなければ有効
  const timestamps =
    (args.mdMode !== "off" && !process.argv.slice(2).includes("--no-timestamps"))
      ? true
      : args.timestamps;

  // 出力生成
  const output = formatEvents(filtered, {
    rawMode: args.rawMode,
    width: args.width,
    timestamps,
    colors: useColors,
    emoji: useEmoji,
    mdMode: args.mdMode,
  });

  // --md-render: mdp にパイプ
  if (args.mdMode === "render") {
    // mdp の存在確認
    const which = Bun.spawnSync(["which", "mdp"]);
    if (which.exitCode !== 0) {
      console.error("Error: mdp not found. Install mdp to use --md-render.");
      process.exit(1);
    }

    const proc = Bun.spawn(["mdp"], {
      stdin: "pipe",
      stdout: "inherit",
      stderr: "inherit",
    });
    proc.stdin.write(output + "\n");
    proc.stdin.end();
    await proc.exited;
    return;
  }

  // --md-source / 通常出力
  await Bun.write(Bun.stdout, output + "\n");
}

function printUsage() {
  const prog = process.env._PROG || "timeline";
  console.log(`Usage: ${prog} [options] <session_id_or_file> [range]

Options:
  -t <types>                  Filter by type (default: UTRFWBGASQDI)
  -w <width>                  Truncation width (default: 55)
  --timestamps                Show timestamps
  --no-timestamps             Disable timestamps (overrides md default)
  --colors[=auto|always|never] Color output (default: auto)
  --no-colors                 Disable colors
  --emoji                     Always show emoji
  --no-emoji                  Never show emoji
  --md-source                 Full text output for Q/T/R/U events
  --md-render                 Full text output piped through mdp
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
  marker      Single marker only

Examples:
  ${prog} abc12345                      Show timeline for session
  ${prog} ./path/to/session.jsonl       Show timeline from file
  ${prog} -t UR abc12345                Show only User & Response
  ${prog} --timestamps abc12345         Show with timestamps
  ${prog} --md-source abc12345          Show with full Q/T/R/U text
  ${prog} --no-colors --emoji abc12345  Emoji without colors
  ${prog} abc12345 Uabc1234..Rabc5678   Show range between markers`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
