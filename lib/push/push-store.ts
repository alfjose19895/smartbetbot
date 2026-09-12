import fs from "fs";
import path from "path";

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  userAgent?: string;
  deviceType?: "mobile" | "desktop" | "tablet" | "unknown";
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push_subscriptions.json");

function ensureDirectoryExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getAllPushSubscriptions(): StoredPushSubscription[] {
  try {
    ensureDirectoryExists();
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
      return [];
    }
    const content = fs.readFileSync(SUBSCRIPTIONS_FILE, "utf8");
    if (!content.trim()) return [];
    return JSON.parse(content);
  } catch (error) {
    console.error("[PushStore] Error reading push subscriptions:", error);
    return [];
  }
}

export function savePushSubscription(sub: {
  endpoint: string;
  keys: PushSubscriptionKeys;
  userAgent?: string;
}): StoredPushSubscription {
  ensureDirectoryExists();
  const current = getAllPushSubscriptions();
  const existingIdx = current.findIndex((s) => s.endpoint === sub.endpoint);

  const now = new Date().toISOString();
  const ua = sub.userAgent || "";
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
  const deviceType = isMobile ? "mobile" : "desktop";

  const entry: StoredPushSubscription = {
    id: `sub_${Buffer.from(sub.endpoint).toString("base64").slice(0, 16)}`,
    endpoint: sub.endpoint,
    keys: sub.keys,
    userAgent: ua,
    deviceType,
    createdAt: existingIdx >= 0 ? current[existingIdx].createdAt : now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    current[existingIdx] = entry;
  } else {
    current.push(entry);
  }

  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(current, null, 2), "utf8");
  } catch (error) {
    console.error("[PushStore] Error writing push subscriptions:", error);
  }

  return entry;
}

export function removePushSubscription(endpoint: string): boolean {
  try {
    ensureDirectoryExists();
    const current = getAllPushSubscriptions();
    const filtered = current.filter((s) => s.endpoint !== endpoint);
    if (filtered.length !== current.length) {
      fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(filtered, null, 2), "utf8");
      return true;
    }
    return false;
  } catch (error) {
    console.error("[PushStore] Error removing push subscription:", error);
    return false;
  }
}
