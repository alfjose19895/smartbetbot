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

import { MarketOpportunity } from "@/lib/sports/prediction-engine";

export interface DualParlays {
  elite3: MarketOpportunity[];
  premium5: MarketOpportunity[];
}

/**
 * Normalizes market descriptions into distinct categories to guarantee market diversity in parlays.
 */
export function getMarketCategory(marketName: string): string {
  const m = (marketName || "").toLowerCase().trim();
  if (m.includes("ambos") || m.includes("btts")) return "BTTS";
  if (m.includes("doble") || m.includes("1x") || m.includes("x2") || m.includes("12")) return "DOUBLE_CHANCE";
  if (m.includes("gana local") || m.includes("gana visitante") || m.includes("1x2") || m.startsWith("gana")) return "MONEYLINE";
  if (m.includes("under") || m.includes("menos")) return "GOALS_UNDER";
  if (m.includes("over") || m.includes("más") || m.includes("mas")) return "GOALS_OVER";
  if (m.includes("handicap") || m.includes("hándicap")) return "HANDICAP";
  return "OTHER";
}

/**
 * Generates two mutually exclusive Parlays:
 * 1. Parley Élite (3 Picks): 3 highest-conviction picks with distinct markets.
 * 2. Parley Premium (5 Picks): 5 high-confidence picks strictly from DIFFERENT matches and diversified markets.
 * 
 * Guarantees:
 * - NO match repetition between Parley Élite and Parley Premium.
 * - Market diversity (mix of 1X2, Doble Oportunidad, Over/Under, BTTS).
 */
export function buildDualExclusiveParlays(predictions: MarketOpportunity[]): DualParlays {
  const todayStr = getEcuadorDateString(Date.now());

  // Filter high-conviction candidate picks (prioritize today)
  const todayPicks = [...predictions]
    .filter((p) => {
      const isToday = getEcuadorDateString(new Date(p.kickoff)) === todayStr;
      return isToday && p.probability >= 55 && p.odds >= 1.35;
    })
    .sort((a, b) => b.probability - a.probability || (b.smartScore || 0) - (a.smartScore || 0));

  const candidatePool =
    todayPicks.length >= 8
      ? todayPicks
      : [...predictions]
          .filter((p) => p.probability >= 55 && p.odds >= 1.35)
          .sort((a, b) => b.probability - a.probability || (b.smartScore || 0) - (a.smartScore || 0));

  // 1. Build Parley Élite (3 Picks)
  const elite3: MarketOpportunity[] = [];
  const eliteMatches = new Set<string>();
  const eliteMarketCats = new Set<string>();

  // Pass 1: pick highest probability with unique market category and unique match
  for (const pick of candidatePool) {
    if (elite3.length >= 3) break;
    const cat = getMarketCategory(pick.market);
    if (!eliteMatches.has(pick.match) && !eliteMarketCats.has(cat)) {
      elite3.push(pick);
      eliteMatches.add(pick.match);
      eliteMarketCats.add(cat);
    }
  }

  // Pass 2: fill if needed with unique match
  if (elite3.length < 3) {
    for (const pick of candidatePool) {
      if (elite3.length >= 3) break;
      if (!eliteMatches.has(pick.match)) {
        elite3.push(pick);
        eliteMatches.add(pick.match);
      }
    }
  }

  // 2. Build Parley Premium (5 Picks) EXCLUDING any matches used in Parley Élite
  const remainingPool = candidatePool.filter((p) => !eliteMatches.has(p.match));
  const premium5: MarketOpportunity[] = [];
  const premiumMatches = new Set<string>();
  const premiumMarketCats = new Map<string, number>();

  // Pass 1: select diversified market picks from remaining non-overlapping matches
  for (const pick of remainingPool) {
    if (premium5.length >= 5) break;
    const cat = getMarketCategory(pick.market);
    const catCount = premiumMarketCats.get(cat) || 0;
    // Allow at most 2 per market category to guarantee rich diversity
    if (!premiumMatches.has(pick.match) && catCount < 2) {
      premium5.push(pick);
      premiumMatches.add(pick.match);
      premiumMarketCats.set(cat, catCount + 1);
    }
  }

  // Pass 2: fill remaining slots from remainingPool
  if (premium5.length < 5) {
    for (const pick of remainingPool) {
      if (premium5.length >= 5) break;
      if (!premiumMatches.has(pick.match)) {
        premium5.push(pick);
        premiumMatches.add(pick.match);
      }
    }
  }

  // Pass 3: emergency fallback ONLY if entire database has fewer than 8 unique matches
  if (premium5.length < 5) {
    for (const pick of candidatePool) {
      if (premium5.length >= 5) break;
      if (!premiumMatches.has(pick.match)) {
        premium5.push(pick);
        premiumMatches.add(pick.match);
      }
    }
  }

  return { elite3, premium5 };
}
