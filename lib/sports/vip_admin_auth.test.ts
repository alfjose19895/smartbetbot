import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock session
let mockIdentity: any = null;
vi.mock("@/features/auth/lib/session", () => ({
  getVerifiedIdentity: vi.fn(async () => mockIdentity),
}));

// Mock server slates to avoid calling external API-Football
vi.mock("@/lib/sports/over25-vip-server", () => ({
  getOver25VipSlate: vi.fn(async () => ({ date: "2026-10-24", count: 0, predictions: [], stats: {} })),
  searchAndAddNewOver25VipAlerts: vi.fn(async () => ({ success: true, newAlerts: [], totalAlerts: 0, predictions: [], message: "ok" })),
}));

vi.mock("@/lib/sports/btts-vip-server", () => ({
  getBttsVipSlate: vi.fn(async () => ({ date: "2026-10-24", count: 0, predictions: [], stats: {} })),
  searchAndAddNewBttsVipAlerts: vi.fn(async () => ({ success: true, newAlerts: [], totalAlerts: 0, predictions: [], message: "ok" })),
}));

vi.mock("@/lib/sports/home-win-vip-server", () => ({
  getHomeWinVipSlate: vi.fn(async () => ({ date: "2026-10-24", count: 0, predictions: [], stats: {} })),
  searchAndAddNewHomeWinVipAlerts: vi.fn(async () => ({ success: true, newAlerts: [], totalAlerts: 0, predictions: [], message: "ok" })),
}));

vi.mock("@/lib/sports/away-win-vip-server", () => ({
  getAwayWinVipSlate: vi.fn(async () => ({ date: "2026-10-24", count: 0, predictions: [], stats: {} })),
  searchAndAddNewAwayWinVipAlerts: vi.fn(async () => ({ success: true, newAlerts: [], totalAlerts: 0, predictions: [], message: "ok" })),
}));

import { GET as over25Get, POST as over25Post } from "@/app/api/over25-vip/route";
import { GET as bttsGet, POST as bttsPost } from "@/app/api/btts-vip/route";
import { GET as homeWinGet, POST as homeWinPost } from "@/app/api/home-win-vip/route";
import { GET as awayWinGet, POST as awayWinPost } from "@/app/api/away-win-vip/route";

describe("Strict Permission Guards for VIP Modules (Admin & Assigned Users)", () => {
  beforeEach(() => {
    mockIdentity = null;
  });

  it("blocks unauthenticated users with 403 on Over 2.5 VIP", async () => {
    mockIdentity = null;
    const req = new NextRequest("http://localhost/api/over25-vip");
    const resGet = await over25Get(req);
    expect(resGet.status).toBe(403);
    const bodyGet = await resGet.json();
    expect(bodyGet.error).toContain("no tiene permiso asignado");
    const resPost = await over25Post(req);
    expect(resPost.status).toBe(403);
  });

  it("blocks standard users with no VIP permissions on Ambos Anotan VIP", async () => {
    mockIdentity = { id: "user-123", email: "user@test.com", role: "user", vipModules: [] };
    const req = new NextRequest("http://localhost/api/btts-vip");
    const resGet = await bttsGet(req);
    expect(resGet.status).toBe(403);
    const resPost = await bttsPost(req);
    expect(resPost.status).toBe(403);
  });

  it("allows standard users WHO HAVE ASSIGNED VIP PERMISSION to access that specific module", async () => {
    // User with permission for home_win_vip
    mockIdentity = {
      id: "vip-bettor-1",
      email: "vip@bettor.com",
      role: "user",
      vipModules: ["home_win_vip"],
    };
    const reqHome = new NextRequest("http://localhost/api/home-win-vip");
    const resHome = await homeWinGet(reqHome);
    expect(resHome.status).toBe(200);

    // But fails on away_win_vip where they have no permission
    const reqAway = new NextRequest("http://localhost/api/away-win-vip");
    const resAway = await awayWinGet(reqAway);
    expect(resAway.status).toBe(403);
  });

  it("allows admin users on Ganador Local VIP and Ganador Visitante VIP", async () => {
    mockIdentity = { id: "admin-1", email: "boss@smartbetbot.com", role: "admin", vipModules: ["*"] };
    const reqHome = new NextRequest("http://localhost/api/home-win-vip");
    const resHome = await homeWinGet(reqHome);
    expect(resHome.status).toBe(200);

    const reqAway = new NextRequest("http://localhost/api/away-win-vip");
    const resAway = await awayWinGet(reqAway);
    expect(resAway.status).toBe(200);
  });
});
