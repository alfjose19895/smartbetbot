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

import { GET as over25Get, POST as over25Post } from "@/app/api/over25-vip/route";
import { GET as bttsGet, POST as bttsPost } from "@/app/api/btts-vip/route";

describe("Strict Admin Permission Guards for Over 2.5 VIP and Ambos Anotan VIP", () => {
  beforeEach(() => {
    mockIdentity = null;
  });

  it("blocks unauthenticated users (null identity) with 403 on Over 2.5 VIP", async () => {
    mockIdentity = null;
    const req = new NextRequest("http://localhost/api/over25-vip");
    const resGet = await over25Get(req);
    expect(resGet.status).toBe(403);
    const bodyGet = await resGet.json();
    expect(bodyGet.error).toContain("exclusivo para administradores");

    const resPost = await over25Post(req);
    expect(resPost.status).toBe(403);
  });

  it("blocks standard users (role: 'user') with 403 on Over 2.5 VIP", async () => {
    mockIdentity = {
      id: "user-123",
      email: "bettor@example.com",
      role: "user",
    };
    const req = new NextRequest("http://localhost/api/over25-vip");
    const resGet = await over25Get(req);
    expect(resGet.status).toBe(403);

    const resPost = await over25Post(req);
    expect(resPost.status).toBe(403);
  });

  it("allows admin users (role: 'admin') on Over 2.5 VIP", async () => {
    mockIdentity = {
      id: "admin-1",
      email: "boss@smartbetbot.com",
      role: "admin",
    };
    const req = new NextRequest("http://localhost/api/over25-vip");
    const resGet = await over25Get(req);
    expect(resGet.status).toBe(200);

    const resPost = await over25Post(req);
    expect(resPost.status).toBe(200);
  });

  it("blocks unauthenticated users (null identity) with 403 on Ambos Anotan VIP", async () => {
    mockIdentity = null;
    const req = new NextRequest("http://localhost/api/btts-vip");
    const resGet = await bttsGet(req);
    expect(resGet.status).toBe(403);
    const bodyGet = await resGet.json();
    expect(bodyGet.error).toContain("exclusivo para administradores");

    const resPost = await bttsPost(req);
    expect(resPost.status).toBe(403);
  });

  it("blocks standard users (role: 'user') with 403 on Ambos Anotan VIP", async () => {
    mockIdentity = {
      id: "user-456",
      email: "regular@gmail.com",
      role: "user",
    };
    const req = new NextRequest("http://localhost/api/btts-vip");
    const resGet = await bttsGet(req);
    expect(resGet.status).toBe(403);

    const resPost = await bttsPost(req);
    expect(resPost.status).toBe(403);
  });

  it("allows admin users (role: 'admin' or owner email) on Ambos Anotan VIP", async () => {
    mockIdentity = {
      id: "admin-ajhs",
      email: "ajhs1589@gmail.com",
      role: "admin",
    };
    const req = new NextRequest("http://localhost/api/btts-vip");
    const resGet = await bttsGet(req);
    expect(resGet.status).toBe(200);

    const resPost = await bttsPost(req);
    expect(resPost.status).toBe(200);
  });
});
