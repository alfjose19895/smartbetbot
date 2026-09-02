import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface AuditEvent {
  id: string;
  userId?: string;
  email: string;
  fullName?: string;
  action:
    | "login_success"
    | "login_failed"
    | "logout"
    | "user_approved"
    | "role_updated"
    | "user_paused"
    | "settings_updated";
  actionLabel: string;
  ip?: string;
  userAgent?: string;
  device?: string;
  timestamp: string;
  formattedDate: string;
  details?: Record<string, unknown>;
}

function getAuditFilePath(): string {
  return path.resolve(process.cwd(), "data", "audit_logs.json");
}

function formatEcuadorDate(date: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function parseDevice(userAgent?: string): string {
  if (!userAgent) return "Web";
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) return "Móvil";
  if (ua.includes("tablet") || ua.includes("ipad")) return "Tablet";
  return "Escritorio";
}

export async function logAuditEvent(
  event: Omit<AuditEvent, "id" | "timestamp" | "formattedDate" | "device"> & {
    device?: string;
  }
): Promise<AuditEvent> {
  const filePath = getAuditFilePath();
  const now = new Date();

  const newEvent: AuditEvent = {
    id: crypto.randomUUID(),
    userId: event.userId,
    email: event.email.toLowerCase().trim(),
    fullName: event.fullName || event.email,
    action: event.action,
    actionLabel: event.actionLabel,
    ip: event.ip || "127.0.0.1",
    userAgent: event.userAgent,
    device: event.device || parseDevice(event.userAgent),
    timestamp: now.toISOString(),
    formattedDate: formatEcuadorDate(now),
    details: event.details,
  };

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let logs: AuditEvent[] = [];
    if (fs.existsSync(filePath)) {
      try {
        logs = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {
        logs = [];
      }
    }

    // Prepend new log
    logs.unshift(newEvent);

    // Keep up to 2000 events
    if (logs.length > 2000) {
      logs = logs.slice(0, 2000);
    }

    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), "utf-8");
  } catch (err) {
    console.error("[AuditLogger] Error writing audit log:", err);
  }

  return newEvent;
}

export async function getAuditLogs(filter?: {
  email?: string;
  action?: string;
  limit?: number;
}): Promise<AuditEvent[]> {
  const filePath = getAuditFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    let logs: AuditEvent[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (filter?.email) {
      const eNorm = filter.email.toLowerCase().trim();
      logs = logs.filter((l) => l.email.toLowerCase().includes(eNorm));
    }

    if (filter?.action) {
      logs = logs.filter((l) => l.action === filter.action);
    }

    if (filter?.limit && filter.limit > 0) {
      logs = logs.slice(0, filter.limit);
    }

    return logs;
  } catch (err) {
    console.error("[AuditLogger] Error reading audit logs:", err);
    return [];
  }
}

export async function getUserLoginStats(
  emailOrUserId: string
): Promise<{ loginCount: number; lastLoginAt: string | null; lastLoginFormatted: string }> {
  const logs = await getAuditLogs();
  const target = emailOrUserId.toLowerCase().trim();

  const userLogins = logs.filter(
    (l) =>
      l.action === "login_success" &&
      (l.email.toLowerCase() === target || (l.userId && l.userId === target))
  );

  const loginCount = userLogins.length;
  const lastLogin = userLogins[0];

  return {
    loginCount,
    lastLoginAt: lastLogin ? lastLogin.timestamp : null,
    lastLoginFormatted: lastLogin ? lastLogin.formattedDate : "Sin registros",
  };
}
