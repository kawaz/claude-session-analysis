import type { TimelineEvent, RangeMarker } from "./types.ts";

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

/** types文字列に含まれるkindのイベントのみフィルタ */
export function filterByType(events: TimelineEvent[], types: string): TimelineEvent[] {
  return events.filter((e) => types.includes(e.kind));
}

/** dedup -> removeNoBackup -> sort(.time) -> filterByRange -> filterByType */
export function pipeline(
  events: TimelineEvent[],
  opts: { types: string; from: string; to: string },
): TimelineEvent[] {
  let result = dedup(events);
  result = removeNoBackup(result);
  result = result.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  result = filterByRange(result, opts.from, opts.to);
  result = filterByType(result, opts.types);
  return result;
}
