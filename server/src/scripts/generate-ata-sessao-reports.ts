import { existsSync } from "node:fs";

import { ataSessaoProcessInputSchema } from "@sirel/shared/schemas/ata-sessao";

import { generateAtaSessaoReports } from "../lib/ata-sessao-reports.js";

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const sourcePath = parseArg("--input");
  const documentoIdArg = parseArg("--documento-id");
  const outputDir = parseArg("--output-dir");

  const input = ataSessaoProcessInputSchema.parse({
    sourcePath,
    documentoId: documentoIdArg ? Number(documentoIdArg) : undefined,
    outputDir,
  });

  const result = await generateAtaSessaoReports(input);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
