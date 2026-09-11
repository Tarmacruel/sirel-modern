import { createServer, request } from "node:http";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { arquivosConfig } from "../modules/arquivos/config.js";
import { officePreviewPath } from "../modules/arquivos/preview.js";
import { extractIndexedContent } from "../modules/arquivos/content.js";
import { withOfficeConversion } from "../modules/arquivos/office.js";
import { runOfficeProcess } from "../modules/arquivos/office-process.js";
import {
  hasLibreOfficeProcesses,
  isPidAlive,
  officeDirectoryBytes,
  officeMetrics,
  officeTempPattern,
} from "../modules/arquivos/office-temp.js";

// Explicit opt-in: normal CI does not require a system LibreOffice installation.
const enabled = process.env.OFFICE_INTEGRATION === "1";
const fixtures = fileURLToPath(new URL("./fixtures/office/", import.meta.url));
let root: string;
let baseline: string[];
const savedConfig = { ...arquivosConfig };
const ownedDirs = async () =>
  (await readdir(tmpdir())).filter((n) => officeTempPattern.test(n)).sort();
const pdf = async (directory: string) => {
  const name = (await readdir(directory)).find((n) => n.endsWith(".pdf"));
  expect(name).toBeTruthy();
  expect(
    (await readFile(join(directory, name!))).subarray(0, 5).toString(),
  ).toBe("%PDF-");
};

