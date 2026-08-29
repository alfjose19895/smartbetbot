import { describe, expect, it } from "vitest";

import {
  emailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/features/auth/lib/validation";

describe("authentication validation", () => {
  it("normalizes valid email input", () => {
    const result = emailSchema.parse({ email: "  analyst@example.com " });
    expect(result.email).toBe("analyst@example.com");
  });

  it("rejects malformed login data", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "" });
    expect(result.success).toBe(false);
  });

  it("requires matching registration passwords", () => {
    const result = registerSchema.safeParse({
      fullName: "Ada Analyst",
      email: "ada@example.com",
      password: "secure-password",
      confirmPassword: "different-password",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toContain(
        "Las contraseñas no coinciden.",
      );
    }
  });

  it("accepts a valid password reset", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "secure-password",
        confirmPassword: "secure-password",
      }).success,
    ).toBe(true);
  });
});
