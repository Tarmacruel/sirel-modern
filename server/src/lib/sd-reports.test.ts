import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSdReportRuntimePaths } from "./sd-reports.js";

describe("resolveSdReportRuntimePaths", () => {
  it("mantem script e relatorios relativos a raiz real do projeto", () => {
    const root = resolve("C:/sirel-modern");

    expect(resolveSdReportRuntimePaths(root)).toEqual({
      reportsRoot: resolve(root, "storage/reports/sd"),
      pythonScriptPath: resolve(root, "scripts/process_sd_reports.py"),
    });
  });
});
