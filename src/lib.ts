/**
 * Claude の設定ディレクトリ一覧を返す。
 *
 * 優先順位:
 *   1. CLAUDE_CONFIG_DIR (環境変数 or 引数)
 *   2. $HOME/.claude*\/settings.json の dirname (glob でマッチした全ディレクトリ)
 *
 * 2. はユーザが `.claude-personal` / `.claude-work` のように複数の
 * Claude 環境を切り替えて使っているケースを拾うため。settings.json の存在を
 * 持って「実体ある Claude 設定ディレクトリ」と判定する。
 */
export function getConfigDirs(
  claudeConfigDir?: string,
  home?: string,
): string[] {
  const configDir = claudeConfigDir ?? process.env.CLAUDE_CONFIG_DIR;
  const homeDir = home ?? process.env.HOME;

  const dirs: string[] = [];
  const seen = new Set<string>();
  const add = (d: string) => {
    if (!seen.has(d)) {
      seen.add(d);
      dirs.push(d);
    }
  };

  if (configDir) add(configDir);

  if (homeDir) {
    const glob = new Bun.Glob(".claude*/settings.json");
    for (const match of glob.scanSync({ cwd: homeDir, dot: true })) {
      const dir = `${homeDir}/${match.replace(/\/settings\.json$/, "")}`;
      add(dir);
    }
  }

  return dirs;
}

export function truncate(str: string, width: number): string {
  if (width <= 0) return str;
  if (str.length <= width) return str;
  return `${str.slice(0, width)}[+${str.length - width}]`;
}

