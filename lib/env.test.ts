import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getOptionalSupabaseConfig,
  getSiteUrl,
  getSupabaseConfig,
  isSupabaseConfigured,
} from "@/lib/env";

describe("public environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires both public Supabase values", () => {
    expect(getOptionalSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" })).toBeNull();
    expect(isSupabaseConfigured({})).toBe(false);
  });

  it("returns a complete Supabase configuration", () => {
    expect(
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("reads public Supabase values from direct runtime references", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://runtime.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_runtime");

    expect(getSupabaseConfig()).toEqual({
      url: "https://runtime.supabase.co",
      publishableKey: "sb_publishable_runtime",
    });
  });

  it("normalizes a Vercel deployment URL", () => {
    expect(getSiteUrl({ NEXT_PUBLIC_VERCEL_URL: "preview.vercel.app" })).toBe(
      "https://preview.vercel.app",
    );
  });
});
