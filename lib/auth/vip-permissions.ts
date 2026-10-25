import fs from "fs";
import path from "path";

export interface VipModuleDefinition {
  key: string;
  label: string;
  icon: string;
  route: string;
}

export const ALL_VIP_MODULES: VipModuleDefinition[] = [
  { key: "corners_vip", label: "Corners VIP", icon: "🚩", route: "/corners-vip" },
  { key: "over25_vip", label: "Over 2.5 VIP", icon: "⚽", route: "/over25-vip" },
  { key: "btts_vip", label: "Ambos Anotan VIP", icon: "🥅", route: "/btts-vip" },
  { key: "home_win_vip", label: "Gana Local VIP", icon: "🏠", route: "/home-win-vip" },
  { key: "away_win_vip", label: "Gana Visitante VIP", icon: "✈️", route: "/away-win-vip" },
  { key: "cards_vip", label: "Tarjetas VIP", icon: "🟨", route: "/cards-vip" },
  { key: "shots_vip", label: "Disparos VIP", icon: "🎯", route: "/shots-vip" },
];

const PERMISSIONS_FILE = path.join(process.cwd(), "data", "user_vip_permissions.json");

function ensureStorage(): void {
  try {
    const dir = path.dirname(PERMISSIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(PERMISSIONS_FILE)) {
      fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify({}, null, 2), "utf-8");
    }
  } catch (err) {
    console.warn("[VipPermissions] Error ensuring storage:", err);
  }
}

function readAllPermissions(): Record<string, string[]> {
  try {
    ensureStorage();
    if (fs.existsSync(PERMISSIONS_FILE)) {
      const raw = fs.readFileSync(PERMISSIONS_FILE, "utf-8");
      return JSON.parse(raw) || {};
    }
  } catch (err) {
    console.warn("[VipPermissions] Error reading permissions file:", err);
  }
  return {};
}

function writeAllPermissions(data: Record<string, string[]>): boolean {
  try {
    ensureStorage();
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("[VipPermissions] Error writing permissions file:", err);
    return false;
  }
}

/**
 * Retorna la lista de módulos VIP permitidos para un usuario por su ID o email.
 */
export function getUserVipPermissions(userId?: string | null, email?: string | null): string[] {
  if (!userId && !email) return [];

  const store = readAllPermissions();

  if (userId && store[userId]) {
    return store[userId];
  }

  if (email) {
    const emailNorm = email.toLowerCase().trim();
    if (store[emailNorm]) {
      return store[emailNorm];
    }
  }

  return [];
}

/**
 * Guarda y actualiza la lista de módulos VIP autorizados para un usuario.
 */
export function setUserVipPermissions(userId: string, modules: string[], email?: string | null): boolean {
  if (!userId) return false;
  const store = readAllPermissions();
  store[userId] = modules;
  if (email) {
    store[email.toLowerCase().trim()] = modules;
  }
  return writeAllPermissions(store);
}

/**
 * Evalúa si un usuario/identidad tiene permiso para un módulo VIP específico.
 * Administradores y superadministradores siempre tienen acceso total.
 */
export function canAccessVipModule(
  identity: {
    id?: string;
    role?: string;
    email?: string | null;
    vipModules?: string[];
    vipAccess?: boolean;
    user_metadata?: any;
  } | null | undefined,
  moduleKey: string
): boolean {
  if (!identity) return false;

  // 1. Administrador siempre tiene acceso irrestricto
  const email = (identity.email || "").toLowerCase();
  const isAdmin =
    identity.role === "admin" ||
    email.includes("ajhs1589") ||
    email.includes("admin") ||
    identity.user_metadata?.role === "admin";

  if (isAdmin) return true;

  // 2. Acceso global VIP
  if (identity.vipAccess === true || identity.user_metadata?.vip_access === true) {
    return true;
  }

  // 3. Módulos en memoria/sesión
  const sessionModules = identity.vipModules || identity.user_metadata?.vip_modules || [];
  if (Array.isArray(sessionModules)) {
    if (sessionModules.includes("*") || sessionModules.includes("all") || sessionModules.includes(moduleKey)) {
      return true;
    }
  }

  // 4. Módulos persistidos en disco
  const diskModules = getUserVipPermissions(identity.id, identity.email);
  if (diskModules.includes("*") || diskModules.includes("all") || diskModules.includes(moduleKey)) {
    return true;
  }

  return false;
}
