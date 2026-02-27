import { resolveSession } from "../resolve-session.ts";
import * as path from "node:path";

function printUsage(exitCode: number = 0): never {
  const prog = process.env._PROG || "resolve-session";
  const out = exitCode !== 0 ? console.error : console.log;
  out(`Usage: ${prog} [--path] <session_id_prefix>

Options:
  --path  Output full file path instead of session ID
  --help  Show this help`);
  process.exit(exitCode);
}

export async function run(args: string[]) {
  let showPath = false;
  let prefix = "";

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--help":
        printUsage(0);
        break; // unreachable
      case "--path":
        showPath = true;
        break;
      default:
        if (args[i].startsWith("-")) {
          console.error(`Unknown option: ${args[i]}`);
          printUsage(1);
        }
        prefix = args[i];
        break;
    }
    i++;
  }

  if (!prefix) {
    printUsage(1);
  }

  const resolved = await resolveSession(prefix);

  if (showPath) {
    await Bun.write(Bun.stdout, resolved + "\n");
  } else {
    const sessionId = path.basename(resolved, ".jsonl");
    await Bun.write(Bun.stdout, sessionId + "\n");
  }
}
