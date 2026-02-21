#!/usr/bin/env bun
import { resolveSession } from "../resolve-session.ts";
import { extractSummaries } from "./extract.ts";

async function main() {
  const input = process.argv[2];

  if (!input || input === "--help") {
    const prog = process.env._PROG || "summaries";
    console.log(`Usage: ${prog} <session_id_or_file>`);
    if (!input) process.exit(1);
    process.exit(0);
  }

  // セッション解決
  const sessionFile = await resolveSession(input);

  // JSONL読み込み
  const text = await Bun.file(sessionFile).text();
  const rawLines = text.split("\n").filter((line) => line.trim());
  const entries: unknown[] = [];
  for (const line of rawLines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // 不正なJSON行をスキップ（書き込み途中のデータ等）
    }
  }

  // サマリ抽出
  const summaries = extractSummaries(entries);

  // JSON出力（jq -sf と同じ出力）
  await Bun.write(Bun.stdout, JSON.stringify(summaries, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
