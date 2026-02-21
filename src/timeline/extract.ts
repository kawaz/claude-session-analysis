import type {
  SessionEntry,
  TimelineEvent,
  ContentBlock,
  UserEntry,
  AssistantEntry,
  SystemEntry,
  FileHistorySnapshotEntry,
} from "./types.ts";
import { shortenPath, lastSegments } from "../lib.ts";

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

export function extractEvents(entries: SessionEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // session_cwd: 最初の cwd を持つエントリから取得
  let sessionCwd = "";
  for (const e of entries) {
    if (e.type === "user" && e.cwd) {
      sessionCwd = e.cwd;
      break;
    }
  }

  for (const entry of entries) {
    switch (entry.type) {
      case "user":
        extractUserEvents(entry, events);
        break;
      case "assistant":
        extractAssistantEvents(entry, events);
        break;
      case "system":
        extractSystemEvents(entry, events);
        break;
      case "file-history-snapshot":
        extractFileSnapshotEvents(entry, sessionCwd, events);
        break;
    }
  }

  return events;
}

function extractUserEvents(entry: UserEntry, events: TimelineEvent[]): void {
  const ref = entry.uuid.slice(0, 8);
  const time = entry.timestamp;

  // auto-compact
  if (entry.isCompactSummary === true) {
    events.push({ kind: "I", ref, time, desc: "[auto-compact]" });
    return;
  }

  // isMeta は除外
  if (entry.isMeta === true) {
    return;
  }

  const content = entry.message.content;

  if (typeof content === "string") {
    extractUserStringContent(content, ref, time, events);
  } else if (Array.isArray(content)) {
    extractUserArrayContent(content, ref, time, events);
  }
}

function extractUserStringContent(
  content: string,
  ref: string,
  time: string,
  events: TimelineEvent[],
): void {
  // 除外 → I分類
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

  // XML風スラッシュコマンド
  if (content.startsWith("<") && content.includes("<command-name>")) {
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
  events: TimelineEvent[],
): void {
  for (const block of content) {
    if (block.type !== "text") continue;
    const text = block.text as string;

    // Request interrupted → I
    if (text.startsWith("[Request interrupted")) {
      events.push({ kind: "I", ref, time, desc: text });
      continue;
    }

    // task-notification → I
    if (text.startsWith("<task-notification>")) {
      const summary = extractTag(text, "summary");
      events.push({ kind: "I", ref, time, desc: `[task-notification] ${summary}` });
      continue;
    }

    // teammate-message → I
    if (text.startsWith("<teammate-message")) {
      const teammateId = extractAttr(text, "teammate_id");
      events.push({ kind: "I", ref, time, desc: `[teammate-message] ${teammateId}` });
      continue;
    }

    // XML風スラッシュコマンド
    if (text.startsWith("<") && text.includes("<command-name>")) {
      const cmd = extractTag(text, "command-name");
      const args = extractTag(text, "command-args");
      events.push({ kind: "U", ref, time, desc: `${cmd} ${args}` });
      continue;
    }

    // 通常テキスト
    events.push({ kind: "U", ref, time, desc: text });
  }
}

function extractAssistantEvents(entry: AssistantEntry, events: TimelineEvent[]): void {
  const ref = entry.uuid.slice(0, 8);
  const timestamp = entry.timestamp;
  const content = entry.message.content;

  for (let i = 0; i < content.length; i++) {
    const block = content[i];
    const timeSuffix = `${timestamp}_${String(i).padStart(5, "0")}`;

    if (block.type === "thinking") {
      events.push({ kind: "T", ref, time: timestamp, desc: block.thinking as string });
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
  events: TimelineEvent[],
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

function extractSystemEvents(entry: SystemEntry, events: TimelineEvent[]): void {
  const ref = entry.uuid.slice(0, 8);
  const time = entry.timestamp;
  const content = entry.content;

  if (!content) return;

  // スラッシュコマンド
  if (content.includes("<command-name>")) {
    const cmd = extractTag(content, "command-name");
    const args = extractTag(content, "command-args");
    events.push({ kind: "U", ref, time, desc: `${cmd} ${args}` });
  }
}

function extractFileSnapshotEvents(
  entry: FileHistorySnapshotEntry,
  sessionCwd: string,
  events: TimelineEvent[],
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
