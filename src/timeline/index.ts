import { parseArgs } from "./parse-args.ts";
import { resolveSession } from "../resolve-session.ts";
import { extractEvents } from "./extract.ts";
import { pipeline } from "./filter.ts";
import { formatEvents, mdFrontMatter } from "./format.ts";
import { omit, redact, redactWithHint } from "../lib.ts";
import type { SessionEntry } from "./types.ts";

const OMIT_KEYS = [
  "signature", "isSidechain", "userType", "version", "slug",
  "requestId", "sessionId", "stop_reason", "stop_sequence",
  "usage", "id", "role", "parentUuid", "uuid", "thinkingMetadata",
];
const REDACT_KEYS = ["data"];

/** セッションファイルの先頭行から timestamp を取得（start時刻でソート用） */
async function getStartTime(sessionFile: string): Promise<number> {
  const text = await Bun.file(sessionFile).text();
  const firstLine = text.slice(0, text.indexOf("\n") || text.length);
  const m = firstLine.match(/"timestamp"\s*:\s*"([^"]+)"/);
  if (m) return new Date(m[1]!).getTime();
  return Infinity; // timestamp なしは末尾に
}

/** 1つのセッションファイルを処理し、イベント・エントリを返す */
async function loadSession(sessionFile: string) {
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
  return entries;
}

export async function run(args: string[]) {
  const opts = parseArgs(args);

  if (opts.help) {
    printUsage();
    return;
  }

  // セッション解決（複数入力対応）
  const resolved: { file: string; startTime: number }[] = [];
  for (const input of opts.inputs) {
    const file = await resolveSession(input);
    const startTime = await getStartTime(file);
    resolved.push({ file, startTime });
  }

  // start時刻の古い順にソート
  resolved.sort((a, b) => a.startTime - b.startTime);

  // 全セッションのエントリとイベントを結合
  let allEntries: SessionEntry[] = [];
  let allEvents: ReturnType<typeof extractEvents> = [];
  for (const { file } of resolved) {
    const entries = await loadSession(file);
    allEntries = allEntries.concat(entries);
    allEvents = allEvents.concat(extractEvents(entries));
  }

  // フィルタリング
  let filtered;
  try {
    filtered = pipeline(allEvents, {
      types: opts.types,
      from: opts.from,
      to: opts.to,
      grep: opts.grep,
    });
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`Error: Invalid regex pattern: ${opts.grep} (${e.message})`);
      process.exit(1);
    }
    throw e;
  }

  // --raw / --raw2: マーカーからエントリを検索して JSON 出力
  if (opts.rawMode > 0) {
    const parsed = allEntries as unknown as Record<string, unknown>[];
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
        if (opts.rawMode === 2) {
          processed = redactWithHint(entry, REDACT_KEYS);
        } else {
          processed = redact(omit(entry, OMIT_KEYS), REDACT_KEYS);
        }
        output.push(JSON.stringify(processed, null, 2));
      }
    }
    console.log(output.join("\n"));
    return;
  }

  // カラー判定
  const useColors =
    opts.colors === "always"
      ? true
      : opts.colors === "never"
        ? false
        : process.stdout.isTTY ?? false;

  // 絵文字判定
  const useEmoji =
    opts.emoji === "always"
      ? true
      : opts.emoji === "never"
        ? false
        : useColors; // auto: colors に連動（従来と同じ）

  // mdモード時のtimestampsデフォルト: 明示的に指定がなければ有効
  const timestamps =
    (opts.mdMode !== "off" && !args.includes("--no-timestamps"))
      ? true
      : opts.timestamps;

  // mdモード用 front matter
  const isMd = opts.mdMode === "render" || opts.mdMode === "source";
  const frontMatter = isMd
    ? mdFrontMatter(
        `${process.env._PROG || "timeline"} ${args.join(" ")}`,
        new Date().toISOString(),
      )
    : "";

  // 出力生成
  const output = frontMatter + formatEvents(filtered, {
    rawMode: opts.rawMode,
    width: opts.width,
    timestamps,
    colors: useColors,
    emoji: useEmoji,
    mdMode: opts.mdMode,
  });

  // --md-render: mdp にパイプ
  if (opts.mdMode === "render") {
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
  console.log(output);
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
  --grep <pattern>            Filter events by desc (regex)
  --md-source                 Full text output for Q/T/R/U events
  --md-render                 Full text output piped through mdp
  --raw                       Output markers only (for get-by-marker)
  --raw2                      Output markers only (redact only)
  --help                      Show this help

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
  ${prog} --grep "README" abc12345        Filter events matching pattern
  ${prog} abc12345 Uabc1234..Rabc5678   Show range between markers`);
}

