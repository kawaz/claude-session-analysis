import { describe, test, expect } from "bun:test";
import { extractSummaries } from "./extract.ts";

describe("extractSummaries", () => {
  test("type=summary のエントリから .summary を抽出", () => {
    const entries = [
      { type: "summary", summary: "First summary" },
      { type: "summary", summary: "Second summary" },
    ];
    expect(extractSummaries(entries)).toEqual([
      "First summary",
      "Second summary",
    ]);
  });

  test("type=summary 以外のエントリは無視", () => {
    const entries = [
      { type: "user", uuid: "aaa", message: { content: "hello" } },
      { type: "summary", summary: "Only summary" },
      { type: "assistant", uuid: "bbb", message: { content: [] } },
    ];
    expect(extractSummaries(entries)).toEqual(["Only summary"]);
  });

  test("空配列は空配列を返す", () => {
    expect(extractSummaries([])).toEqual([]);
  });

  test("summary エントリが無い場合は空配列", () => {
    const entries = [
      { type: "user", uuid: "aaa", message: { content: "hello" } },
      { type: "assistant", uuid: "bbb", message: { content: [] } },
    ];
    expect(extractSummaries(entries)).toEqual([]);
  });

  test("summary フィールドが無い type=summary エントリは undefined になる", () => {
    const entries = [
      { type: "summary" },
    ];
    // jq の .summary は null を返すが、TS では undefined
    expect(extractSummaries(entries)).toEqual([undefined]);
  });

  test("配列要素（非オブジェクト）はスキップ", () => {
    // jq の objects フィルタに相当: 非オブジェクトをスキップ
    const entries = [
      "not an object",
      42,
      null,
      { type: "summary", summary: "valid" },
    ];
    expect(extractSummaries(entries as unknown[])).toEqual(["valid"]);
  });

  test("summary の値がオブジェクトの場合もそのまま返す", () => {
    const entries = [
      { type: "summary", summary: { title: "complex", detail: "data" } },
    ];
    expect(extractSummaries(entries)).toEqual([
      { title: "complex", detail: "data" },
    ]);
  });
});
