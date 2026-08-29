import { describe, expect, it } from "vitest";

import { applicationSecurityHeaders, contentSecurityPolicy } from "@/lib/security";

describe("frontend security headers", () => {
  it("restricts framing and includes only configured API origins", () => {
    const policy = contentSecurityPolicy({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://app.example.test",
      NEXT_PUBLIC_API_URL: "https://api.example.test/path",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    });

    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("https://api.example.test");
    expect(policy).toContain("https://project.supabase.co");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("/path");
  });

  it("adds HSTS only for an HTTPS production application", () => {
    const local = applicationSecurityHeaders({
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    const production = applicationSecurityHeaders({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://app.example.test",
    });

    expect(local.some((header) => header.key === "Strict-Transport-Security")).toBe(false);
    expect(production.some((header) => header.key === "Strict-Transport-Security")).toBe(true);
  });
});
