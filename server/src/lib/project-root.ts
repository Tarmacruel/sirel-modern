import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function isProjectRoot(candidate: string) {
  return (
    existsSync(join(candidate, "package.json")) &&
    existsSync(join(candidate, "scripts", "process_ata_sessao_reports.py")) &&
    existsSync(join(candidate, "scripts", "process_sd_reports.py"))
  );
}

export function resolveProjectRoot(
  startDir: string,
  workingDirectory = process.cwd(),
) {
  const candidates = [resolve(workingDirectory)];
  let current = resolve(startDir);

  while (true) {
    candidates.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return (
    Array.from(new Set(candidates)).find(isProjectRoot) ??
    resolve(workingDirectory)
  );
}

export const projectRoot = resolveProjectRoot(
  dirname(fileURLToPath(import.meta.url)),
);
