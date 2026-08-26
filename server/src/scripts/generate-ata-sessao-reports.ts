import { ataSessaoProcessInputSchema } from "@sirel/shared/schemas/ata-sessao";

import { generateAtaSessaoReports } from "../lib/ata-sessao-reports.js";

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const sourcePath = parseArg("--input");
  const sdSourcePath = parseArg("--sd-input");
  const documentoIdArg = parseArg("--documento-id");
  const processoIdArg = parseArg("--processo-id");
  const outputDir = parseArg("--output-dir");
  const generatedByName = parseArg("--generated-by");
  const edital = parseArg("--edital");
  const processoAdministrativo = parseArg("--processo-administrativo");
  const arquivoOrigem = parseArg("--arquivo-origem");
  const dataGeracao = parseArg("--data-geracao");

  const input = ataSessaoProcessInputSchema.parse({
    sourcePath,
    sdSourcePath,
    documentoId: documentoIdArg ? Number(documentoIdArg) : undefined,
    processoId: processoIdArg ? Number(processoIdArg) : undefined,
    outputDir,
    generatedByName,
    edital,
    processoAdministrativo,
    arquivoOrigem,
    dataGeracao,
  });

  const result = await generateAtaSessaoReports(input);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
