import type {
  SessionEntry,
  TimelineEvent,
  ContentBlock,
  UserEntry,
  AssistantEntry,
  SystemEntry,
  FileHistorySnapshotEntry,
  ExtractResult,
  ForkInfo,
} from "./types.ts";
import { shortenPath, lastSegments, isUserTurn, getSessionCwd, isSlashCommandContent, findForkSplit } from "../lib.ts";

/** turn 未付与のイベント（内部用） */
type RawEvent = Omit<TimelineEvent, "turn">;

// XMLタグの値を取得するヘルパー
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>(.*?)</${tag}>`, "s");
  const m = xml.match(re);
  return m ? m[1] : "";
}

// XML属性値を取得するヘルパー
function extractAttr(xml: string, attr: string): string {
  const re = new RegExp(`${attr}="([^"]*)"`, "s");
  const m = xml.match(re);
  return m ? m[1] : "";
}

/** エントリ列から RawEvent 列（turn 未付与）を生成する */
function extractRawEvents(entries: SessionEntry[]): RawEvent[] {
  const raw: RawEvent[] = [];

  // session_cwd: 最初の cwd を持つエントリから取得（全エントリ型を検索）
  const sessionCwd = getSessionCwd(entries as unknown as Record<string, unknown>[]);

  for (const entry of entries) {
    switch (entry.type) {
      case "user":
        extractUserEvents(entry, raw);
        break;
      case "assistant":
        extractAssistantEvents(entry, raw);
        break;
      case "system":
        extractSystemEvents(entry, raw);
        break;
      case "file-history-snapshot":
        extractFileSnapshotEvents(entry, sessionCwd, raw);
        break;
    }
  }

  return raw;
}

/** RawEvent 列に turn 番号を付与: U イベントが来たら turn をインクリメント（1 始まり） */
function assignTurns(raw: RawEvent[]): TimelineEvent[] {
  let turn = 0;
  const events: TimelineEvent[] = [];
  for (const r of raw) {
    if (r.kind === "U") {
      turn++;
    }
    events.push({ ...r, turn });
  }
  return events;
}

export function extractEvents(entries: SessionEntry[]): TimelineEvent[] {
  return assignTurns(extractRawEvents(entries));
}

/**
 * fork を考慮したイベント抽出。
 *
 * forked セッション（jsonl 内に forkedFrom を持つ entry がある）の場合:
 * - fork 前（親からのコピー entry 群）を除外し、fork 後のみを返す。
 * - turn は fork 後の最初の U を 1 として振り直す（assignTurns が fork 後 raw に対して走るため）。
 * - ForkInfo を返す。marker は「親 timeline で `..marker` 指定すれば fork 前を見られる値」=
 *   親にコピーされた最後の entry（= 子の最後の forkedFrom 付き entry。uuid は親と共通）に
 *   対応する timeline marker（kind+ref）。コピー entry 群だけで extract したときに
 *   timeline 上に現れる最後のイベントの kind+ref を採用する（その entry が複数イベントを
 *   生む場合は最後のイベント。timeline に現れないなら直前のコピー entry のイベントに遡る）。
 *
 * 通常セッション（forkedFrom なし）は extractEvents と完全に同一の events を返し、fork は null。
 */
export function extractEventsWithFork(entries: SessionEntry[]): ExtractResult {
  // fork 境界判定は lib.ts の findForkSplit に集約（timeline / sessions の単一の正）。
  // findings 仕様: fork 後の開始は「最初の forkedFrom 無し type:"user" entry」。
  // 境界の非 user（custom-title / 自動応答 assistant / system / file-history-snapshot）は
  // fork 後に含めない（含めると turn 0 の孤立イベントが出てしまう）。
  const split = findForkSplit(entries as unknown as Record<string, unknown>[]);
  if (!split.hasFork) {
    return { events: extractEvents(entries), fork: null };
  }

  const copyEntries = entries.slice(0, split.lastCopyIndex + 1);
  const forkedEntries = entries.slice(split.splitIndex);

  // fork 後イベント（turn は 1 から振り直し）
  const events = assignTurns(extractRawEvents(forkedEntries));

  // marker 算出: コピー entry 群だけで extract し、timeline 上に現れる最後のイベントの kind+ref。
  // コピー entry の中には timeline にイベントを生まないもの（isMeta 等）もあるため、
  // 「最後に実際に現れたイベント」を採用する（末尾コピー entry が無イベントなら手前に遡る）。
  const copyEvents = extractRawEvents(copyEntries);
  let marker = "";
  if (copyEvents.length > 0) {
    const last = copyEvents[copyEvents.length - 1];
    marker = `${last.kind}${last.ref}`;
  }

  const fork: ForkInfo = {
    // splitIndex が見つからない（fork 後 user が無い）異常系では parentSessionId が null のことは無いが、
    // null の場合は index.ts 側でヒント抑制する（修正5）。
    parentSessionId: split.parentSessionId ?? "",
    marker,
  };
  return { events, fork };
}

