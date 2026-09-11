import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOfficeProcess } from "../modules/arquivos/office-process.js";
import {
  isPidAlive,
  removeOfficeTemp,
} from "../modules/arquivos/office-temp.js";

const fixtures = fileURLToPath(new URL("./fixtures/office/", import.meta.url));
describe.skipIf(
  process.env.OFFICE_INTEGRATION !== "1" || process.platform !== "win32",
)("Windows native process ownership", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "sirel-office-native-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it("kills the whole tree after abrupt backend termination", async () => {
    const pidFile = join(root, "pids.json");
    const owner = spawn(
      process.execPath,
      ["--import", "tsx", join(fixtures, "owner-process.mts"), root, pidFile],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    owner.stdout.resume();
    owner.stderr.resume();
    const closed = new Promise<void>((r) => owner.once("close", () => r()));
    try {
      for (let i = 0; i < 150 && !(await stat(pidFile).catch(() => null)); i++)
        await new Promise((r) => setTimeout(r, 100));
      const pids = JSON.parse(await readFile(pidFile, "utf8"));
      expect(isPidAlive(pids.child)).toBe(true);
      owner.kill("SIGKILL");
      await closed;
      for (let i = 0; i < 100 && isPidAlive(pids.child); i++)
        await new Promise((r) => setTimeout(r, 100));
      expect(isPidAlive(pids.parent)).toBe(false);
      expect(isPidAlive(pids.child)).toBe(false);
    } finally {
      owner.kill("SIGKILL");
      await closed;
    }
  }, 30_000);
  it("quotes spaces, Unicode, quotes and trailing backslashes literally", async () => {
    const output = join(root, "arguments.json");
    const args = [
      "documento com espaços.docx",
      "cotação 2026",
      'a"b',
      "C:\\ending\\",
      'a\\"b',
      "$(never-execute)",
    ];
    await runOfficeProcess({
      executable: process.execPath,
      args: [join(fixtures, "process-tree.cjs"), "args", output, ...args],
      tempDir: root,
      timeoutMs: 20_000,
      signal: new AbortController().signal,
      job: "quoted-args",
    });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(args);
  });
  it("retries a real Windows sharing violation and removes only its directory", async () => {
    const directory = await mkdtemp(join(root, "sirel-office-text-"));
    const lockedFile = join(directory, "locked.txt");
    await writeFile(lockedFile, "12345");
    const locker = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$f=[IO.File]::Open($env:SIREL_LOCK_FILE,'Open','Read','None'); [Console]::WriteLine('ready'); Start-Sleep -Milliseconds 500; $f.Dispose()",
      ],
      {
        windowsHide: true,
        env: { ...process.env, SIREL_LOCK_FILE: lockedFile },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    locker.stderr.resume();
    const closed = new Promise<void>((r) => locker.once("close", () => r()));
    try {
      await new Promise<void>((r) => locker.stdout.once("data", () => r()));
      const result = await removeOfficeTemp(directory, root);
      expect(result.removed).toBe(true);
      expect(await stat(directory).catch(() => null)).toBeNull();
    } finally {
      locker.kill();
      await closed;
    }
  });
});
