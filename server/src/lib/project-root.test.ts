import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "./project-root.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const expectedRoot = resolve(currentDir, "../../..");

describe("resolveProjectRoot", () => {
  it("resolve a raiz a partir do layout de desenvolvimento", () => {
    expect(
      resolveProjectRoot(
        resolve(expectedRoot, "server/src/lib"),
        resolve(expectedRoot, "server"),
      ),
    ).toBe(expectedRoot);
  });

  it("resolve a raiz a partir do layout compilado em server/dist", () => {
    expect(
      resolveProjectRoot(
        resolve(expectedRoot, "server/dist/server/src/lib"),
        resolve(expectedRoot, "server/dist"),
      ),
    ).toBe(expectedRoot);
  });
});
