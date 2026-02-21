import { $ } from "bun";

const SHEBANG = "#!/usr/bin/env bun\n";
const OUTDIR = "skills/claude-session-analysis/scripts";

const entries = [
  { src: "src/timeline/index.ts", out: "timeline" },
  { src: "src/summaries/index.ts", out: "summaries" },
  { src: "src/file-ops/index.ts", out: "file-ops" },
  { src: "src/get-by-marker/index.ts", out: "get-by-marker" },
  { src: "src/file-diff/index.ts", out: "file-diff" },
  { src: "src/sessions/index.ts", out: "sessions" },
];

const results: { name: string; status: "built" | "skipped" | "failed" }[] = [];

for (const entry of entries) {
  if (!(await Bun.file(entry.src).exists())) {
    results.push({ name: entry.out, status: "skipped" });
    continue;
  }

  const outfile = `${OUTDIR}/${entry.out}`;
  const jsFile = `${outfile}.js`;

  const result = await Bun.build({
    entrypoints: [entry.src],
    outdir: OUTDIR,
    naming: `${entry.out}.js`,
    target: "bun",
  });

  if (!result.success) {
    console.error(`Build failed: ${entry.out}`);
    for (const log of result.logs) {
      console.error(log);
    }
    results.push({ name: entry.out, status: "failed" });
    continue;
  }

  // .js -> 拡張子なしにリネーム + shebang付与
  let text = await Bun.file(jsFile).text();
  // バンドラが残したshebangを除去してから付与
  text = text.replace(/^#!.*\n/, "");
  await Bun.write(outfile, SHEBANG + text);
  await $`rm ${jsFile} && chmod +x ${outfile}`;

  results.push({ name: entry.out, status: "built" });
}

// サマリ表示
const built = results.filter((r) => r.status === "built");
const skipped = results.filter((r) => r.status === "skipped");
const failed = results.filter((r) => r.status === "failed");

console.log("\n--- Build Summary ---");
for (const r of built) console.log(`  Built:   ${OUTDIR}/${r.name}`);
for (const r of skipped) console.log(`  Skipped: ${r.name} (src not found)`);
for (const r of failed) console.log(`  FAILED:  ${r.name}`);
console.log(`Total: ${built.length} built, ${skipped.length} skipped, ${failed.length} failed`);

if (failed.length > 0) process.exit(1);
