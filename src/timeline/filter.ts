import type { TimelineEvent, RangeMarker } from "./types.ts";
import { parseDuration } from "../sessions/search.ts";

const DURATION_RE = /^(\d+[smhd])+$/;

/** time+kind+descの組み合わせで重複排除。最初に出現したものを残す */
export function dedup(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const result: TimelineEvent[] = [];
  for (const e of events) {
    const key = `${e.time}\0${e.kind}\0${e.desc}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }
  return result;
}

/**
 * refでグループ化し、グループ内に@vを含むdescがあればno-backupエントリを除去。
 * 結果はtimeでソート。
 */
export function removeNoBackup(events: TimelineEvent[]): TimelineEvent[] {
  // refでグループ化
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const group = groups.get(e.ref);
    if (group) {
      group.push(e);
    } else {
      groups.set(e.ref, [e]);
    }
  }

  const result: TimelineEvent[] = [];
  for (const group of groups.values()) {
    const hasBackup = group.some((e) => e.desc.includes("@v"));
    if (hasBackup) {
      for (const e of group) {
        if (!e.desc.includes("no-backup")) {
          result.push(e);
        }
      }
    } else {
      result.push(...group);
    }
  }

  return result.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/**
 * 範囲マーカー文字列をパース。
 * - 先頭が大文字+hex (`/^[A-Z][a-f0-9]/`) なら先頭1文字を除去
 * - 末尾の +N or -N をオフセットとして抽出
 */
export function parseRangeMarker(s: string): RangeMarker {
  if (s === "") return { id: "", offset: 0 };

  let rest = s;

  // 先頭がA-Z + hex なら先頭1文字を除去
  if (/^[A-Z][a-f0-9]/.test(rest)) {
    rest = rest.slice(1);
  }

  // 末尾の +N or -N を抽出
  const offsetMatch = rest.match(/([+-]\d+)$/);
  let offset = 0;
  if (offsetMatch) {
    offset = parseInt(offsetMatch[1], 10);
    rest = rest.slice(0, -offsetMatch[1].length);
  }

  return { id: rest, offset };
}

/** from..to の範囲でイベントをフィルタ */
export function filterByRange(
  events: TimelineEvent[],
  from: string,
  to: string,
): TimelineEvent[] {
  if (events.length === 0) return [];

  const fromMarker = parseRangeMarker(from);
  const toMarker = parseRangeMarker(to);

  let fromIdx: number;
  if (fromMarker.id === "") {
    fromIdx = 0;
  } else {
    const idx = events.findIndex((e) => e.ref.startsWith(fromMarker.id));
    if (idx === -1) {
      fromIdx = 0;
    } else {
      fromIdx = idx + fromMarker.offset;
    }
  }

  let toIdx: number;
  if (toMarker.id === "") {
    toIdx = events.length - 1;
  } else {
    // 最後のマッチを見つける
    let lastIdx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].ref.startsWith(toMarker.id)) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx === -1) {
      toIdx = events.length - 1;
    } else {
      toIdx = lastIdx + toMarker.offset;
    }
  }

  // クランプ
  fromIdx = Math.max(0, Math.min(fromIdx, events.length - 1));
  toIdx = Math.max(0, Math.min(toIdx, events.length - 1));

  return events.slice(fromIdx, toIdx + 1);
}

/** descを正規表現でフィルタ */
export function filterByGrep(events: TimelineEvent[], pattern: string): TimelineEvent[] {
  const re = new RegExp(pattern);
  return events.filter((e) => re.test(e.desc));
}

/** types文字列に含まれるkindのイベントのみフィルタ */
export function filterByType(events: TimelineEvent[], types: string): TimelineEvent[] {
  return events.filter((e) => types.includes(e.kind));
}

/** --since spec を cutoff ISO文字列に変換。空文字列なら空文字列を返す */
function parseSinceSpec(spec: string): string {
  if (spec === "") return "";
  if (DURATION_RE.test(spec)) {
    const seconds = parseDuration(spec);
    return new Date(Date.now() - seconds * 1000).toISOString();
  }
  const d = new Date(spec);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid --since value: ${spec}`);
  }
  return d.toISOString();
}

