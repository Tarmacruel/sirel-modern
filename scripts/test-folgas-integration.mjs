import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import dotenv from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
let local = {};
try {
  local = dotenv.parse(readFileSync(resolve(root, ".env")));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const env = { ...local, ...process.env };
if (!env.TEST_DATABASE_URL || !env.DATABASE_URL) {
  throw new Error(
    "Defina DATABASE_URL operacional e TEST_DATABASE_URL de um banco separado, com as migrations aplicadas. URLs não serão exibidas.",
  );
}
// The existing db/client guard also compares host, port and database before connecting.
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/vitest/vitest.mjs"),
    "run",
    "src/modules/folgas/integration.test.ts",
  ],
  {
    cwd: resolve(root, "server"),
    stdio: "inherit",
    env: { ...env, NODE_ENV: "test", RUN_DB_INTEGRATION_TESTS: "true" },
  },
);
process.exitCode = result.status ?? 1;