function extractUserEvents(entry: UserEntry, events: RawEvent[]): void {
  const ref = entry.uuid.slice(0, 8);
  const time = entry.timestamp;

  // isUserTurn で判定: true なら U イベント処理
  if (isUserTurn(entry as Record<string, unknown>)) {
    const content = entry.message.content;
    if (typeof content === "string") {
      extractUserStringContent(content, ref, time, events);
    } else if (Array.isArray(content)) {
      extractUserArrayContent(content, ref, time, events);
    }
    return;
  }

  // false → I イベント分類（timeline 固有ロジック）
  if (entry.isCompactSummary === true) {
    events.push({ kind: "I", ref, time, desc: "[auto-compact]" });
    return;
  }
  if (entry.isMeta === true) {
    return;
  }

  // content からテキストを抽出して I イベントに分類
  const content = entry.message?.content;
  if (!content) return;

  if (typeof content === "string") {
    classifyNonUserStringContent(content, ref, time, events);
  } else if (Array.isArray(content)) {
    classifyNonUserArrayContent(content, ref, time, events);
  }
}

function extractUserStringContent(
  content: string,
  ref: string,
  time: string,
  events: RawEvent[],
): void {
  // isUserTurn ガード通過済み: I 分類対象はここに来ない

  // XML風スラッシュコマンド（判定基準は lib.ts の共通関数に集約）
  if (isSlashCommandContent(content)) {
    const cmd = extractTag(content, "command-name");
    const args = extractTag(content, "command-args");
    events.push({ kind: "U", ref, time, desc: `${cmd} ${args}` });
    return;
  }

  // 通常テキスト
  events.push({ kind: "U", ref, time, desc: content });
}

function extractUserArrayContent(
  content: ContentBlock[],
  ref: string,
  time: string,
  events: RawEvent[],
): void {
  // isUserTurn ガード通過済み: I 分類対象はここに来ない
  for (const block of content) {
    if (block.type !== "text") continue;
    const text = block.text as string;
    events.push({ kind: "U", ref, time, desc: text });
  }
}

function classifyNonUserStringContent(
  content: string,
  ref: string,
  time: string,
  events: RawEvent[],
): void {
  if (content.startsWith("[Request interrupted")) {
    events.push({ kind: "I", ref, time, desc: content });
    return;
  }
  if (content.startsWith("<task-notification>")) {
    const summary = extractTag(content, "summary");
    events.push({ kind: "I", ref, time, desc: `[task-notification] ${summary}` });
    return;
  }
  if (content.startsWith("<teammate-message")) {
    const teammateId = extractAttr(content, "teammate_id");
    events.push({ kind: "I", ref, time, desc: `[teammate-message] ${teammateId}` });
    return;
  }
}

function classifyNonUserArrayContent(
  content: ContentBlock[],
  ref: string,
  time: string,
  events: RawEvent[],
): void {
  for (const block of content) {
    if (block.type !== "text") continue;
    classifyNonUserStringContent(block.text as string, ref, time, events);
  }
}

function extractAssistantEvents(entry: AssistantEntry, events: RawEvent[]): void {
  const ref = entry.uuid.slice(0, 8);
  const timestamp = entry.timestamp;
  const content = entry.message.content;

  for (let i = 0; i < content.length; i++) {
    const block = content[i];
    const timeSuffix = `${timestamp}_${String(i).padStart(5, "0")}`;

    if (block.type === "thinking") {
      const thinking = block.thinking as string;
      if (thinking.replace(/\s/g, "").length === 0) continue;
      events.push({ kind: "T", ref, time: timestamp, desc: thinking });
    } else if (block.type === "text") {
      const text = block.text as string;
      // 空白のみスキップ
      if (text.replace(/\s/g, "").length === 0) continue;
      events.push({ kind: "R", ref, time: timestamp, desc: text });
    } else if (block.type === "tool_use") {
      extractToolUseEvent(block, ref, timeSuffix, events);
    }
  }
}

