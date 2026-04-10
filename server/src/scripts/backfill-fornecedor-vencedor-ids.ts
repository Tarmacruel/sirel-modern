import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { runFornecedorVencedorBackfill } from "../lib/fornecedor-vencedor-saneamento.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../../../.env") });

async function main() {
  const { requireDb } = await import("../db/client.js");
  const db = requireDb();
  const result = await runFornecedorVencedorBackfill(db);

  if (!result.candidates) {
    console.log("Nenhum registro pendente para saneamento de fornecedor vencedor.");
    return;
  }

  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Falha no saneamento retroativo de fornecedor vencedor:", error);
  process.exit(1);
});
