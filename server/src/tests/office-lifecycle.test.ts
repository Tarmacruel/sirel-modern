import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const isolatedTemp = vi.hoisted(() => ({ path: "" }));
vi.mock("node:os", async (original) => {
  const module = await original<typeof import("node:os")>();
  return { ...module, tmpdir: () => isolatedTemp.path || module.tmpdir() };
});
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
}));
vi.mock("../modules/arquivos/office-process.js", async (original) => {
  const module =
    await original<typeof import("../modules/arquivos/office-process.js")>();
  return { ...module, runOfficeProcess: vi.fn() };
});
import { arquivosConfig } from "../modules/arquivos/config.js";
import {
  OfficeError,
  runOfficeProcess,
} from "../modules/arquivos/office-process.js";
import {
  stopOfficeJobs,
  withOfficeConversion,
} from "../modules/arquivos/office.js";
import {
  collectOfficeOrphans,
  officeMetrics,
  officeOwnerFile,
  officeTempPattern,
  removeOfficeTemp,
} from "../modules/arquivos/office-temp.js";
import { officePreviewPath } from "../modules/arquivos/preview.js";
import { extractIndexedContent } from "../modules/arquivos/content.js";

let root: string;
let baseline: string[];
const originalConfig = { ...arquivosConfig };
const created: string[] = [];
const runner = vi.mocked(runOfficeProcess);
const ownedDirs = async () =>
  (await readdir(tmpdir())).filter((n) => officeTempPattern.test(n)).sort();

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sirel-office-test-"));
  isolatedTemp.path = join(root, "jobs");
  await mkdir(isolatedTemp.path);
  baseline = await ownedDirs();
  arquivosConfig.libreOfficePath = process.execPath;
  arquivosConfig.previewCacheDir = join(root, "cache");
  arquivosConfig.officeConcurrency = 2;
});
beforeEach(() => {
  runner.mockReset();
  runner.mockImplementation(async ({ args }) => {
    const out = args[args.indexOf("--outdir") + 1];
    created.push(out);
    const ext =
      args[args.indexOf("--convert-to") + 1] === "pdf" ? "pdf" : "txt";
    const name = basename(args.at(-1)!).replace(/\.[^.]+$/, `.${ext}`);
    await writeFile(
      join(out, name),
      ext === "pdf" ? "%PDF-1.7 fixture" : "Texto SIREL",
    );
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  expect(await ownedDirs()).toEqual(baseline);
  expect(officeMetrics.officeActiveJobs).toBe(0);
  expect(officeMetrics.officeQueuedJobs).toBe(0);
});
afterAll(async () => {
  isolatedTemp.path = "";
  Object.assign(arquivosConfig, originalConfig);
  await rm(root, { recursive: true, force: true });
});

describe("Office lifecycle, adapters and isolation", () => {
  it.each(["docx", "xlsx", "pptx"])(
    "publishes complete %s preview and cleans both directories",
    async (extension) => {
      const input = join(root, `preview.${extension}`);
      await writeFile(input, "fixture");
      const output = await officePreviewPath(input, input);
      expect((await readFile(output, "utf8")).startsWith("%PDF-")).toBe(true);
      expect(await officePreviewPath(input, input)).toBe(output);
      expect(runner).toHaveBeenCalledTimes(1);
    },
  );
  it("awaits text consumption before cleanup", async () => {
    const input = join(root, "text.docx");
    await writeFile(input, "fixture");
    expect(await extractIndexedContent(input, "office")).toBe("Texto SIREL");
  });
  it("cleans when consumer throws", async () => {
    await expect(
      withOfficeConversion(
        { inputPath: "file.docx", format: "pdf", timeoutMs: 100 },
        async () => {
          throw new Error("read failed");
        },
      ),
    ).rejects.toThrow("read failed");
  });
  it.each(["EXIT_1", "SPAWN", "TIMEOUT", "CANCELLED"])(
    "cleans after %s",
    async (code) => {
      runner.mockRejectedValue(new OfficeError(code));
      await expect(
        withOfficeConversion(
          { inputPath: "file.docx", format: "pdf", timeoutMs: 100 },
          async () => 1,
        ),
      ).rejects.toMatchObject({ code });
    },
  );
  it("treats corrupt/no-output preview as error and removes incomplete cache", async () => {
    runner.mockResolvedValue();
    const input = join(root, "corrupt.docx");
    await writeFile(input, "bad");
    await expect(officePreviewPath(input, input)).rejects.toThrow(
      "PDF esperado",
    );
  });
  it("cleans the first allocation if the second mkdtemp fails", async () => {
    const original = fs.mkdtemp;
    vi.spyOn(fs, "mkdtemp")
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error("disk full"));
    await expect(
      withOfficeConversion(
        { inputPath: "file.docx", format: "pdf", timeoutMs: 100 },
        async () => 1,
      ),
    ).rejects.toThrow("disk full");
    expect(runner).not.toHaveBeenCalled();
  });
  it.each([2, 5, 10, 100])(
    "isolates %i concurrent requests with bounded execution",
    async (count) => {
      let simultaneous = 0,
        maximum = 0;
      const paths = new Set<string>();
      runner.mockImplementation(async ({ args }) => {
        maximum = Math.max(maximum, ++simultaneous);
        const out = args[args.indexOf("--outdir") + 1];
        paths.add(out);
        await new Promise((r) => setTimeout(r, 5));
        expect((await stat(out)).isDirectory()).toBe(true);
        simultaneous--;
      });
      await Promise.all(
        Array.from({ length: count }, () =>
          withOfficeConversion(
            { inputPath: "file.docx", format: "pdf", timeoutMs: 100 },
            async () => 1,
          ),
        ),
      );
      expect(maximum).toBe(2);
      expect(paths.size).toBe(count);
    },
  );
  it("does not allocate temporaries for an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withOfficeConversion(
        {
          inputPath: "file.docx",
          format: "pdf",
          timeoutMs: 100,
          signal: controller.signal,
        },
        async () => 1,
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(runner).not.toHaveBeenCalled();
  });
  it("propagates cancellation to a running job", async () => {
    const controller = new AbortController();
    runner.mockImplementation(async ({ signal }) => {
      controller.abort();
      expect(signal.aborted).toBe(true);
      throw new OfficeError("CANCELLED");
    });
    await expect(
      withOfficeConversion(
        {
          inputPath: "file.docx",
          format: "pdf",
          timeoutMs: 100,
          signal: controller.signal,
        },
        async () => 1,
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
  it("logs and leaves a recoverable marker on cleanup failure", async () => {
    let dir = "";
    const realRm = fs.rm;
    vi.spyOn(fs, "rm").mockImplementation(async (path, options) => {
      if (String(path) === dir)
        throw Object.assign(new Error("locked"), { code: "EBUSY" });
      return realRm(path, options);
    });
    await withOfficeConversion(
      { inputPath: "file.docx", format: "pdf", timeoutMs: 100 },
      async (out) => {
        dir = out;
      },
    );
    expect(
      JSON.parse(await readFile(join(dir, officeOwnerFile), "utf8")).released,
    ).toBe(true);
    vi.restoreAllMocks();
    expect((await removeOfficeTemp(dir)).removed).toBe(true);
  });
  it("cancels a queued request without allocating resources or cancelling other jobs", async () => {
    let unblock!: () => void;
    const gate = new Promise<void>((r) => {
      unblock = r;
    });
    runner.mockImplementation(() => gate);
    const options = { inputPath: "file.docx", format: "pdf", timeoutMs: 100 };
    const first = withOfficeConversion(options, async () => 1);
    const second = withOfficeConversion(options, async () => 2);
    const controller = new AbortController();
    const third = withOfficeConversion(
      { ...options, signal: controller.signal },
      async () => 3,
    );
    controller.abort();
    await expect(third).rejects.toMatchObject({ code: "CANCELLED" });
    unblock();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it("shutdown waits for active cleanup and rejects the pending queue", async () => {
    runner.mockImplementation(async ({ signal }) => {
      if (signal.aborted) throw new OfficeError("CANCELLED");
      await new Promise<void>((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new OfficeError("CANCELLED")),
          { once: true },
        ),
      );
    });
    const jobs = Array.from({ length: 1000 }, () =>
      withOfficeConversion(
        {
          inputPath: "file.docx",
          format: "pdf",
          timeoutMs: 100,
        },
        async () => 1,
      ),
    );
    const results = Promise.allSettled(jobs);
    // Let allocated jobs register with the shutdown manager.
    await new Promise((r) => setTimeout(r, 20));
    await stopOfficeJobs();
    expect((await results).every((r) => r.status === "rejected")).toBe(true);
  });
});

describe("Conservative orphan collection", () => {
  async function directory(name: string) {
    const path = join(root, name);
    await mkdir(path);
    await writeFile(join(path, "data"), "12345");
    return path;
  }
  const future = () => Date.now() + 3 * 60 * 60 * 1000;
  it("retains recent directories and all other programs' files", async () => {
    await directory("sirel-office-profile-Recent");
    await directory("other-program");
    await writeFile(join(root, "unrelated.tmp"), "KEEP");
    const result = await collectOfficeOrphans({
      root,
      hasProcesses: async () => false,
    });
    expect(result.removed).toBe(0);
    expect(await readFile(join(root, "unrelated.tmp"), "utf8")).toBe("KEEP");
  });
  it("removes old legacy SIREL directories only; reports recovered bytes", async () => {
    await directory("sirel-office-text-Old123");
    const preview = await collectOfficeOrphans({
      root,
      now: future(),
      dryRun: true,
      hasProcesses: async () => false,
    });
    expect(preview.eligible).toBe(2);
    expect(preview.removed).toBe(0);
    const result = await collectOfficeOrphans({
      root,
      now: future(),
      hasProcesses: async () => false,
    });
    expect(result.removed).toBe(2);
    expect(result.bytes).toBe(10);
    expect(await readFile(join(root, "other-program", "data"), "utf8")).toBe(
      "12345",
    );
  });
  it("preserves a live owner even if its directory is old", async () => {
    const path = await directory("sirel-office-text-Active");
    await writeFile(
      join(path, officeOwnerFile),
      JSON.stringify({ version: 1, pid: process.pid, released: false }),
    );
    const result = await collectOfficeOrphans({
      root,
      now: future(),
      hasProcesses: async () => false,
    });
    expect(result.removed).toBe(0);
  });
  it("skips all old residues if any LibreOffice is active or inventory fails", async () => {
    await directory("sirel-office-profile-Legacy");
    expect(
      (
        await collectOfficeOrphans({
          root,
          now: future(),
          hasProcesses: async () => true,
        })
      ).removed,
    ).toBe(0);
    expect(
      (
        await collectOfficeOrphans({
          root,
          now: future(),
          hasProcesses: async () => {
            throw new Error();
          },
        })
      ).removed,
    ).toBe(0);
  });
  it("recovers a dead owner; rejects malformed ownership metadata", async () => {
    const dead = await directory("sirel-office-text-Dead12");
    await writeFile(
      join(dead, officeOwnerFile),
      JSON.stringify({ version: 1, pid: 2147483647, released: false }),
    );
    const invalid = await directory("sirel-office-text-Bad123");
    await writeFile(join(invalid, officeOwnerFile), "bad");
    const result = await collectOfficeOrphans({
      root,
      now: future(),
      hasProcesses: async () => false,
    });
    expect(result.removed).toBe(2); // dead owner and the legacy residue from previous test
    expect((await stat(invalid)).isDirectory()).toBe(true);
  });
  it("does not follow junctions or accept a path outside the allowed root", async () => {
    const target = join(root, "other-program");
    const link = join(root, "sirel-office-profile-Link12");
    await symlink(target, link, "junction");
    await collectOfficeOrphans({
      root,
      now: future(),
      hasProcesses: async () => false,
    });
    expect(await readFile(join(target, "data"), "utf8")).toBe("12345");
    expect((await removeOfficeTemp(target, root)).removed).toBe(false);
  });
});
