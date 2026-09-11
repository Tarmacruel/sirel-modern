import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setImmediate as yieldToLoop } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const officeTempPattern = /^sirel-office-(profile|text)-[a-zA-Z0-9]{6}$/;
export const officeOwnerFile = ".sirel-office-owner.json";
export const officeOrphanAgeMs = 2 * 60 * 60 * 1000;
export const officeMetrics = {
  officeActiveJobs: 0,
  officeQueuedJobs: 0,
  officeConversionsTotal: 0,
  officeConversionsFailed: 0,
  officeConversionTimeouts: 0,
  officeCleanupFailures: 0,
  officeTempBytesRemoved: 0,
};

function errorCode(error: unknown) {
  return String((error as NodeJS.ErrnoException)?.code ?? "UNKNOWN");
}

export function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

// Fail closed: no process inventory means no automatic orphan deletion.
export async function hasLibreOfficeProcesses() {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "@(Get-CimInstance Win32_Process -ErrorAction Stop -Filter \"Name = 'soffice.exe' OR Name = 'soffice.bin' OR Name = 'soffice.com'\").Count",
      ],
      { windowsHide: true, timeout: 15_000, maxBuffer: 4096 },
    );
    const rawCount = stdout.trim();
    if (!/^\d+$/.test(rawCount))
      throw new Error("Office process inventory unavailable");
    return Number(rawCount) > 0;
  }
  const { stdout } = await execFileAsync("ps", ["-A", "-o", "comm="], {
    timeout: 5000,
  });
  return stdout
    .split(/\r?\n/)
    .some((name) =>
      /^(soffice(?:\.bin)?|libreoffice)$/.test(basename(name.trim())),
    );
}

// Walk only real directories, never junction/symlink targets. Yield between directories.
export async function officeDirectoryBytes(directory: string): Promise<number> {
  const info = await lstat(directory);
  if (info.isSymbolicLink()) return 0;
  if (!info.isDirectory()) return info.size;
  let bytes = 0;
  for (const entry of await readdir(directory))
    bytes += await officeDirectoryBytes(join(directory, entry));
  await yieldToLoop();
  return bytes;
}

export async function validateOfficeTemp(directory: string, root = tmpdir()) {
  const absolute = resolve(directory);
  if (
    dirname(absolute) !== resolve(root) ||
    !officeTempPattern.test(basename(absolute))
  ) {
    throw new Error("OFFICE_TEMP_OUTSIDE_ROOT");
  }
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("OFFICE_TEMP_NOT_DIRECTORY");
  if (dirname(await realpath(absolute)) !== (await realpath(root)))
    throw new Error("OFFICE_TEMP_OUTSIDE_ROOT");
  return info;
}

export async function removeOfficeTemp(directory: string, root = tmpdir()) {
  try {
    await validateOfficeTemp(directory, root);
    // A failed size calculation must not prevent the actual cleanup.
    const bytes = await officeDirectoryBytes(directory).catch(() => 0);
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    });
    officeMetrics.officeTempBytesRemoved += bytes;
    return { removed: true, bytes };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { removed: true, bytes: 0 };
    officeMetrics.officeCleanupFailures++;
    console.warn("[OFFICE] Cleanup falhou", {
      temp: basename(directory),
      code: errorCode(error),
    });
    return { removed: false, bytes: 0 };
  }
}

type SweepOptions = {
  root?: string;
  now?: number;
  dryRun?: boolean;
  // Injection also lets the offline regression suite verify active-process safety.
  hasProcesses?: () => Promise<boolean>;
};

export async function collectOfficeOrphans(options: SweepOptions = {}) {
  const root = options.root ?? tmpdir();
  const cutoff = (options.now ?? Date.now()) - officeOrphanAgeMs;
  const result = {
    found: 0,
    eligible: 0,
    removed: 0,
    bytes: 0,
    failures: 0,
    skipped: 0,
  };
  try {
    const entries = (await readdir(root, { withFileTypes: true })).filter(
      (e) =>
        e.isDirectory() &&
        !e.isSymbolicLink() &&
        officeTempPattern.test(e.name),
    );
    result.found = entries.length;
    if (!entries.length) return result;
    const hasProcesses = options.hasProcesses ?? hasLibreOfficeProcesses;
    // Old versions have no ownership marker. Any live LO makes deletion unsafe.
    if (await hasProcesses()) {
      result.skipped = entries.length;
      return result;
    }
    for (const entry of entries) {
      const directory = join(root, entry.name);
      try {
        const info = await validateOfficeTemp(directory, root);
        if (Math.max(info.mtimeMs, info.birthtimeMs) > cutoff) {
          result.skipped++;
          continue;
        }
        try {
          const marker = JSON.parse(
            await readFile(join(directory, officeOwnerFile), "utf8"),
          );
          if (
            marker.version !== 1 ||
            !Number.isInteger(marker.pid) ||
            marker.pid <= 0 ||
            (marker.released !== true && isPidAlive(marker.pid))
          ) {
            result.skipped++;
            continue;
          }
        } catch (error) {
          if (errorCode(error) !== "ENOENT") {
            result.skipped++;
            continue;
          }
        }
        result.eligible++;
        if (options.dryRun) {
          const bytes = await officeDirectoryBytes(directory);
          result.bytes += bytes;
          console.info("[OFFICE] Diretório elegível", { temp: entry.name, bytes });
        } else {
          const removed = await removeOfficeTemp(directory, root);
          if (removed.removed) {
            result.removed++;
            result.bytes += removed.bytes;
          } else result.failures++;
        }
      } catch (error) {
        if (errorCode(error) !== "ENOENT") result.failures++;
      }
      await yieldToLoop();
    }
    return result;
  } catch (error) {
    result.failures++;
    console.warn("[OFFICE] Coleta de órfãos adiada", {
      code: errorCode(error),
    });
    return result;
  } finally {
    console.info("[OFFICE] Coleta de temporários", {
      ...result,
      dryRun: !!options.dryRun,
    });
  }
}

let collector: NodeJS.Timeout | undefined;
let collecting = false;
export function startOfficeCollector() {
  if (collector) return;
  const sweep = async () => {
    if (collecting) return;
    collecting = true;
    try {
      await collectOfficeOrphans();
    } finally {
      collecting = false;
    }
  };
  void sweep();
  collector = setInterval(() => void sweep(), 60 * 60 * 1000);
  collector.unref();
}
export function stopOfficeCollector() {
  clearInterval(collector);
  collector = undefined;
}
