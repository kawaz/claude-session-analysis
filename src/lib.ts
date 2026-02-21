export function truncate(str: string, width: number): string {
  if (width <= 0) return str;
  if (str.length <= width) return str;
  return `${str.slice(0, width)}[+${str.length - width}]`;
}

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
