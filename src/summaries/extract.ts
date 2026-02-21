/**
 * JSONL エントリ配列から type=="summary" のエントリの .summary を抽出する。
 * jq 版: [.[] | objects | select(.type=="summary") | .summary]
 */
export function extractSummaries(entries: unknown[]): unknown[] {
  return entries
    .filter((e): e is Record<string, unknown> =>
      e !== null && typeof e === "object" && !Array.isArray(e)
    )
    .filter((e) => e.type === "summary")
    .map((e) => e.summary);
}
