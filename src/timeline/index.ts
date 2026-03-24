import { parseArgs, PURE_NUMBER_RE } from "./parse-args.ts";
import { resolveSession } from "../resolve-session.ts";
import { extractEvents } from "./extract.ts";
import { pipeline } from "./filter.ts";
import { formatEvents, mdFrontMatter, localTimeMs } from "./format.ts";
import { omit, redact, redactWithHint, writeJsonl, parseJsonl, progName } from "../lib.ts";
import type { SessionEntry, TimelineEvent } from "./types.ts";

const OMIT_KEYS = [
  "signature", "isSidechain", "userType", "version", "slug",
  "requestId", "sessionId", "stop_reason", "stop_sequence",
  "usage", "id", "role", "parentUuid", "uuid", "thinkingMetadata",
];
const REDACT_KEYS = ["data"];

/** 1つのセッションファイルを処理し、イベント・エントリを返す */
async function loadSession(sessionFile: string) {
  const text = await Bun.file(sessionFile).text();
  return parseJsonl(text) as unknown as SessionEntry[];
}

/** 静的なコマンドヘルプ文字列を構築 */
function buildCommandHelp(): string {
  const prog = progName("timeline");
  return `${prog} <SESSION_ID ..> [[RANGE1][..][RANGE2] ..] [--width <55>] [-t <UTRFWBGASQDI>] [--color [always|=[=none]] [--md [render|=source|[=none]] [--grep <REGEXP>] [-B <N>] [-A <N>] [-C <N>] [--since <DURATION|DATE>] [--last-since <DURATION>] [--last-turn <N>] [--jsonl [=redact|full|[=none]]] [--help]`;
}

/** md front matter 用 command_computed を構築 */
function buildCommandComputed(
  opts: ReturnType<typeof parseArgs>,
  resolvedInputs: string[],
  filtered: TimelineEvent[],
  isTty: boolean,
): string {
  const prog = progName("timeline");
  const parts: string[] = [prog];

  // 解決済みセッションID
  parts.push(resolvedInputs.join(" "));

  // 実際のイベント範囲
  if (filtered.length > 0) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    parts.push(`${first.turn} ${first.kind}${first.ref}..${last.turn} ${last.kind}${last.ref}`);
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

  // フォールバック: inputs が空で range に4桁以下の数字がある場合、session ID として試す
  // (例: "timeline 1234" → "1234" は turn range と判定されるが、セッションIDの可能性もある)
  if (opts.inputs.length === 0 && !args.includes("--help") && opts.from && opts.from === opts.to && PURE_NUMBER_RE.test(opts.from)) {
    try {
      await resolveSession(opts.from);
      opts.inputs.push(opts.from);
      opts.from = "";
      opts.to = "";
      opts.help = false;
    } catch {
      // resolve 失敗 → range のまま
    }
  }

  if (opts.help) {
    const explicit = args.includes("--help");
    printUsage(explicit ? process.stdout : process.stderr);
    process.exit(explicit ? 0 : 1);
  }

  const isTty = process.stdout.isTTY ?? false;

  // セッション解決（複数入力対応）+ エントリ読み込みを一括で行う
  const resolved: { file: string; startTime: number; fullId: string; entries: SessionEntry[] }[] = [];
  for (const input of opts.inputs) {
    const file = await resolveSession(input);
    const entries = await loadSession(file);
    const fullId = (file.split("/").pop() || "").replace(/\.jsonl$/, "");
    const startTime = entries.length > 0 && "timestamp" in entries[0] ? new Date((entries[0] as any).timestamp).getTime() : Infinity;
    resolved.push({ file, startTime, fullId, entries });
  }

  // start時刻の古い順にソート
  resolved.sort((a, b) => a.startTime - b.startTime);

  // 全セッションのイベントを結合（allEntries は jsonl モード時のみ構築）
  let allEntries: SessionEntry[] | undefined;
  let allEvents: ReturnType<typeof extractEvents> = [];
  for (const { entries } of resolved) {
    if (opts.jsonlMode !== "none") {
      allEntries = (allEntries || []).concat(entries);
    }
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
      lastTurn: opts.lastTurn,
      lastSince: opts.lastSince,
      before: opts.before,
      after: opts.after,
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
      const id = event.ref;
      const matchType = event.kind;

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
    await writeJsonl(output.join("\n"));
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
  const command = `${progName("timeline")} ${args.join(" ")}`;
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

function printUsage(out: NodeJS.WritableStream = process.stdout) {
  const prog = progName("timeline");
  out.write(`Usage: ${prog} [options] <session_id_or_file> [range]

Options:
  -t <types>                  Filter by type (default: UTRFWBGASQDI)
  --width <width>             Truncation width (default: 55)
  --timestamps                Show timestamps
  --no-timestamps             Disable timestamps (overrides md default)
  --color[=auto|always|none]  Color output (default: auto)
  --emoji                     Always show emoji
  --no-emoji                  Never show emoji
  --grep <pattern>            Filter events by desc (regex)
  -A N, --after N             Show N turns after grep match
  -B N, --before N            Show N turns before grep match
  -C N, --context N           Show N turns before and after grep match
  --since <spec>              Show events since (duration: 1h,30m,2d or date)
  --last-since <duration>     Show events since duration before session end
  --last-turn <N>             Show last N turns (U starts a turn)
                              Both: use whichever gives more events
  --md[=auto|source|render|none]  Full text for Q/T/R/U (default: none)
                              auto=render if tty, source otherwise
  --jsonl[=none|redact|full]  JSONL output (default: none)
                              redact: omit+redact, full: redact only
  --help                      Show this help

Types:
  U=User T=Think R=Response F=File W=Web B=Bash
  G=Grep/Glob A=Agent S=Skill Q=Question D=toDo I=Info

Range:
  N          Turn N only
  N..M       Turns N to M
  N..        Turn N to end
  ..M        Start to turn M
  marker..   From marker to end (e.g. Uabc1234..)
  from..to   Between markers
  marker     Single marker only

Examples:
  ${prog} SID                                          Show timeline
  ${prog} /path/to/session.jsonl                       Show timeline from file
  ${prog} SID --md -t RU                               User & Response full text
  ${prog} SID --md -t RUT                              With Think for more context
  ${prog} SID --md -t TRU --last-since 2h --last-turn 10
                                                       Recent turns for context recovery
  ${prog} SID --timestamps                             Show with timestamps
  ${prog} SID --grep "README"                          Filter events matching pattern
  ${prog} SID --grep README -C 1                       Grep with 1 turn context
  ${prog} SID --since 1h                               Show events from last 1 hour
  ${prog} SID --last-turn 3                            Show last 3 turns
  ${prog} SID --last-since 30m                         Show events from last 30m of session
  ${prog} SID Uabc1234..Rabc5678                       Show range between markers
  ${prog} SID 3                                        Show turn 3 only
  ${prog} SID 3..5                                     Show turns 3 to 5
  ${prog} SID 3..                                      Show from turn 3 to end\n`);
}
