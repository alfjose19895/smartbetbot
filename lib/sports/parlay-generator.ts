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
    return "today";
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
 * 
 * Strict Guarantee:
 * - ZERO match repetition across the 3 parlays (9 completely distinct matches).
 * - Maximum market diversification across legs (1X2, Over 2.5, BTTS).
 */
export function buildTripleExclusiveParlays(predictions: MarketOpportunity[]): TripleExclusiveParlays {
  const todayStr = getEcuadorDateString(Date.now());

  // Filter candidate pool (prioritize today, then general upcoming)
  const validPool = [...predictions].filter((p) => p.odds >= 1.25 && p.probability >= 35);

  const usedMatchKeys = new Set<string>();

  const getMatchKey = (p: MarketOpportunity): string => {
    return `${p.fixtureId || 0}-${p.homeTeam.trim().toLowerCase()}-${p.awayTeam.trim().toLowerCase()}`;
  };

  // Helper to build a 3-pick parlay given a candidate list and criteria
  const select3Picks = (
    pool: MarketOpportunity[],
    sorter: (a: MarketOpportunity, b: MarketOpportunity) => number
  ): MarketOpportunity[] => {
    const selected: MarketOpportunity[] = [];
    const usedCategories = new Set<string>();

    const sorted = [...pool]
      .filter((p) => !usedMatchKeys.has(getMatchKey(p)))
      .sort(sorter);

    // Pass 1: Select picks with unique market categories to enforce diversity
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

    // Pass 2: If we couldn't find 3 distinct categories, pick any remaining unused match
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

  // 1. Build Parley 1: Seguro (Highest Probability & SmartScore)
  const parlay1 = select3Picks(validPool, (a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;
    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.smartScore || 0) - (a.smartScore || 0);
  });

  // 2. Build Parley 2: Valor (Highest Expected Value (+EV) and Edge)
  const parlay2 = select3Picks(validPool, (a, b) => {
    const bEv = b.expectedValue || (b.probability * b.odds - 100);
    const aEv = a.expectedValue || (a.probability * a.odds - 100);
    if (bEv !== aEv) return bEv - aEv;
    if (b.edge !== a.edge) return b.edge - a.edge;
    return b.probability - a.probability;
  });

  // 3. Build Parley 3: Bomba / Multiplicador (Highest Odds with Value)
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

// Backward compatible alias
export const buildDualExclusiveParlays = buildTripleExclusiveParlays;
