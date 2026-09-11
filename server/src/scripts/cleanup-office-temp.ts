import { collectOfficeOrphans } from "../modules/arquivos/office-temp.js";

// Preview by default. --apply is an explicit administrative deletion request.
const apply = process.argv.includes("--apply");
console.info(
  "[OFFICE] Inspeção conservadora dos resíduos; somente profile/text com mais de 2h.",
);
const preview = await collectOfficeOrphans({ dryRun: true });
console.info("[OFFICE] Resíduos elegíveis", preview);
if (apply) {
  console.info(
    "[OFFICE] --apply informado: revalidando processos, idade e proprietários antes de remover.",
  );
  const result = await collectOfficeOrphans();
  if (result.failures) process.exitCode = 1;
} else {
  console.info(
    "[OFFICE] Simulação concluída. Para remover os elegíveis: npm run office:cleanup --workspace server -- --apply",
  );
  if (preview.failures) process.exitCode = 1;
}