/** since指定以降のイベントのみ返す */
export function filterBySince(events: TimelineEvent[], since: string): TimelineEvent[] {
  if (since === "") return events;
  const cutoff = parseSinceSpec(since);
  return events.filter((e) => {
    const time = e.time.split("_")[0];
    return time >= cutoff;
  });
}

/** イベント列をU区切りでターンに分割 */
export function splitTurns(events: TimelineEvent[]): TimelineEvent[][] {
  if (events.length === 0) return [];
  const turns: TimelineEvent[][] = [];
  let current: TimelineEvent[] = [];
  for (const e of events) {
    if (e.kind === "U" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

/** 末尾Nターンを返す。N=0 は全件返す */
export function filterByLastTurn(events: TimelineEvent[], n: number): TimelineEvent[] {
  if (n <= 0) return events;
  const turns = splitTurns(events);
  const start = Math.max(0, turns.length - n);
  return turns.slice(start).flat();
}

/** セッション末尾時刻から逆算した since フィルタ */
export function filterByLastSince(events: TimelineEvent[], spec: string): TimelineEvent[] {
  if (spec === "" || events.length === 0) return events;
  // 末尾イベントの時刻を基準にする
  const lastTime = events[events.length - 1].time.split("_")[0];
  const lastMs = new Date(lastTime).getTime();
  if (!DURATION_RE.test(spec)) {
    throw new Error(`Invalid --last-since value: ${spec} (expected duration like 1h, 30m, 2d)`);
  }
  const seconds = parseDuration(spec);
  const cutoff = new Date(lastMs - seconds * 1000).toISOString();
  return events.filter((e) => {
    const time = e.time.split("_")[0];
    return time >= cutoff;
  });
}

/** grep + ターン単位前後コンテキスト */
export function filterByGrepContext(
  events: TimelineEvent[],
  pattern: string,
  before: number,
  after: number,
): TimelineEvent[] {
  const turns = splitTurns(events);
  const re = new RegExp(pattern);

  // マッチするターンのインデックスを特定
  const matchIndices = new Set<number>();
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].some((e) => re.test(e.desc))) {
      matchIndices.add(i);
    }
  }

  if (matchIndices.size === 0) return [];

  // 前後コンテキスト展開
  const includeIndices = new Set<number>();
  for (const idx of matchIndices) {
    for (let j = Math.max(0, idx - before); j <= Math.min(turns.length - 1, idx + after); j++) {
      includeIndices.add(j);
    }
  }

  // ソート済みインデックス順にflatten
  const sorted = [...includeIndices].sort((a, b) => a - b);
  return sorted.flatMap((i) => turns[i]);
}

/** pipeline */
export function pipeline(
  events: TimelineEvent[],
  opts: {
    types: string; from: string; to: string;
    grep?: string; since?: string;
    lastTurn?: number; lastSince?: string;
    before?: number; after?: number;
  },
): TimelineEvent[] {
  let result = dedup(events);
  result = removeNoBackup(result);
  result = result.sort((a, b) =>
    a.time < b.time ? -1 : a.time > b.time ? 1 :
    a.ref < b.ref ? -1 : a.ref > b.ref ? 1 :
    a.desc < b.desc ? -1 : a.desc > b.desc ? 1 : 0
  );
  if (opts.since) {
    result = filterBySince(result, opts.since);
  }
  if (opts.lastSince) {
    result = filterByLastSince(result, opts.lastSince);
  }
  result = filterByRange(result, opts.from, opts.to);
  result = filterByType(result, opts.types);
  if (opts.lastTurn && opts.lastTurn > 0) {
    result = filterByLastTurn(result, opts.lastTurn);
  }
  // grep: A/B/C が指定されていればターン単位コンテキスト、なければ行フィルタ
  if (opts.grep) {
    const hasContext = (opts.before && opts.before > 0) || (opts.after && opts.after > 0);
    if (hasContext) {
      result = filterByGrepContext(result, opts.grep, opts.before ?? 0, opts.after ?? 0);
    } else {
      result = filterByGrep(result, opts.grep);
    }
  }
  return result;
}