// Design rationale: formatSize は 1024 ベース（K=1024, M=1048576）で redact 表示用。
// sessions/format.ts の formatHumanSize は 1000 ベース（K=1e3, M=1e6, G=1e9）でセッション一覧の人間向け表示用。
// 用途が異なるため意図的に2つ並存させている。
export function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(Math.floor(bytes / 1048576 * 10) / 10).toFixed(1)}M`;
  if (bytes >= 1024) return `${(Math.floor(bytes / 1024 * 10) / 10).toFixed(1)}K`;
  return `${bytes}B`;
}

export function omit(obj: unknown, keys: string[]): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => omit(item, keys));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!keys.includes(k)) {
        result[k] = omit(v, keys);
      }
    }
    return result;
  }
  return obj;
}

export function redact(obj: unknown, keys: string[]): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, keys));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (keys.includes(k)) {
        const size = typeof v === "string" ? v.length : JSON.stringify(v).length;
        result[k] = `[omitted:${formatSize(size)}]`;
      } else {
        result[k] = redact(v, keys);
      }
    }
    return result;
  }
  return obj;
}

export function redactWithHint(obj: unknown, keys: string[]): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => redactWithHint(item, keys));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (keys.includes(k)) {
        const size = typeof v === "string" ? v.length : JSON.stringify(v).length;
        result[k] = `[omitted:${formatSize(size)} --raw --no-redact]`;
      } else {
        result[k] = redactWithHint(v, keys);
      }
    }
    return result;
  }
  return obj;
}

export function pick(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) {
      result[k] = obj[k];
    }
  }
  return result;
}

/**
 * user エントリがターン開始（U イベント）になるか判定する。
 *
 * Claude Code の JSONL ではシステムが自動挿入するメッセージも type:"user" になる。
 * これらはユーザーの意思による入力ではないため、ターンカウントから除外する。
 */
export function isUserTurn(entry: Record<string, unknown>): boolean {
  if (entry.type !== "user") return false;
  // isMeta: セッション初期化時のシステムメタデータ。ユーザー入力ではない
  if (entry.isMeta === true) return false;
  // isCompactSummary: コンテキスト圧縮時にClaude Codeが自動生成する要約。ユーザー入力ではない
  if (entry.isCompactSummary === true) return false;

  const message = entry.message as Record<string, unknown> | undefined;
  if (!message) return false;

  // 本文抽出は classifyUserTurn と共通のヘルパを用いる（同一 entry で別テキストを見る非対称を解消）。
  // 配列 content は全 text ブロックを \n 連結。前置除外判定（[Request interrupted 等）は
  // 連結後も先頭ブロックが文字列先頭に来るため startsWith 判定がそのまま機能する。
  const text = extractUserTurnText(entry);

  if (!text) return false;
  // ユーザーが中断した際にClaude Codeが自動挿入する通知。ユーザーの発言ではない
  if (text.startsWith("[Request interrupted")) return false;
  // サブエージェント(Task)の完了通知。Claude Codeが自動挿入する
  if (text.startsWith("<task-notification>")) return false;
  // チーム機能でエージェント間通信に使われる自動メッセージ
  if (text.startsWith("<teammate-message")) return false;

  return true;
}

/** HIDDEN_TAG 判定で除去対象とするシステム注入タグ名。
 * task-notification / teammate-message は isUserTurn() で既に除外済みのためここには含めない。 */
const SYSTEM_TAGS = ["system-reminder", "user-prompt-submit-hook", "local-command-stdout"];
/** HIDDEN_TAG 判定でタグ除去後に許容する残文字数の上限（暫定値）。
 * 50 だと短い実指示まで誤判定するため 20 で「相槌のみ」を拾う想定。
 * 実セッションのタグ後続テキスト長分布を実測して確定予定。 */
const HIDDEN_TAG_RESIDUE_MAX = 20;

/** ASCII (U+0000〜U+007F) のみで構成されるか。絵文字・全角・CJK は非ASCII扱い。 */
function isAsciiOnly(text: string): boolean {
  return /^[\x00-\x7f]*$/.test(text);
}

/** システム注入タグ群を除去後、残りが空 or (≤20文字 かつ ASCII のみ) なら HIDDEN_TAG。
 * 1つもタグを除去できなければ HIDDEN_TAG 扱いしない（stripped=false）。 */
function isHiddenTag(text: string): boolean {
  let remaining = text;
  let stripped = false;
  for (const tag of SYSTEM_TAGS) {
    const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g");
    if (re.test(remaining)) {
      stripped = true;
      remaining = remaining.replace(re, "");
    }
  }
  if (!stripped) return false;
  const residue = remaining.trim();
  if (residue.length === 0) return true;
  return residue.length <= HIDDEN_TAG_RESIDUE_MAX && isAsciiOnly(residue);
}

/** 全文が ASCII のみ かつ 空白区切りで word ≤ 2 なら SHORT_ASCII。
 * word 区切りは \s+ split（句読点は区切らない。\s は全角空白 U+3000 も含む）。 */
function isShortAscii(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || !isAsciiOnly(t)) return false;
  return t.split(/\s+/).filter((w) => w.length > 0).length <= 2;
}

/**
 * isUserTurn() を通過したユーザーターンの本文を分類する純粋関数。
 *
 * 決定根拠:
 * - word 区切りは `\s+` split（句読点は区切らない。JS の \s は全角空白 U+3000 を含む）
 * - HIDDEN_TAG: SYSTEM_TAGS を除去後、残文字が空 or (≤20文字 かつ ASCII) なら hidden_tag
 *   （20 は暫定値で実測確定予定）
 * - SHORT_ASCII: ASCII のみ かつ word ≤ 2
 * - 空文字列・空白のみは effective（安全側フォールバック。short_ascii は意味的に誤り）
 * - 優先度: hidden_tag > short_ascii > effective のカスケード
 *
 * SLASH_ONLY は呼び出し元（extract.ts のスラッシュ分岐）が直接付与する責務のため、本関数の対象外。
 */
export function classifyUserTurnKind(
  text: string,
): "hidden_tag" | "short_ascii" | "effective" {
  if (isHiddenTag(text)) return "hidden_tag";
  if (isShortAscii(text)) return "short_ascii";
  return "effective";
}

/**
 * content がスラッシュコマンド（XML 風 `<command-name>...` 文字列）か判定する。
 *
 * 判定基準は timeline/extract.ts の extractUserStringContent と統一:
 *   trim 後に `<` で始まり `>` で終わり、かつ `<command-name>` を含む。
 *
 * これにより本文中に `<command-name>` を引用しただけのテキスト
 * （例: `これは <command-name> の説明です`）を slash と誤判定しない。
 * extract.ts と classifyUserTurn の双方がこの関数を呼ぶことでコメントの主張を実装で担保する。
 */
export function isSlashCommandContent(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.includes("<command-name>");
}

/**
 * user entry から分類・ターン判定に用いる本文文字列を取り出す。
 *
 * isUserTurn と classifyUserTurn が同一の本文を見るための共通ヘルパ。
 * - string content はそのまま
 * - 配列 content は type:"text" ブロックのみを `\n` 連結（情報欠落しない方向に揃える）
 * - それ以外（content 無し / 非文字列・非配列）は空文字
 */
export function extractUserTurnText(entry: Record<string, unknown>): string {
  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: Record<string, unknown>) => b.type === "text")
      .map((b: Record<string, unknown>) => (b.text as string) ?? "")
      .join("\n");
  }
  return "";
}

/**
 * isUserTurn() を通過した user entry を 1 ターン単位で分類する。
 * effectiveUserTurns 等の集計に用いる。
 *
 * Design rationale:
 * - 1 entry = 1 ターン。timeline では複数 text ブロックを別 U イベントに展開するが、
 *   ターン数集計（isUserTurn ベースの turns）は 1 entry = 1 ターンなので、それに揃える。
 *   複数 text ブロックは改行連結して 1 本文として classifyUserTurnKind に渡す。
 * - スラッシュコマンドは classifyUserTurnKind の責務外（issue PR① の決定）。
 *   ここで `<command-name>` の有無を判定し slash_only を直接付与する。
 *   優先度: slash_only > (classifyUserTurnKind: hidden_tag > short_ascii > effective)。
 *
 * @param entry isUserTurn() が true を返す user entry
 */
export function classifyUserTurn(
  entry: Record<string, unknown>,
): "slash_only" | "hidden_tag" | "short_ascii" | "effective" {
  // isUserTurn と同一の本文抽出を用いる（母集合の不一致を解消）。
  const text = extractUserTurnText(entry);

  if (isSlashCommandContent(text)) return "slash_only";
  return classifyUserTurnKind(text);
}

/**
 * entry の forkedFrom.sessionId を取り出す（無ければ null）。
 * fork 境界判定の単一の正（findings 2026-05-29-btw-fork-session-recording）。
 */
export function getForkedFromSessionId(entry: Record<string, unknown>): string | null {
  const ff = (entry as { forkedFrom?: { sessionId?: unknown } }).forkedFrom;
  if (ff && typeof ff.sessionId === "string") return ff.sessionId;
  return null;
}

/** findForkSplit の戻り値。 */
export interface ForkSplit {
  /** forkedFrom を持つ entry があるか（= forked セッションか） */
  hasFork: boolean;
  /** 親 sessionId（最初に見つかった forkedFrom.sessionId、fork でなければ null） */
  parentSessionId: string | null;
  /** 最後の forkedFrom 付き entry の index（コピー entry 群の末尾、fork でなければ -1） */
  lastCopyIndex: number;
  /**
   * fork 後の開始 index = コピー entry 群が終わった後、最初に現れる
   * 「forkedFrom 無しの type:"user" entry」の位置。
   * findings 仕様: fork args が最初の user prompt になるため境界は type:"user"。
   * 境界直後に custom-title / 自動応答 assistant / system / file-history-snapshot 等の
   * 非 user entry が挟まっても、それらはスキップし最初の user を採用する。
   * fork でない、または fork 後 user が見つからなければ entries.length。
   */
  splitIndex: number;
  /** fork 後最初の新規 user entry の uuid（fork でなければ null） */
  forkFirstNewUuid: string | null;
}

/**
 * エントリ列から fork 境界を判定する。timeline / sessions 両方がこれを呼ぶことで
 * 「fork 後の開始は最初の type:"user" entry、境界の非 user はスキップ」という
 * findings 仕様を単一の実装に集約する（非対称の再発防止）。
 */
export function findForkSplit(entries: Record<string, unknown>[]): ForkSplit {
  let parentSessionId: string | null = null;
  let lastCopyIndex = -1;
  let splitIndex = entries.length;
  let forkFirstNewUuid: string | null = null;
  let sawCopy = false;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const ff = getForkedFromSessionId(entry);
    if (ff !== null) {
      if (parentSessionId === null) parentSessionId = ff;
      lastCopyIndex = i;
      sawCopy = true;
    } else if (sawCopy && forkFirstNewUuid === null && entry.type === "user" && typeof entry.uuid === "string") {
      // コピー entry 群の後、最初の forkedFrom 無し user entry = fork 後の開始。
      // 非 user（custom-title/assistant/system/file-history-snapshot）はスキップ。
      forkFirstNewUuid = entry.uuid as string;
      splitIndex = i;
    }
  }

  return {
    hasFork: sawCopy,
    parentSessionId,
    lastCopyIndex,
    splitIndex,
    forkFirstNewUuid,
  };
}

export function shortenPath(path: string | undefined | null, n: number = 2): string {
  if (!path) return "";
  const segments = path.split("/").filter((s) => s !== "");
  if (segments.length <= n) return path;
  return `\u2026/${segments.slice(-n).join("/")}`;
}

/** パスの末尾 n セグメントを返す（省略記号なし） */
export function lastSegments(path: string | undefined | null, n: number = 2): string {
  if (!path) return "";
  const segments = path.split("/").filter((s) => s !== "");
  if (segments.length <= n) return path;
  return segments.slice(-n).join("/");
}

/**
 * プログラム名を返す。process.env._PROG があればそれを、なければ defaultName を返す。
 */
export function progName(defaultName?: string): string {
  return process.env._PROG || defaultName || "claude-session-analysis";
}

/**
 * Date オブジェクトのタイムゾーンオフセットを "+09:00" 形式で返す。
 */
export function formatTzOffset(date: Date): string {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/** duration 文字列のバリデーション用正規表現 (e.g. "5m", "1h30m", "2d") */
export const DURATION_RE = /^(\d+[smhd])+$/;

/**
 * duration文字列を秒数に変換する。
 * 対応形式: "5m", "1h", "30s", "2d", "1h30m" など
 * s=秒, m=分, h=時, d=日
 */
export function parseDuration(spec: string): number {
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  let total = 0;
  const re = /(\d+)([smhd])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spec)) !== null) {
    total += parseInt(m[1]!, 10) * units[m[2]!]!;
  }
  return total;
}

/**
 * エントリ配列から最初の cwd を取得する。
 */
export function getSessionCwd(entries: Record<string, unknown>[]): string {
  for (const e of entries) {
    if (e.cwd) {
      return e.cwd as string;
    }
  }
  return "";
}

/**
 * JSONL テキストをパースしてエントリ配列を返す。
 */
export function parseJsonl(jsonl: string): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // 不正なJSON行をスキップ
    }
  }
  return entries;
}

/**
 * JSONL文字列をstdoutに出力する。
 * stdoutがTTYかつjqが利用可能なら `jq -c .` を通してカラー出力する。
 */
export async function writeJsonl(text: string): Promise<void> {
  if (!text) return;
  if (process.stdout.isTTY) {
    const which = Bun.spawnSync(["which", "jq"]);
    if (which.exitCode === 0) {
      const proc = Bun.spawn(["jq", "-c", "."], {
        stdin: "pipe",
        stdout: "inherit",
        stderr: "inherit",
      });
      proc.stdin.write(text + "\n");
      proc.stdin.end();
      await proc.exited;
      return;
    }
  }
  process.stdout.write(text + "\n");
}