function extractToolUseEvent(
  block: ContentBlock,
  ref: string,
  time: string,
  events: RawEvent[],
): void {
  const name = block.name as string;
  const input = (block.input || {}) as Record<string, unknown>;

  // F (File) - Read
  if (name === "Read") {
    events.push({
      kind: "F",
      ref,
      time,
      desc: lastSegments(input.file_path as string),
    });
    return;
  }

  // F (File) - Write/Edit (no-backup)
  if (name === "Write" || name === "Edit") {
    events.push({
      kind: "F",
      ref,
      time,
      desc: `${lastSegments(input.file_path as string)} no-backup-${name.toLowerCase()}`,
    });
    return;
  }

  // W (Web)
  if (name === "WebFetch" || name === "WebSearch") {
    events.push({
      kind: "W",
      ref,
      time,
      desc: (input.url as string) || (input.query as string) || "",
      notrunc: true,
    });
    return;
  }

  // B (Bash)
  if (name === "Bash" || name === "BashOutput") {
    let desc = (input.command as string) || (input.description as string) || "";
    // パス短縮: / で始まる場合
    if (desc.startsWith("/")) {
      const parts = desc.split(" ");
      parts[0] = shortenPath(parts[0]);
      desc = parts.join(" ");
    }
    events.push({ kind: "B", ref, time, desc });
    return;
  }

  // G (Grep/Glob)
  if (name === "Grep" || name === "Glob") {
    events.push({
      kind: "G",
      ref,
      time,
      desc: `${name}: ${input.pattern as string}`,
    });
    return;
  }

  // A (Agent/Task)
  if (name === "Task") {
    const blockId = ((block.id as string) || "").slice(-8);
    const description = (input.description as string) || "";
    const prompt = (input.prompt as string) || "";
    const desc = `${blockId} ${description}: ${prompt}`;
    events.push({ kind: "A", ref, time, desc });
    return;
  }
  if (name === "TaskOutput") {
    events.push({
      kind: "A",
      ref,
      time,
      desc: `${input.task_id as string} output`,
    });
    return;
  }

  // S (Skill)
  if (name === "Skill") {
    events.push({
      kind: "S",
      ref,
      time,
      desc: input.skill as string,
    });
    return;
  }

  // Q (Question)
  if (name === "AskUserQuestion") {
    const questions = input.questions as { question: string }[] | undefined;
    events.push({
      kind: "Q",
      ref,
      time,
      desc: questions?.[0]?.question || "",
    });
    return;
  }

  // D (toDo)
  if (name === "TodoWrite") {
    const todos = input.todos as unknown[] | undefined;
    events.push({
      kind: "D",
      ref,
      time,
      desc: `Todo: ${todos?.length || 0} items`,
    });
    return;
  }
}

function extractSystemEvents(entry: SystemEntry, events: RawEvent[]): void {
  const ref = entry.uuid.slice(0, 8);
  const time = entry.timestamp;
  const content = entry.content;

  if (!content) return;

  // スラッシュコマンド
  const trimmed = content.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.includes("<command-name>")) {
    const cmd = extractTag(content, "command-name");
    const args = extractTag(content, "command-args");
    events.push({ kind: "U", ref, time, desc: `${cmd} ${args}` });
  }
}

function extractFileSnapshotEvents(
  entry: FileHistorySnapshotEntry,
  sessionCwd: string,
  events: RawEvent[],
): void {
  const ref = entry.messageId.slice(0, 8);
  const backups = entry.snapshot.trackedFileBackups;

  for (const [key, backup] of Object.entries(backups)) {
    if (!backup.backupFileName) continue;

    let path = key;
    if (!path.startsWith("/")) {
      path = `${sessionCwd}/${path}`;
    }
    const bfn = backup.backupFileName;
    const hash = bfn.split("@")[0].slice(0, 8);
    const version = bfn.split("@")[1];
    events.push({
      kind: "F",
      ref,
      time: backup.backupTime,
      desc: `${lastSegments(path)} ${hash}@${version}`,
    });
  }
}
