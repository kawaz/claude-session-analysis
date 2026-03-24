/**
 * Claude の設定ディレクトリ一覧を返す。
 * CLAUDE_CONFIG_DIR が設定されている場合はそれを優先し、
 * $HOME/.claude と異なる場合は両方を返す。
 */
export function getConfigDirs(
  claudeConfigDir?: string,
  home?: string,
): string[] {
  const configDir = claudeConfigDir ?? process.env.CLAUDE_CONFIG_DIR;
  const defaultDir = `${home ?? process.env.HOME}/.claude`;
  if (!configDir) {
    return [defaultDir];
  }
  if (configDir === defaultDir) {
    return [defaultDir];
  }
  return [configDir, defaultDir];
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
  const content = message.content;

  // string content のチェック
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? (content.find((b: Record<string, unknown>) => b.type === "text") as Record<string, unknown> | undefined)?.text as string | undefined
      : undefined;

  if (!text) return false;
  // ユーザーが中断した際にClaude Codeが自動挿入する通知。ユーザーの発言ではない
  if (text.startsWith("[Request interrupted")) return false;
  // サブエージェント(Task)の完了通知。Claude Codeが自動挿入する
  if (text.startsWith("<task-notification>")) return false;
  // チーム機能でエージェント間通信に使われる自動メッセージ
  if (text.startsWith("<teammate-message")) return false;

  return true;
}

export function shortenPath(path: string, n: number = 2): string {
  const segments = path.split("/").filter((s) => s !== "");
  if (segments.length <= n) return path;
  return `\u2026/${segments.slice(-n).join("/")}`;
}

/** パスの末尾 n セグメントを返す（省略記号なし） */
export function lastSegments(path: string, n: number = 2): string {
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
