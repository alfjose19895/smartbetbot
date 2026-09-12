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
const TMP_SUBSCRIPTIONS_FILE = path.join("/tmp", "push_subscriptions.json");

// In-memory fallback cache across lambda invocations within the same container
let memoryCache: StoredPushSubscription[] | null = null;

function safeReadFile(filePath: string): StoredPushSubscription[] {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  return [];
}

function safeWriteFile(filePath: string, data: StoredPushSubscription[]) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    // Write may fail in read-only environments
  }
}

export function getAllPushSubscriptions(): StoredPushSubscription[] {
  const map = new Map<string, StoredPushSubscription>();

  // 1. Check memory cache
  if (memoryCache) {
    for (const sub of memoryCache) {
      if (sub && sub.endpoint) map.set(sub.endpoint, sub);
    }
  }

  // 2. Check /tmp file (Vercel serverless writable path)
  const tmpSubs = safeReadFile(TMP_SUBSCRIPTIONS_FILE);
  for (const sub of tmpSubs) {
    if (sub && sub.endpoint) map.set(sub.endpoint, sub);
  }

  // 3. Check workspace data/ file
  const dataSubs = safeReadFile(SUBSCRIPTIONS_FILE);
  for (const sub of dataSubs) {
    if (sub && sub.endpoint && !map.has(sub.endpoint)) {
      map.set(sub.endpoint, sub);
    }
  }

  const all = Array.from(map.values());
  memoryCache = all;
  return all;
}

export function savePushSubscription(sub: {
  endpoint: string;
  keys: PushSubscriptionKeys;
  userAgent?: string;
}): StoredPushSubscription {
  const current = getAllPushSubscriptions();
  const existingIdx = current.findIndex((s) => s.endpoint === sub.endpoint);

  const now = new Date().toISOString();
  const ua = sub.userAgent || "";
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
  const deviceType = isMobile ? "mobile" : "desktop";

  const entry: StoredPushSubscription = {
    id: `sub_${Buffer.from(sub.endpoint).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
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

  memoryCache = current;

  // Persist to both /tmp and data/
  safeWriteFile(TMP_SUBSCRIPTIONS_FILE, current);
  safeWriteFile(SUBSCRIPTIONS_FILE, current);

  return entry;
}

export function removePushSubscription(endpoint: string): boolean {
  try {
    const current = getAllPushSubscriptions();
    const filtered = current.filter((s) => s.endpoint !== endpoint);
    if (filtered.length !== current.length) {
      memoryCache = filtered;
      safeWriteFile(TMP_SUBSCRIPTIONS_FILE, filtered);
      safeWriteFile(SUBSCRIPTIONS_FILE, filtered);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[PushStore] Error removing push subscription:", error);
    return false;
  }
}
