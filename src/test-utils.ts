/**
 * テスト共通ヘルパ。
 *
 * `noUncheckedIndexedAccess` のため `arr[N]` が `T | undefined` になるが、
 * fixture セットアップで「ここは絶対 N 要素ある」が分かっている箇所では
 * `unwrap(arr[N])` で取り出し、想定外時には test name 付き失敗にする。
 * 失敗時のメッセージで `?.` 経由よりも「どの要素が空だったか」がはっきり出る。
 *
 * 0 / "" / false 等の falsy 値は通過する (`null`/`undefined` だけを弾く)。
 * 失敗メッセージでは `null` と `undefined` を明示的に区別して出力する。
 */
export function unwrap<T>(v: T | undefined | null, name = "value"): T {
  if (v === undefined) throw new Error(`unwrap: expected ${name} to be defined, got undefined`);
  if (v === null) throw new Error(`unwrap: expected ${name} to be non-null, got null`);
  return v;
}
