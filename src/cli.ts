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
import { run as summariesRun } from "./summaries/index.ts";
import { run as fileOpsRun } from "./file-ops/index.ts";
import { run as getByMarkerRun } from "./get-by-marker/index.ts";
import { run as fileDiffRun } from "./file-diff/index.ts";
import { run as sessionsRun } from "./sessions/index.ts";
import { run as resolveSessionRun } from "./resolve-session/index.ts";

const PROG = "claude-session-analysis";

const SUBCOMMANDS: Record<string, { desc: string; run: (args: string[]) => Promise<void> }> = {
  timeline:        { desc: "Display session events with filtering and formatting options", run: timelineRun },
  summaries:       { desc: "Extract summary information from a session", run: summariesRun },
  "file-ops":      { desc: "Extract file operations from a session", run: fileOpsRun },
  "get-by-marker": { desc: "Retrieve session entries by marker with optional context", run: getByMarkerRun },
  "file-diff":     { desc: "Compare backup file versions or backup vs current file", run: fileDiffRun },
  sessions:          { desc: "List available Claude sessions with filtering and search", run: sessionsRun },
  "resolve-session": { desc: "Resolve session ID prefix to full ID or file path", run: resolveSessionRun },
};

function printUsage(exitCode: number = 0): never {
  const names = Object.keys(SUBCOMMANDS);
  const maxLen = Math.max(...names.map((n) => n.length));
  const lines = Object.entries(SUBCOMMANDS).map(([name, { desc }]) =>
    `  ${name.padEnd(maxLen)}  ${desc}`,
  );
  const out = exitCode !== 0 ? console.error : console.log;
  out(`Usage: ${PROG} <command> [options]

Commands:
${lines.join("\n")}

Run '${PROG} <command> --help' for more information on a command.`);
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
