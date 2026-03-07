import { parseArgs } from "./parse-args.ts";
import { resolveSession } from "../resolve-session.ts";
import { extractEvents } from "./extract.ts";
import { pipeline } from "./filter.ts";
import { formatEvents, mdFrontMatter, localTimeMs } from "./format.ts";
import { omit, redact, redactWithHint } from "../lib.ts";
import type { SessionEntry, TimelineEvent } from "./types.ts";

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

/** resolveSession で得た完全セッションIDを取得 */
async function resolveFullId(input: string): Promise<string> {
  const file = await resolveSession(input);
  const basename = file.split("/").pop() || "";
  return basename.replace(/\.jsonl$/, "");
}

/** 静的なコマンドヘルプ文字列を構築 */
function buildCommandHelp(): string {
  const prog = process.env._PROG || "timeline";
  return `${prog} <SESSION_ID ..> [[RANGE1][..][RANGE2] ..] [--width <55>] [-t <UTRFWBGASQDI>] [--color [always|=[=none]] [--md [render|=source|[=none]] [--grep <REGEXP>] [--since <DURATION|DATE>] [--jsonl [=redact|full|[=none]]] [--help]`;
}

/** md front matter 用 command_computed を構築 */
function buildCommandComputed(
  opts: ReturnType<typeof parseArgs>,
  resolvedInputs: string[],
  filtered: TimelineEvent[],
  isTty: boolean,
): string {
  const prog = process.env._PROG || "timeline";
  const parts: string[] = [prog];

  // 解決済みセッションID
  parts.push(resolvedInputs.join(" "));

  // 実際のイベント範囲
  if (filtered.length > 0) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    parts.push(`${first.kind}${first.ref}..${last.kind}${last.ref}`);
  }

  parts.push(`-t ${opts.types}`);
  parts.push(`--width 0`); // md mode では width 無視

  // color 解決
  const colorResolved = opts.color === "auto" ? (isTty ? "always" : "none") : opts.color;
  parts.push(`--color ${colorResolved}`);

  // md 解決
  const mdResolved = opts.mdMode === "auto" ? (isTty ? "render" : "source") : opts.mdMode;
  parts.push(`--md ${mdResolved}`);

  parts.push(`--jsonl ${opts.jsonlMode}`);

  return parts.join(" ");
}

export async function run(args: string[]) {
  const opts = parseArgs(args);

  if (opts.help) {
    printUsage();
    return;
  }

  const isTty = process.stdout.isTTY ?? false;

  // セッション解決（複数入力対応）
  const resolved: { file: string; startTime: number; fullId: string }[] = [];
  for (const input of opts.inputs) {
    const file = await resolveSession(input);
    const startTime = await getStartTime(file);
    const fullId = await resolveFullId(input);
    resolved.push({ file, startTime, fullId });
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
      since: opts.since,
    });
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error(`Error: Invalid regex pattern: ${opts.grep} (${e.message})`);
      process.exit(1);
    }
    throw e;
  }

  // mdMode auto 解決: tty なら render、それ以外なら source
  const mdMode: "none" | "render" | "source" =
    opts.mdMode === "auto"
      ? (isTty ? "render" : "source")
      : opts.mdMode;

  // --jsonl: マーカーからエントリを検索して JSON 出力
  if (opts.jsonlMode !== "none") {
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
        if (opts.jsonlMode === "full") {
          processed = redactWithHint(entry, REDACT_KEYS);
        } else {
          processed = redact(omit(entry, OMIT_KEYS), REDACT_KEYS);
        }
        output.push(JSON.stringify(processed));
      }
    }
    console.log(output.join("\n"));
    return;
  }

  // カラー判定
  const useColors =
    opts.color === "always"
      ? true
      : opts.color === "none"
        ? false
        : isTty;

  // 絵文字判定
  const useEmoji =
    opts.emoji === "always"
      ? true
      : opts.emoji === "never"
        ? false
        : useColors; // auto: colors に連動

  // mdモード時のtimestampsデフォルト: 明示的に指定がなければ有効
  const timestamps =
    (mdMode !== "none" && !args.includes("--no-timestamps"))
      ? true
      : opts.timestamps;

  // 共通メタ情報
  const isMd = mdMode === "render" || mdMode === "source";
  const resolvedInputs = resolved.map(r => r.fullId);
  const command = `${process.env._PROG || "timeline"} ${args.join(" ")}`;
  const commandComputed = buildCommandComputed(opts, resolvedInputs, filtered, isTty);
  const commandHelp = buildCommandHelp();
  const now = localTimeMs();

  // md時: YAML front matter / 非md時: "# " 付きヘッダ
  const metaBlock = isMd
    ? mdFrontMatter(command, commandComputed, commandHelp, now)
    : `# command: ${command}\n# command_computed: ${commandComputed}\n# command_help: ${commandHelp}\n# now: ${now}\n`;

  // 出力生成
  const output = metaBlock + formatEvents(filtered, {
    jsonlMode: opts.jsonlMode,
    width: opts.width,
    timestamps,
    colors: useColors,
    emoji: useEmoji,
    mdMode,
  });

  // --md render: mdp にパイプ
  if (mdMode === "render") {
    const which = Bun.spawnSync(["which", "mdp"]);
    if (which.exitCode !== 0) {
      console.error("Error: mdp not found. Install mdp to use --md=render.");
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

  // --md=source / 通常出力
  console.log(output);
}

function printUsage() {
  const prog = process.env._PROG || "timeline";
  console.log(`Usage: ${prog} [options] <session_id_or_file> [range]

Options:
  -t <types>                  Filter by type (default: UTRFWBGASQDI)
  --width <width>             Truncation width (default: 55)
  --timestamps                Show timestamps
  --no-timestamps             Disable timestamps (overrides md default)
  --color[=auto|always|none]  Color output (default: auto)
  --emoji                     Always show emoji
  --no-emoji                  Never show emoji
  --grep <pattern>            Filter events by desc (regex)
  --since <spec>              Show events since (duration: 1h,30m,2d or date)
  --md[=auto|source|render|none]  Full text for Q/T/R/U (default: none)
                              auto=render if tty, source otherwise
  --jsonl[=none|redact|full]  JSONL output (default: none)
                              redact: omit+redact, full: redact only
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
  ${prog} --md abc12345                 Show with full Q/T/R/U text
  ${prog} --color=none --emoji abc12345 Emoji without colors
  ${prog} --grep "README" abc12345      Filter events matching pattern
  ${prog} --since 1h abc12345           Show events from last 1 hour
  ${prog} abc12345 Uabc1234..Rabc5678   Show range between markers`);
}
