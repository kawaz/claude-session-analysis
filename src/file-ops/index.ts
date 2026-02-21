#!/usr/bin/env bun
import { resolveSession } from "../resolve-session.ts";
import { extractFileOpsFromJsonl } from "./extract.ts";

async function main() {
  const input = process.argv[2];

  if (!input || input === "--help") {
    const prog = process.env._PROG || "file-ops";
    console.log(`Usage: ${prog} <session_id_or_file>`);
    if (!input) process.exit(1);
    return;
  }

  const sessionFile = await resolveSession(input);
  const text = await Bun.file(sessionFile).text();
  const result = extractFileOpsFromJsonl(text);

  await Bun.write(Bun.stdout, JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
