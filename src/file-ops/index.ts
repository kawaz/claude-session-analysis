import { resolveSession } from "../resolve-session.ts";
import { extractFileOpsFromJsonl } from "./extract.ts";

export async function run(args: string[]) {
  const input = args[0];

  if (!input || input === "--help") {
    const prog = process.env._PROG || "file-ops";
    const out = !input ? console.error : console.log;
    out(`Usage: ${prog} <session_id_or_file>`);
    if (!input) process.exit(1);
    return;
  }

  const sessionFile = await resolveSession(input);
  const text = await Bun.file(sessionFile).text();
  const result = extractFileOpsFromJsonl(text);

  await Bun.write(Bun.stdout, JSON.stringify(result, null, 2) + "\n");
}