describe.skipIf(!enabled)("Office real Windows/LibreOffice integration", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "sirel-office-integration-"));
    baseline = await ownedDirs();
    arquivosConfig.previewCacheDir = join(root, "cache");
    arquivosConfig.officeConcurrency = 2;
  });
  afterEach(async () => {
    expect(await ownedDirs()).toEqual(baseline);
    expect(officeMetrics.officeActiveJobs).toBe(0);
    expect(await hasLibreOfficeProcesses()).toBe(false);
  });
  afterAll(async () => {
    Object.assign(arquivosConfig, savedConfig);
    await rm(root, { recursive: true, force: true });
  });
  it.each(["document.docx", "spreadsheet.xlsx", "presentation.pptx"])(
    "generates an actual PDF from %s",
    async (name) => {
      const path = join(fixtures, name);
      const output = await officePreviewPath(path, name);
      expect((await readFile(output)).subarray(0, 5).toString()).toBe("%PDF-");
    },
  );
  it("extracts actual DOCX text", async () => {
    expect(
      await extractIndexedContent(join(fixtures, "document.docx"), "office"),
    ).toContain("SIREL Office lifecycle fixture 2026");
  });
  it("cleans a corrupt document", async () => {
    const path = join(root, "corrupt.docx");
    await writeFile(path, Buffer.from([0, 1, 2, 3]));
    await expect(officePreviewPath(path, "corrupt.docx")).rejects.toThrow();
  });
  it.each([2, 10])(
    "isolates %i actual concurrent conversions",
    async (count) => {
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          withOfficeConversion(
            {
              inputPath: join(
                fixtures,
                index % 2 ? "spreadsheet.xlsx" : "document.docx",
              ),
              format: "pdf",
              timeoutMs: 90_000,
            },
            pdf,
          ),
        ),
      );
    },
    180_000,
  );
  it("finishes a shared preview after an HTTP client disconnects", async () => {
    let started!: () => void;
    const processing = new Promise<void>((r) => {
      started = r;
    });
    let finished!: () => void;
    const done = new Promise<void>((r) => {
      finished = r;
    });
    let failure: unknown;
    const server = createServer(async (_req, res) => {
      started();
      try {
        await officePreviewPath(
          join(fixtures, "document.docx"),
          "disconnected-client",
        );
        if (!res.destroyed) res.end("done");
      } catch (error) {
        failure = error;
      } finally {
        finished();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address() as { port: number };
    const client = request({ hostname: "127.0.0.1", port: address.port });
    client.on("error", () => undefined);
    client.end();
    try {
      await processing;
      client.destroy();
      await done;
      expect(failure).toBeUndefined();
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
  it.each(["timeout", "cancel", "orphan"])(
    "terminates only the owned process tree on %s",
    async (mode) => {
      const controller = new AbortController();
      const pidFile = join(root, `${mode}.json`);
      const running = runOfficeProcess({
        executable: process.execPath,
        args: [
          join(fixtures, "process-tree.cjs"),
          mode === "orphan" ? "orphan" : "wait",
          pidFile,
        ],
        tempDir: root,
        timeoutMs: mode === "cancel" ? 60_000 : 8_000,
        signal: controller.signal,
        job: mode,
      });
      const outcome = running.then(
        () => null,
        (error: unknown) => error,
      );
      for (let i = 0; i < 150 && !(await stat(pidFile).catch(() => null)); i++)
        await new Promise((r) => setTimeout(r, 100));
      const pids = JSON.parse(await readFile(pidFile, "utf8"));
      if (mode === "cancel") controller.abort();
      expect(await outcome).toMatchObject({
        code: mode === "cancel" ? "CANCELLED" : "TIMEOUT",
      });
      expect(isPidAlive(pids.parent)).toBe(false);
      expect(isPidAlive(pids.child)).toBe(false);
    },
    30_000,
  );
  it("reports a real child-process exit error", async () => {
    await expect(
      runOfficeProcess({
        executable: process.execPath,
        args: [join(fixtures, "process-tree.cjs"), "error"],
        tempDir: root,
        timeoutMs: 20_000,
        signal: new AbortController().signal,
        job: "error",
      }),
    ).rejects.toMatchObject({ code: "EXIT_7" });
  });
  it.skipIf(!process.env.OFFICE_STRESS_COUNT)(
    "stress: actual conversions with before/after disk accounting",
    async () => {
      const count = Math.max(50, Number(process.env.OFFICE_STRESS_COUNT) || 50);
      const measure = async () => {
        const directories = await ownedDirs();
        let officeBytes = 0;
        for (const name of directories)
          officeBytes += await officeDirectoryBytes(join(tmpdir(), name));
        // TEMP contains unrelated live apps: record inaccessible/changing entries explicitly.
        let tempBytes = 0,
          unreadable = 0;
        for (const entry of await readdir(tmpdir())) {
          try {
            tempBytes += await officeDirectoryBytes(join(tmpdir(), entry));
          } catch {
            unreadable++;
          }
        }
        return {
          officeDirectories: directories.length,
          officeBytes,
          tempBytes,
          unreadable,
        };
      };
      const before = await measure();
      const started = Date.now();
      for (let index = 0; index < count; index += 2) {
        await Promise.all(
          Array.from({ length: Math.min(2, count - index) }, (_, offset) => {
            const text = (index + offset) % 4 === 0;
            const name = text
              ? "document.docx"
              : ["document.docx", "spreadsheet.xlsx", "presentation.pptx"][
                  (index + offset) % 3
                ];
            return withOfficeConversion(
              {
                inputPath: join(fixtures, name),
                format: text ? "txt:Text" : "pdf",
                timeoutMs: 90_000,
              },
              text
                ? async (directory) => {
                    expect(
                      await readFile(join(directory, "document.txt"), "utf8"),
                    ).toContain("SIREL");
                  }
                : pdf,
            );
          }),
        );
        expect(await ownedDirs()).toEqual(baseline);
      }
      const after = await measure();
      const report = {
        count,
        durationMs: Date.now() - started,
        before,
        after,
        sofficeRemaining: await hasLibreOfficeProcesses(),
        metrics: { ...officeMetrics },
      };
      console.log("OFFICE_STRESS_RESULT", JSON.stringify(report));
      if (process.env.OFFICE_STRESS_REPORT)
        await writeFile(
          process.env.OFFICE_STRESS_REPORT,
          JSON.stringify(report, null, 2),
        );
      expect(after.officeBytes).toBe(before.officeBytes);
      expect(after.officeDirectories).toBe(before.officeDirectories);
      expect(report.sofficeRemaining).toBe(false);
    },
    900_000,
  );
});
