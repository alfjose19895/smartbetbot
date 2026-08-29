import { describe, expect, it } from "vitest";

import { isProtectedPath } from "@/lib/supabase/proxy";

describe("protected product routes", () => {
  it.each([
    "/dashboard",
    "/live",
    "/prematch",
    "/signals/fixture",
    "/track-record",
    "/backtesting",
    "/settings",
    "/admin",
  ])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it("keeps public and similarly named paths public", () => {
    expect(isProtectedPath("/responsible-gambling")).toBe(false);
    expect(isProtectedPath("/dashboard-public")).toBe(false);
  });
});
