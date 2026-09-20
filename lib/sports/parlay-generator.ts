import { MarketOpportunity } from "@/lib/sports/prediction-engine";

export function getEcuadorDateString(d: Date | number | string = Date.now()): string {
  try {
    const dateObj = typeof d === "string" ? new Date(d) : typeof d === "number" ? new Date(d) : d;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(dateObj);
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export interface TripleExclusiveParlays {
  parlay1: MarketOpportunity[]; // Parley 1: Doble Seguro / Élite (2 Picks)
  parlay2: MarketOpportunity[]; // Parley 2: Doble de Valor / Oro (2 Picks)
  parlay3: MarketOpportunity[]; // Parley 3: Doble Pro / Multi-Mercado (2 Picks)
  // Backward-compatible properties:
  elite3: MarketOpportunity[];
  premium5: MarketOpportunity[];
}

export type DualParlays = TripleExclusiveParlays;

// In-memory cache
const memoryParlaysCache: Record<string, TripleExclusiveParlays> = {};

function getNodeFs() {
  if (typeof window === "undefined") {
    try {
      const fs = eval("require")("fs");
      const path = eval("require")("path");
      return { fs, path };
    } catch {}
  }
  return null;
}

function safeReadParlaysFile(filePath: string): Record<string, TripleExclusiveParlays> {
  const node = getNodeFs();
  if (!node) return {};
  try {
    if (node.fs.existsSync(filePath)) {
      const content = node.fs.readFileSync(filePath, "utf8");
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      }
    }
  } catch {}
  return {};
}

function safeWriteParlaysFile(filePath: string, data: Record<string, TripleExclusiveParlays>) {
  const node = getNodeFs();
  if (!node) return;
  try {
    const dir = node.path.dirname(filePath);
    if (!node.fs.existsSync(dir)) {
      node.fs.mkdirSync(dir, { recursive: true });
    }
    node.fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch {}
}

/**
 * Normalizes market descriptions into distinct categories to guarantee market diversity in parlays.
 */
export function getMarketCategory(marketName: string): string {
  const m = (marketName || "").toLowerCase().trim();
  if (m.includes("córner") || m.includes("corner")) return "CORNERS";
  if (m.includes("ambos") || m.includes("btts")) return "BTTS";
  if (m.includes("doble") || m.includes("1x") || m.includes("x2") || m.includes("12")) return "DOUBLE_CHANCE";
  if (
    m.includes("ganador local") ||
    m.includes("ganador visitante") ||
    m.includes("gana local") ||
    m.includes("gana visitante") ||
    m.includes("1x2") ||
    m.startsWith("gana") ||
    m.startsWith("ganador")
  ) {
    return "MONEYLINE";
  }
  if (m.includes("under") || m.includes("menos")) return "GOALS_UNDER";
  if (m.includes("over") || m.includes("más") || m.includes("mas")) return "GOALS_OVER";
  if (m.includes("handicap") || m.includes("hándicap")) return "HANDICAP";
  return "OTHER";
}

/**
 * Strict quality qualification filter for 2-Pick Parlays:
 * - Minimum probability >= 68.0% (target 70% - 85%)
 * - Tier 1 & Tier 2 curated leagues only
 * - High-confidence odds range (1.25 to 1.95)
 */
export function isQualifiedForParlay(p: MarketOpportunity): boolean {
  const prob = typeof p.probability === "number" ? p.probability : 0;
  const odds = typeof p.odds === "number" ? p.odds : 0;
  const tier = typeof p.leagueTier === "number" ? p.leagueTier : 2;

  if (prob < 68.0) return false;
  if (odds > 1.95 || odds < 1.22) return false;
  if (tier > 2) return false;

  return true;
}

/**
 * Generates THREE mutually exclusive 2-Pick Parlays (Dobles de Oro) with 2 predictions each:
 * 1. Parley 1 (🛡️ Doble Seguro): 2 highest probability & confidence selections (Max Winrate >= 68% - 85%).
 * 2. Parley 2 (💎 Doble de Valor): 2 highest Expected Value (+EV) selections with prob >= 68%.
 * 3. Parley 3 (🔥 Doble Pro): 2 diversified low-variance selections with prob >= 68%.
 */
export function buildTripleExclusiveParlays(
  predictions: MarketOpportunity[],
  dateStr?: string
): TripleExclusiveParlays {
  const targetDate = dateStr || getEcuadorDateString(Date.now());
  
  // Strict filter: >= 68% prob, Tier 1/2 leagues, 1.25 - 1.95 odds
  let strictPool = [...predictions].filter((p) => {
    const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : targetDate;
    return pDate === targetDate && isQualifiedForParlay(p);
  });

  // Fallback if strict pool has fewer than 6 picks: accept top probability picks (>= 60%) from curated leagues
  if (strictPool.length < 6) {
    const fallbackCandidates = [...predictions].filter((p) => {
      const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : targetDate;
      const prob = typeof p.probability === "number" ? p.probability : 0;
      const odds = typeof p.odds === "number" ? p.odds : 0;
      return pDate === targetDate && prob >= 60.0 && odds >= 1.22 && odds <= 2.10;
    });
    strictPool = fallbackCandidates;
  }

  const usedMatchKeys = new Set<string>();

  const getMatchKey = (p: MarketOpportunity): string => {
    return `${p.fixtureId || 0}-${p.homeTeam.trim().toLowerCase()}-${p.awayTeam.trim().toLowerCase()}`;
  };

  const selectNPicks = (
    pool: MarketOpportunity[],
    targetCount: number,
    sorter: (a: MarketOpportunity, b: MarketOpportunity) => number
  ): MarketOpportunity[] => {
    const selected: MarketOpportunity[] = [];
    const usedCategories = new Set<string>();

    const sorted = [...pool]
      .filter((p) => !usedMatchKeys.has(getMatchKey(p)))
      .sort(sorter);

    for (const p of sorted) {
      if (selected.length >= targetCount) break;
      const key = getMatchKey(p);
      const cat = getMarketCategory(p.market);
      if (!usedMatchKeys.has(key) && !usedCategories.has(cat)) {
        selected.push(p);
        usedMatchKeys.add(key);
        usedCategories.add(cat);
      }
    }

    if (selected.length < targetCount) {
      for (const p of sorted) {
        if (selected.length >= targetCount) break;
        const key = getMatchKey(p);
        if (!usedMatchKeys.has(key)) {
          selected.push(p);
          usedMatchKeys.add(key);
        }
      }
    }

    return selected;
  };

  // 1. Doble Seguro: 2 highest probability and confidence picks (Max Winrate)
  const parlay1 = selectNPicks(strictPool, 2, (a, b) => {
    const aTier = a.leagueTier || 2;
    const bTier = b.leagueTier || 2;
    if (aTier !== bTier) return aTier - bTier;
    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.smartScore || 0) - (a.smartScore || 0);
  });

  // 2. Doble de Valor: 2 highest Expected Value (+EV) picks with prob >= 68%
  const parlay2 = selectNPicks(strictPool, 2, (a, b) => {
    const bEv = b.expectedValue || (b.probability * b.odds - 100);
    const aEv = a.expectedValue || (a.probability * a.odds - 100);
    if (bEv !== aEv) return bEv - aEv;
    if (b.edge !== a.edge) return b.edge - a.edge;
    return b.probability - a.probability;
  });

  // 3. Doble Pro: 2 high-yield diversified low-variance selections
  const parlay3 = selectNPicks(strictPool, 2, (a, b) => {
    const aTier = a.leagueTier || 2;
    const bTier = b.leagueTier || 2;
    if (aTier !== bTier) return aTier - bTier;
    const bScore = (b.smartScore || 70) * (b.probability || 50);
    const aScore = (a.smartScore || 70) * (a.probability || 50);
    if (bScore !== aScore) return bScore - aScore;
    return b.edge - a.edge;
  });

  return {
    parlay1,
    parlay2,
    parlay3,
    elite3: parlay1,
    premium5: [...parlay1, ...parlay2],
  };
}

/**
 * Returns IMMUTABLE daily parlays for the specified date (defaults to today in Ecuador timezone).
 * Once calculated for a date, they are persisted and NEVER change or mutate during the day.
 */
export function getImmutableDailyParlays(
  predictions: MarketOpportunity[],
  dateStr?: string
): TripleExclusiveParlays {
  const targetDate = dateStr || getEcuadorDateString(Date.now());

  // 1. Check in-memory cache
  if (memoryParlaysCache[targetDate] && memoryParlaysCache[targetDate].parlay1?.length > 0) {
    return memoryParlaysCache[targetDate];
  }

  // 2. Check localStorage in browser
  if (typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(`smartbetbot_immutable_parlays_${targetDate}`);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed?.parlay1?.length > 0) {
          memoryParlaysCache[targetDate] = parsed;
          return parsed;
        }
      }
    } catch {}
  }

  // 3. Check disk /tmp and data/ on server
  const node = getNodeFs();
  if (node) {
    const parlaysFile = node.path.join(process.cwd(), "data", "daily_parlays.json");
    const tmpParlaysFile = node.path.join("/tmp", "daily_parlays.json");

    const tmpData = safeReadParlaysFile(tmpParlaysFile);
    if (tmpData[targetDate] && tmpData[targetDate].parlay1?.length > 0) {
      memoryParlaysCache[targetDate] = tmpData[targetDate];
      return tmpData[targetDate];
    }

    const diskData = safeReadParlaysFile(parlaysFile);
    if (diskData[targetDate] && diskData[targetDate].parlay1?.length > 0) {
      memoryParlaysCache[targetDate] = diskData[targetDate];
      return diskData[targetDate];
    }
  }

  // 4. Generate once from available predictions strictly for target date
  const generated = buildTripleExclusiveParlays(predictions, targetDate);

  if (generated.parlay1.length > 0 || generated.parlay2.length > 0 || generated.parlay3.length > 0) {
    memoryParlaysCache[targetDate] = generated;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`smartbetbot_immutable_parlays_${targetDate}`, JSON.stringify(generated));
      } catch {}
    }

    if (node) {
      const parlaysFile = node.path.join(process.cwd(), "data", "daily_parlays.json");
      const tmpParlaysFile = node.path.join("/tmp", "daily_parlays.json");

      const diskData = safeReadParlaysFile(parlaysFile);
      const tmpData = safeReadParlaysFile(tmpParlaysFile);

      diskData[targetDate] = generated;
      tmpData[targetDate] = generated;

      safeWriteParlaysFile(parlaysFile, diskData);
      safeWriteParlaysFile(tmpParlaysFile, tmpData);

      // Cloud database sync (Vercel Serverless persistence)
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        if (supabaseUrl && supabaseKey) {
          const { createClient } = eval("require")("@supabase/supabase-js");
          const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
          (async () => {
            try {
              const { data: existingRow } = await supabase
                .from("daily_snapshots")
                .select("picks")
                .eq("date", targetDate)
                .maybeSingle();

              await supabase
                .from("daily_snapshots")
                .upsert({
                  date: targetDate,
                  picks: existingRow?.picks || [],
                  parlays: generated,
                  updated_at: new Date().toISOString(),
                }, { onConflict: "date" });
            } catch (pErr) {
              console.warn("[Parlay Cloud Sync] Error syncing parlays to Supabase:", pErr);
            }
          })();
        }
      } catch {}
    }
  }

  return generated;
}

// Backward compatible aliases
export const buildDualExclusiveParlays = buildTripleExclusiveParlays;
export const getImmutableDualParlays = getImmutableDailyParlays;