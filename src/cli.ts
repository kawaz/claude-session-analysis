#!/usr/bin/env bun

// EPIPE を無視してパイプ先の早期終了時に静かに exit する（Unix 慣例）
process.on("SIGPIPE", () => process.exit(0));
process.stdout?.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});
process.stderr?.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

import { run as timelineRun } from "./timeline/index.ts";
import { run as fileOpsRun } from "./file-ops/index.ts";
import { run as sessionsRun } from "./sessions/index.ts";
import { run as resolveRun } from "./resolve-session/index.ts";
import ZSH_COMPLETION from "../completions/_claude-session-analysis" with { type: "text" };

const PROG = "claude-session-analysis";

async function completionRun(args: string[]) {
  const shell = args[0];
  if (!shell || shell === "--help") {
    const out = shell === "--help" ? process.stdout : process.stderr;
    out.write(`Usage: ${PROG} completion <shell>

Shells:
  zsh    Output zsh completion script

Example:
  ${PROG} completion zsh > ~/.zsh/completions/_${PROG}\n`);
    process.exit(shell === "--help" ? 0 : 1);
  }
  if (shell !== "zsh") {
    console.error(`Error: unsupported shell: ${shell}`);
    process.exit(1);
  }
  process.stdout.write(ZSH_COMPLETION);
}

const SUBCOMMANDS: Record<string, { desc: string; run: (args: string[]) => Promise<void> }> = {
  sessions:          { desc: "List available Claude sessions with filtering and search", run: sessionsRun },
  timeline:          { desc: "Display session events with filtering and formatting options", run: timelineRun },
  "file-ops":        { desc: "Extract file operations from a session", run: fileOpsRun },
  resolve:           { desc: "Resolve session ID prefix to full ID or file path", run: resolveRun },
  completion:        { desc: "Output shell completion script", run: completionRun },
};

function printUsage(exitCode: number = 0): never {
  const names = Object.keys(SUBCOMMANDS);
  const maxLen = Math.max(...names.map((n) => n.length));
  const lines = Object.entries(SUBCOMMANDS).map(([name, { desc }]) =>
    `  ${name.padEnd(maxLen)}  ${desc}`,
  );
  const out = exitCode !== 0 ? process.stderr : process.stdout;
  out.write(`Usage: ${PROG} <command> [options]

Commands:
${lines.join("\n")}

Run '${PROG} <command> --help' for more information on a command.\n`);
  process.exit(exitCode);
}

const subcmd = process.argv[2];

if (!subcmd) {
  printUsage(1);
}
if (subcmd === "--help") {
  printUsage();
}

const entry = SUBCOMMANDS[subcmd];

if (!entry) {
  console.error(`Unknown command: ${subcmd}\n`);
  printUsage(1);
}

// サブコマンド用に環境変数を設定（help表示で使用）
process.env._PROG = `${PROG} ${subcmd}`;

try {
  await entry.run(process.argv.slice(3));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
