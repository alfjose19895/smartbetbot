import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserPanelPermission,
  setUserPanelPermission,
  canAccessUserManagement,
} from "./vip-permissions";
import { NextRequest } from "next/server";

// Mock session
let mockIdentity: any = null;
vi.mock("@/features/auth/lib/session", () => ({
  getVerifiedIdentity: vi.fn(async () => mockIdentity),
}));

// Mock audit logger
vi.mock("@/lib/audit/audit-logger", () => ({
  getAuditLogs: vi.fn(async () => []),
  logAuditEvent: vi.fn(async () => {}),
}));

import { GET as usersGet, POST as usersPost } from "@/app/api/admin/users/route";

describe("User Management Panel Permissions (Active for all by default, revoked when unchecked)", () => {
  beforeEach(() => {
    mockIdentity = null;
  });

  it("defaults to true for any new or unregistered user ID/email", () => {
    const unconfiguredUser = getUserPanelPermission("unknown-user-id", "random@domain.com");
    expect(unconfiguredUser).toBe(true);

    const emptyUser = getUserPanelPermission(null, null);
    expect(emptyUser).toBe(true);
  });

  it("allows setting permission to false (deselected) and verifies persistence", () => {
    const testUserId = "test-user-revoke-1";
    const testEmail = "bettor_revoked@smartbet.com";

    // Set permission to false (deselected)
    const success = setUserPanelPermission(testUserId, false, testEmail);
    expect(success).toBe(true);

    // Read back by ID and by Email
    expect(getUserPanelPermission(testUserId, null)).toBe(false);
    expect(getUserPanelPermission(null, testEmail)).toBe(false);

    // Re-enable
    setUserPanelPermission(testUserId, true, testEmail);
    expect(getUserPanelPermission(testUserId, null)).toBe(true);
  });

  it("evaluates canAccessUserManagement correctly", () => {
    // 1. Superadmin is always allowed
    expect(
      canAccessUserManagement({
        id: "superadmin-1",
        email: "ing.alfredohermoso@gmail.com ajhs1589",
        role: "admin",
      })
    ).toBe(true);

    // 2. Default user without explicit override is allowed (active for all by default)
    expect(
      canAccessUserManagement({
        id: "default-user",
        email: "regular@bettor.com",
        role: "user",
      })
    ).toBe(true);

    // 3. User with explicit canManageUsers: false is blocked
    expect(
      canAccessUserManagement({
        id: "blocked-user",
        email: "blocked@bettor.com",
        role: "user",
        canManageUsers: false,
      })
    ).toBe(false);

    // 4. User with user_metadata.can_manage_users: false is blocked
    expect(
      canAccessUserManagement({
        id: "blocked-meta-user",
        email: "blockedmeta@bettor.com",
        role: "user",
        user_metadata: { can_manage_users: false },
      })
    ).toBe(false);
  });

  it("blocks GET /api/admin/users when user has canManageUsers: false with 403", async () => {
    mockIdentity = {
      id: "denied-bettor",
      email: "denied@bettor.com",
      role: "user",
      canManageUsers: false,
    };

    const req = new NextRequest("http://localhost/api/admin/users");
    const res = await usersGet(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("revocado");
  });

  it("blocks POST /api/admin/users when user has canManageUsers: false with 403", async () => {
    mockIdentity = {
      id: "denied-admin",
      email: "revoked_admin@bettor.com",
      role: "admin",
      canManageUsers: false,
    };

    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "target-1", action: "editUser" }),
    });

    const res = await usersPost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("revocado");
  });
});
