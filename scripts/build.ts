import { $ } from "bun";

const SHEBANG = "#!/usr/bin/env bun\n";
const OUTDIR = "skills/claude-session-analysis/scripts";
const OUTFILE = `${OUTDIR}/timeline`;

const result = await Bun.build({
  entrypoints: ["src/timeline/index.ts"],
  outdir: OUTDIR,
  naming: "timeline.js",
  target: "bun",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// .js -> 拡張子なしにリネーム + shebang付与
const jsFile = `${OUTFILE}.js`;
let text = await Bun.file(jsFile).text();
// バンドラが残したshebangを除去してから付与
text = text.replace(/^#!.*\n/, "");
await Bun.write(OUTFILE, SHEBANG + text);
await $`rm ${jsFile} && chmod +x ${OUTFILE}`;

console.log(`Built: ${OUTFILE}`);
