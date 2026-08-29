import { describe, expect, it } from "vitest";

import { getAuthErrorMessage } from "@/features/auth/lib/auth-errors";

describe("getAuthErrorMessage", () => {
  it("maps known provider codes to safe Spanish messages", () => {
    expect(getAuthErrorMessage({ code: "invalid_credentials" })).toBe(
      "El correo o la contraseña no son correctos.",
    );
  });

  it("does not expose unknown provider messages", () => {
    expect(getAuthErrorMessage({ code: "unknown", message: "sensitive provider detail" })).toBe(
      "No pudimos completar la solicitud. Inténtalo nuevamente.",
    );
  });
});
