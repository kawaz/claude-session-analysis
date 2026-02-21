import type { EventKind } from "../timeline/types.ts";

export interface ParsedMarker {
  type: string;
  id: string;
}

/**
 * マーカー文字列をパースして type と id に分解する。
 * 例: "U7e2451f" → { type: "U", id: "7e2451f" }
 */
export function parseMarker(marker: string): ParsedMarker {
  const type = marker.replace(/[a-f0-9].*$/, "");
  const id = marker.slice(type.length);
  return { type, id };
}

/**
 * エントリがマーカーにマッチするか判定する。
 * F型: uuid または messageId の先頭一致
 * その他: uuid の先頭一致
 */
function matchesEntry(
  entry: Record<string, unknown>,
  type: string,
  id: string,
): boolean {
  if (type === "F") {
    const uuid = ((entry.uuid as string) || "").slice(0, id.length);
    const messageId = ((entry.messageId as string) || "").slice(0, id.length);
    return uuid === id || messageId === id;
  }
  const uuid = ((entry.uuid as string) || "").slice(0, id.length);
  return uuid === id;
}

/**
 * uuid または messageId を持つエントリのみフィルタする。
 * sh版の `select(.uuid or .messageId)` に相当。
 */
function hasIdentifier(entry: Record<string, unknown>): boolean {
  return Boolean(entry.uuid || entry.messageId);
}

/**
 * エントリ配列から、マーカーに一致するエントリを検索する。
 */
export function findEntries(
  entries: Record<string, unknown>[],
  type: string,
  id: string,
): Record<string, unknown>[] {
  return entries.filter((entry) => matchesEntry(entry, type, id));
}

/**
 * エントリ配列から、マーカーに一致するエントリを前後コンテキスト付きで検索する。
 * sh版の jq -rs による context 取得に相当。
 */
export function findEntriesWithContext(
  entries: Record<string, unknown>[],
  type: string,
  id: string,
  before: number,
  after: number,
): Record<string, unknown>[] {
  // uuid/messageId を持つエントリのみを対象とする（sh版の select(.uuid or .messageId) に相当）
  const indexable = entries.filter(hasIdentifier);

  // マッチするエントリのインデックスを検索
  const matchIdx = indexable.findIndex((entry) => matchesEntry(entry, type, id));
  if (matchIdx === -1) return [];

  // コンテキスト範囲を計算（clamp）
  const start = Math.max(matchIdx - before, 0);
  const end = Math.min(matchIdx + after, indexable.length - 1);

  return indexable.slice(start, end + 1);
}
