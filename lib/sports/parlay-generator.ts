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
  parlay1: MarketOpportunity[]; // Parley 1: Seguro / Élite (3 Picks)
  parlay2: MarketOpportunity[]; // Parley 2: Valor / Oro (3 Picks)
  parlay3: MarketOpportunity[]; // Parley 3: Bomba / Platino (3 Picks)
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
 * Generates THREE mutually exclusive Parlays with 3 predictions each (9 distinct picks in total):
 * 1. Parley 1 (Seguro / Élite): 3 highest probability & confidence selections (Max Winrate).
 * 2. Parley 2 (Valor / Oro): 3 highest Expected Value (+EV) selections from distinct matches.
 * 3. Parley 3 (Bomba / Platino): 3 bold / high-yield multiplier selections from distinct matches.
 */
export function buildTripleExclusiveParlays(predictions: MarketOpportunity[]): TripleExclusiveParlays {
  const validPool = [...predictions].filter((p) => p.odds >= 1.25 && p.probability >= 35);
  const usedMatchKeys = new Set<string>();

  const getMatchKey = (p: MarketOpportunity): string => {
    return `${p.fixtureId || 0}-${p.homeTeam.trim().toLowerCase()}-${p.awayTeam.trim().toLowerCase()}`;
  };

  const select3Picks = (
    pool: MarketOpportunity[],
    sorter: (a: MarketOpportunity, b: MarketOpportunity) => number
  ): MarketOpportunity[] => {
    const selected: MarketOpportunity[] = [];
    const usedCategories = new Set<string>();

    const sorted = [...pool]
      .filter((p) => !usedMatchKeys.has(getMatchKey(p)))
      .sort(sorter);

    for (const p of sorted) {
      if (selected.length >= 3) break;
      const key = getMatchKey(p);
      const cat = getMarketCategory(p.market);
      if (!usedMatchKeys.has(key) && !usedCategories.has(cat)) {
        selected.push(p);
        usedMatchKeys.add(key);
        usedCategories.add(cat);
      }
    }

    if (selected.length < 3) {
      for (const p of sorted) {
        if (selected.length >= 3) break;
        const key = getMatchKey(p);
        if (!usedMatchKeys.has(key)) {
          selected.push(p);
          usedMatchKeys.add(key);
        }
      }
    }

    return selected;
  };

  const parlay1 = select3Picks(validPool, (a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;
    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.smartScore || 0) - (a.smartScore || 0);
  });

  const parlay2 = select3Picks(validPool, (a, b) => {
    const bEv = b.expectedValue || (b.probability * b.odds - 100);
    const aEv = a.expectedValue || (a.probability * a.odds - 100);
    if (bEv !== aEv) return bEv - aEv;
    if (b.edge !== a.edge) return b.edge - a.edge;
    return b.probability - a.probability;
  });

  const parlay3 = select3Picks(validPool, (a, b) => {
    if (b.odds !== a.odds) return b.odds - a.odds;
    return (b.expectedValue || 0) - (a.expectedValue || 0);
  });

  return {
    parlay1,
    parlay2,
    parlay3,
    elite3: parlay1,
    premium5: [...parlay2, ...parlay3.slice(0, 2)],
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

  // 4. Generate once from available predictions
  const generated = buildTripleExclusiveParlays(predictions);

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
    }
  }

  return generated;
}

// Backward compatible aliases
export const buildDualExclusiveParlays = buildTripleExclusiveParlays;
export const getImmutableDualParlays = getImmutableDailyParlays;
