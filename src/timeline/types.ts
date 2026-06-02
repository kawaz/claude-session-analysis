// イベントの種類
// U=User  T=Think  R=Response  F=File(read/write/backup)
// W=Web(fetch/search)  B=Bash  G=Grep/Glob  A=Agent(sub-agent)
// S=Skill  Q=Question(AskUser)  D=toDo(task)  I=Info(system/notification)
export type EventKind = "U" | "T" | "R" | "F" | "W" | "B" | "G" | "A" | "S" | "Q" | "D" | "I";

// タイムラインイベント
export interface TimelineEvent {
  kind: EventKind;
  turn: number; // ターン番号 (Uイベントでインクリメント)
  ref: string; // 8桁hex (uuid先頭8文字)
  time: string; // ISO8601。ソート用サフィックス "_NNNNN" 付きの場合あり
  desc: string;
  notrunc?: boolean; // trueならtruncateしない (WebFetchのURL等)
}

// JSONLエントリ内のコンテンツブロック
export interface ContentBlock {
  type: string;
  [key: string]: unknown;
}

// ファイルバックアップエントリ
export interface BackupEntry {
  backupFileName: string; // "hash@vN" 形式
  backupTime: string; // ISO8601
}

// 入力JSONLエントリの discriminated union
export type SessionEntry = UserEntry | AssistantEntry | SystemEntry | FileHistorySnapshotEntry;

// fork したセッションで親からコピーされた entry に付与される。
// findings 2026-05-29-btw-fork-session-recording 参照。
export interface ForkedFrom {
  sessionId: string;
}

export interface UserEntry {
  type: "user";
  uuid: string;
  timestamp: string;
  message: { content: string | ContentBlock[] };
  isMeta?: boolean;
  isCompactSummary?: boolean;
  cwd?: string;
  forkedFrom?: ForkedFrom;
}

export interface AssistantEntry {
  type: "assistant";
  uuid: string;
  timestamp: string;
  message: { content: ContentBlock[] };
  forkedFrom?: ForkedFrom;
}

export interface SystemEntry {
  type: "system";
  uuid: string;
  timestamp: string;
  content: string;
  forkedFrom?: ForkedFrom;
}

export interface FileHistorySnapshotEntry {
  type: "file-history-snapshot";
  messageId: string;
  snapshot: {
    trackedFileBackups: Record<string, BackupEntry>;
  };
}

// fork ヘッダ情報。fork したセッション（forkedFrom を持つ entry がある）でのみ非 null。
// 親で `timeline <parentSessionId> ..<marker>` すると fork 前を見られる、という案内に使う。
export interface ForkInfo {
  parentSessionId: string; // forkedFrom.sessionId（コピー元の親 sessionId）
  marker: string; // 親 timeline 上での「コピーされた最後の entry」の marker（kind+ref 形式、例: Rabc1234）
}

// fork を考慮したイベント抽出結果。
export interface ExtractResult {
  events: TimelineEvent[];
  fork: ForkInfo | null; // fork でなければ null
}

// 範囲マーカー（パース済み）
export interface RangeMarker {
  id: string; // マーカーID（タイプ文字除去済み）
  offset: number; // +N or -N
}

// CLI引数パース結果
export interface ParsedArgs {
  types: string; // default: "UTRFWBGASQDI"
  width: number; // default: 55
  timestamps: boolean; // default: false
  color: "auto" | "always" | "none"; // default: "auto"
  jsonlMode: "none" | "redact" | "full"; // default: "none"
  inputs: string[]; // セッションID or ファイルパス（複数可）
  from: string; // 範囲開始（空文字列 = 先頭から）
  to: string; // 範囲終了（空文字列 = 末尾まで）
  mdMode: "none" | "auto" | "render" | "source"; // default: "none"
  emoji: "auto" | "always" | "never"; // default: "auto"
  grep: string; // --grep pattern (default: "")
  since: string; // --since spec (default: "")
  lastTurn: number; // --last-turn N (default: 0 = disabled)
  lastSince: string; // --last-since spec (default: "")
  after: number; // -A/--after N (default: 0)
  before: number; // -B/--before N (default: 0)
  help: boolean; // --help
}
