import { describe, expect, it } from "vitest";

import { buildAuthCallbackUrl, safeRedirectPath } from "@/features/auth/lib/redirects";

describe("safeRedirectPath", () => {
  it("keeps valid internal paths and query parameters", () => {
    expect(safeRedirectPath("/signals/42?source=push")).toBe("/signals/42?source=push");
  });

  it.each([
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "javascript:alert(1)",
    "dashboard",
    "",
  ])("rejects unsafe redirect %s", (candidate) => {
    expect(safeRedirectPath(candidate)).toBe("/dashboard");
  });
});

describe("buildAuthCallbackUrl", () => {
  it("builds a callback on the configured application origin", () => {
    const callback = buildAuthCallbackUrl("/reset-password", {
      NEXT_PUBLIC_APP_URL: "https://app.smartbetbot.example/path",
    });

    expect(callback).toBe(
      "https://app.smartbetbot.example/auth/confirm?next=%2Freset-password",
    );
  });
});
