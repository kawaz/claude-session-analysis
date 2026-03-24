import { resolveSession } from "../resolve-session.ts";
import { extractFileOps, extractFileOpsDetailed, extractFileOpsFullDetail } from "./extract.ts";
import { findSessionDir } from "../file-diff/resolve.ts";
import { getConfigDirs, writeJsonl, progName, parseJsonl } from "../lib.ts";
import * as path from "node:path";

export async function run(args: string[]) {
  let detail = 0;
  let input: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") {
      printUsage(process.stdout);
      process.exit(0);
    } else if (arg === "--detail") {
      const next = args[i + 1];
      if (next && /^[0-2]$/.test(next)) {
        detail = Number(next);
        i++;
      } else {
        detail++;
      }
    } else if (/^-d+$/.test(arg)) {
      // -d, -dd (each 'd' = +1)
      detail += arg.length - 1;
    } else if (/^-d[0-2]$/.test(arg)) {
      detail = Number(arg.slice(2));
    } else if (arg.startsWith("-")) {
      process.stderr.write(`Unknown option: ${arg}\n`);
      printUsage(process.stderr);
      process.exit(1);
    } else {
      input = arg;
    }
  }

  if (!input) {
    printUsage(process.stderr);
    process.exit(1);
  }

  const sessionFile = await resolveSession(input);
  const text = await Bun.file(sessionFile).text();
  const entries = parseJsonl(text);

  if (detail >= 1) {
    // スナップショットのフルパス解決用
    const sessionId = path.basename(sessionFile, ".jsonl");
    const configDirs = getConfigDirs();
    const sessionDir = await findSessionDir(sessionId, configDirs);

    const ops = detail >= 2
      ? extractFileOpsFullDetail(entries)
      : extractFileOpsDetailed(entries);
    const lines: string[] = [];
    for (const op of ops) {
      if (op.snapshot && sessionDir) {
        op.snapshot = `${sessionDir}/${op.snapshot}`;
      }
      lines.push(JSON.stringify(op));
    }
    await writeJsonl(lines.join("\n"));
  } else {
    // detail=0: パス毎サマリ
    const result = extractFileOps(entries);
    const lines = result.map(entry => JSON.stringify(entry));
    await writeJsonl(lines.join("\n"));
  }
}

function printUsage(out: NodeJS.WritableStream) {
  const prog = progName("file-ops");
  out.write(`Usage: ${prog} [options] <session_id_or_file>

Options:
  -d, --detail [N]  Detail level (default: 0, repeatable: -d, -dd)
                      0: Per-path summary (JSONL)
                      1: Chronological operation list (JSONL)
                      2: Operations with tool input details (JSONL)
  --help            Show this help\n`);
}
