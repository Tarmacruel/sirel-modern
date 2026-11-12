import "../bootstrap/load-env.js";

import { modalidadeCatalog } from "@sirel/shared/const";
import { closeDb, requireDb } from "../db/client.js";
import { modalidades, secretarias, users } from "../db/schema.js";
import { hashPassword } from "../lib/auth-password.js";

async function main() {
  if (process.env.SIREL_HOMOLOGACAO !== "true") {
    throw new Error("Execute este seed somente no ambiente de homologação.");
  }
  const password = process.env.SIREL_TESTE_ADMIN_PASSWORD ?? "";
  if (password.length < 16) {
    throw new Error("Informe SIREL_TESTE_ADMIN_PASSWORD com pelo menos 16 caracteres.");
  }

  await requireDb().transaction(async (tx) => {
    await tx.insert(secretarias)
      .values({ sigla: "TESTE", nome: "Secretaria de Teste" })
      .onConflictDoNothing({ target: secretarias.sigla });
    await tx.insert(modalidades)
      .values(modalidadeCatalog.map(({ codigo, nome }) => ({ codigo, nome })))
      .onConflictDoNothing({ target: modalidades.codigo });
    await tx.insert(users).values({
      username: "admin.teste",
      name: "Administrador de Teste",
      loginMethod: "password",
      role: "admin",
      passwordHash: hashPassword(password),
    }).onConflictDoNothing({ target: users.username });
  });
  console.log("Cadastros de teste disponíveis. Usuário inicial: admin.teste.");
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
