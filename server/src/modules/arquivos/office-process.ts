import { spawn } from "node:child_process";
import { officeMetrics } from "./office-temp.js";
import {
  quoteWindowsArgument,
  windowsOfficeSupervisor,
} from "./office-windows.js";

export class OfficeError extends Error {
  constructor(readonly code: string) {
    super(`Processamento Office falhou (${code}).`);
  }
}

// Resolves only after the supervisor confirms the whole Windows job is empty.
export async function runOfficeProcess(options: {
  executable: string;
  args: string[];
  tempDir: string;
  timeoutMs: number;
  signal: AbortSignal;
  job: string;
}) {
  if (options.signal.aborted) throw new OfficeError("CANCELLED");
  const windows = process.platform === "win32";
  const child = spawn(
    windows ? "powershell.exe" : options.executable,
    windows
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(windowsOfficeSupervisor, "utf16le").toString("base64"),
        ]
      : options.args,
    {
      windowsHide: true,
      shell: false,
      detached: !windows,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        TEMP: options.tempDir,
        TMP: options.tempDir,
        TMPDIR: options.tempDir,
        SIREL_OFFICE_EXE: options.executable,
        SIREL_OFFICE_COMMAND: [options.executable, ...options.args]
          .map(quoteWindowsArgument)
          .join(" "),
        SIREL_OFFICE_OWNER: String(process.pid),
      },
    },
  );
  console.info("[OFFICE] Processo iniciado", {
    job: options.job,
    supervisorPid: child.pid,
  });
  let reason: string | undefined;
  let forced = false;
  let fallback: NodeJS.Timeout | undefined;
  let output = "";
  child.stdout.on("data", (chunk) => {
    if (output.length >= 4096) return;
    output += String(chunk).slice(0, 4096 - output.length);
    const match = /"pid":(\d+)/.exec(output);
    if (match) {
      console.info("[OFFICE] PID LibreOffice", {
        job: options.job,
        pid: Number(match[1]),
      });
      output = "";
    }
  });
  // Drain pipes; never retain or log document paths/content emitted by LibreOffice.
  child.stderr.resume();
  child.stdin.on("error", () => undefined); // EPIPE when completion races cancellation.
  const terminate = (code: string) => {
    if (reason) return;
    reason = code;
    if (code === "TIMEOUT") officeMetrics.officeConversionTimeouts++;
    console.warn("[OFFICE] Encerrando conversão", {
      job: options.job,
      reason: code,
    });
    if (windows) child.stdin.end("cancel\n");
    else if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* Already exited. */
      }
    }
    fallback = setTimeout(() => {
      // KILL_ON_JOB_CLOSE still owns descendants if the supervisor itself hangs.
      // Keep directories for recovery if tree termination cannot be confirmed.
      forced = true;
      child.kill("SIGKILL");
    }, 10_000);
  };
  const abort = () => terminate("CANCELLED");
  options.signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => terminate("TIMEOUT"), options.timeoutMs);
  if (options.signal.aborted) abort();
  try {
    await new Promise<void>((resolvePromise, reject) => {
      let spawnError = false;
      child.on("error", () => {
        spawnError = true;
      });
      child.once("close", (code) => {
        if (forced) reject(new OfficeError("TERMINATION_UNCONFIRMED"));
        else if (reason) reject(new OfficeError(reason));
        else if (spawnError || code !== 0)
          reject(new OfficeError(spawnError ? "SPAWN" : `EXIT_${code}`));
        else resolvePromise();
      });
    });
  } finally {
    clearTimeout(timeout);
    clearTimeout(fallback);
    options.signal.removeEventListener("abort", abort);
    child.stdin.destroy();
  }
}
