import { afterEach, describe, expect, it } from "vitest";

import {
  createPublicDocumentLink,
  verifyPublicDocumentLink,
} from "./public-document-link.js";

const originalSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

describe("public-document-link", () => {
  it("emite uma capacidade opaca e verificável", () => {
    process.env.JWT_SECRET = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
    const link = createPublicDocumentLink(4242);
    const token = link.split("/")[4] ?? "";

    expect(link).not.toContain("4242");
    expect(verifyPublicDocumentLink(token)).toBe(4242);
  });

  it("recusa uma capacidade modificada", () => {
    process.env.JWT_SECRET = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
    const link = createPublicDocumentLink(7);
    const token = link.split("/")[4] ?? "";
    const parts = token.split(".");
    parts[3] = `${parts[3]?.startsWith("A") ? "B" : "A"}${parts[3]?.slice(1) ?? ""}`;
    const modified = parts.join(".");

    expect(verifyPublicDocumentLink(modified)).toBeNull();
  });
});
