import { afterEach, describe, expect, it } from "vitest";

import { resolveRequestUser } from "./request-auth.js";

const originalSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

describe("request-auth", () => {
  it("ignora cabecalhos de identidade forjados", () => {
    const request = {
      headers: {
        "x-sirel-role": "admin",
        "x-sirel-user-id": "1",
        "x-sirel-username": "admin",
      },
    };

    expect(resolveRequestUser(request as never)).toBeNull();
  });
});
