import { runOfficeProcess } from "../../../modules/arquivos/office-process.js";
import { fileURLToPath } from "node:url";
const [tempDir, pidFile] = process.argv.slice(2);
await runOfficeProcess({
  executable: process.execPath,
  args: [
    fileURLToPath(new URL("./process-tree.cjs", import.meta.url)),
    "wait",
    pidFile,
  ],
  tempDir,
  timeoutMs: 60_000,
  signal: new AbortController().signal,
  job: "owner-death",
});
