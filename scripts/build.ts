import { $ } from "bun";
import { mkdirSync } from "node:fs";

const SHEBANG = "#!/usr/bin/env bun\n";
const OUTDIR = "skills/claude-session-analysis/bin";
const OUTFILE = `${OUTDIR}/claude-session-analysis`;
const ENTRYPOINT = "src/cli.ts";

// 出力ディレクトリ作成（recursive: true で冪等）
mkdirSync(OUTDIR, { recursive: true });

const jsFile = `${OUTFILE}.js`;

const result = await Bun.build({
  entrypoints: [ENTRYPOINT],
  outdir: OUTDIR,
  naming: "claude-session-analysis.js",
  target: "bun",
});

if (!result.success) {
  console.error("Build failed: claude-session-analysis");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// .js -> 拡張子なしにリネーム + shebang付与
let text = await Bun.file(jsFile).text();
// バンドラが残したshebangを除去してから付与
text = text.replace(/^#!.*\n/, "");
await Bun.write(OUTFILE, SHEBANG + text);
await $`rm -f ${jsFile}`;
await $`chmod +x ${OUTFILE}`;

console.log(`Built: ${OUTFILE}`);
