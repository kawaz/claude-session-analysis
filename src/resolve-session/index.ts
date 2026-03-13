import { resolveSession, resolveSessionAll } from "../resolve-session.ts";
import * as path from "node:path";

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function printUsage(exitCode: number = 0): never {
  const prog = process.env._PROG || "resolve";
  const out = exitCode !== 0 ? process.stderr : process.stdout;
  out.write(`Usage: ${prog} [--path] [--all] <session_id_or_prefix>...

Options:
  --all   Show all matches per prefix (default: first match only)
  --path  Force file path output
  --help  Show this help

Examples:
  ${prog} a2119bae                          # → a2119bae-022b-...-749a7
  ${prog} a2119bae-022b-4830-8b07-88c3...   # → ~/.claude/.../a2119bae-....jsonl
  ${prog} --path a2119bae                   # → ~/.claude/.../a2119bae-....jsonl
  ${prog} --all 4                           # → all sessions starting with 4
  ${prog} a2119bae b3220cdf                 # resolve multiple sessions\n`);
  process.exit(exitCode);
}

export async function run(args: string[]) {
  let showPath = false;
  let showAll = false;
  const inputs: string[] = [];

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--help":
        printUsage(0);
        break; // unreachable
      case "--path":
        showPath = true;
        break;
      case "--all":
        showAll = true;
        break;
      default:
        if (args[i].startsWith("-")) {
          process.stderr.write(`Unknown option: ${args[i]}\n`);
          printUsage(1);
        }
        inputs.push(args[i]);
        break;
    }
    i++;
  }

  if (inputs.length === 0) {
    printUsage(1);
  }

  const resolve = showAll ? resolveSessionAll : async (s: string) => [await resolveSession(s)];

  let hasError = false;
  for (const input of inputs) {
    const effectiveShowPath = showPath || UUID_RE.test(input);
    try {
      const resolved = await resolve(input);
      for (const r of resolved) {
        if (effectiveShowPath) {
          process.stdout.write(r + "\n");
        } else {
          process.stdout.write(path.basename(r, ".jsonl") + "\n");
        }
      }
    } catch (e) {
      hasError = true;
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`${msg}\n`);
    }
  }

  if (hasError) {
    process.exit(1);
  }
}
