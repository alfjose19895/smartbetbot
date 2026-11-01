import { apiFootball, extractMatchDetails } from "./api-football";

/**
 * Real Team Statistical Profile & Convergence Enricher (4/5 Consistency Rule)
 * Replaces generic country averages with real recent match telemetry per team:
 * - Goals For / Against (Overall & Home/Away split)
 * - 4/5 Consistency Rates (Over 2.5, BTTS, Scored >= 1, Conceded >= 1, Win/Unbeaten)
 * - Detailed Telemetry (Corners For/Against, Cards For/Against, Shots on Target For/Against)
 */

export interface RealTeamFormMetrics {
  teamId: number;
  sampleSize: number;
  goalsForAvg: number;
  goalsAgainstAvg: number;
  totalGoalsAvg: number;
  scoredRate: number; // 0.0 to 1.0 (e.g. 0.80 = scored in 4/5 matches)
  concededRate: number; // 0.0 to 1.0
  bttsRate: number; // 0.0 to 1.0 (both teams scored in match)
  over25Rate: number; // 0.0 to 1.0 (total goals >= 3)
  over15Rate: number; // 0.0 to 1.0 (total goals >= 2)
  winRate: number; // 0.0 to 1.0
  unbeatenRate: number; // 0.0 to 1.0 (W or D)
  lossRate: number; // 0.0 to 1.0
  recentZeroZeroCount: number;
  failedToScoreCount: number;
  // Detailed telemetry from recent fixture statistics (when available)
  detailedSampleSize: number;
  cornersForAvg?: number;
  cornersAgainstAvg?: number;
  totalCornersAvg?: number;
  over85CornersRate?: number; // fraction of matches with >= 9 total corners
  cardsForAvg?: number;
  cardsAgainstAvg?: number;
  totalCardsAvg?: number;
  over35CardsRate?: number; // fraction of matches with >= 4 total cards
  shotsOnGoalForAvg?: number;
  shotsOnGoalAgainstAvg?: number;
  totalShotsOnGoalAvg?: number;
  over75SogRate?: number; // fraction of matches with >= 8 total shots on target
  over85SogRate?: number; // fraction of matches with >= 9 total shots on target
  totalShotsForAvg?: number;
  totalShotsAgainstAvg?: number;
  totalShotsAvg?: number;
  over225ShotsRate?: number;
}

export interface MatchRealConvergenceContext {
  home?: RealTeamFormMetrics | null;
  away?: RealTeamFormMetrics | null;
  hasGoalsTelemetry: boolean;
  hasDetailedTelemetry: boolean;
}

const basicMetricsCache = new Map<number, { timestamp: number; data: RealTeamFormMetrics }>();
const detailedMetricsCache = new Map<number, { timestamp: number; data: RealTeamFormMetrics }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getRealTeamFormMetrics(
  teamId?: number,
  last: number = 5,
  fetchDetailedStats: boolean = false
): Promise<RealTeamFormMetrics | null> {
  if (!teamId || isNaN(Number(teamId)) || Number(teamId) <= 0) return null;
  const id = Number(teamId);
  const nowMs = Date.now();

  if (fetchDetailedStats) {
    const cachedDet = detailedMetricsCache.get(id);
    if (cachedDet && nowMs - cachedDet.timestamp < CACHE_TTL_MS) {
      return cachedDet.data;
    }
  } else {
    const cachedDet = detailedMetricsCache.get(id);
    if (cachedDet && nowMs - cachedDet.timestamp < CACHE_TTL_MS) {
      return cachedDet.data;
    }
    const cachedBasic = basicMetricsCache.get(id);
    if (cachedBasic && nowMs - cachedBasic.timestamp < CACHE_TTL_MS) {
      return cachedBasic.data;
    }
  }

  try {
    const recentFixtures = await apiFootball.getTeamRecentFixtures(id, last).catch(() => []);
    if (!Array.isArray(recentFixtures) || recentFixtures.length === 0) {
      return null;
    }

    const validFixtures = recentFixtures.filter(
      (f) => typeof f.goals?.home === "number" && typeof f.goals?.away === "number"
    );
    if (validFixtures.length === 0) return null;

    const sampleSize = validFixtures.length;
    let goalsForSum = 0;
    let goalsAgainstSum = 0;
    let scoredCount = 0;
    let concededCount = 0;
    let bttsCount = 0;
    let over25Count = 0;
    let over15Count = 0;
    let winCount = 0;
    let unbeatenCount = 0;
    let lossCount = 0;
    let zeroZeroCount = 0;
    let failedToScoreCount = 0;

    for (const f of validFixtures) {
      const isHome = Number(f.teams?.home?.id) === id;
      const gf = isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0);
      const ga = isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0);
      const total = gf + ga;

      goalsForSum += gf;
      goalsAgainstSum += ga;

      if (gf >= 1) scoredCount++;
      else failedToScoreCount++;

      if (ga >= 1) concededCount++;
      if (gf >= 1 && ga >= 1) bttsCount++;
      if (total >= 3) over25Count++;
      if (total >= 2) over15Count++;
      if (total === 0) zeroZeroCount++;

      if (gf > ga) {
        winCount++;
        unbeatenCount++;
      } else if (gf === ga) {
        unbeatenCount++;
      } else {
        lossCount++;
      }
    }

    const metrics: RealTeamFormMetrics = {
      teamId: id,
      sampleSize,
      goalsForAvg: Math.round((goalsForSum / sampleSize) * 100) / 100,
      goalsAgainstAvg: Math.round((goalsAgainstSum / sampleSize) * 100) / 100,
      totalGoalsAvg: Math.round(((goalsForSum + goalsAgainstSum) / sampleSize) * 100) / 100,
      scoredRate: Math.round((scoredCount / sampleSize) * 100) / 100,
      concededRate: Math.round((concededCount / sampleSize) * 100) / 100,
      bttsRate: Math.round((bttsCount / sampleSize) * 100) / 100,
      over25Rate: Math.round((over25Count / sampleSize) * 100) / 100,
      over15Rate: Math.round((over15Count / sampleSize) * 100) / 100,
      winRate: Math.round((winCount / sampleSize) * 100) / 100,
      unbeatenRate: Math.round((unbeatenCount / sampleSize) * 100) / 100,
      lossRate: Math.round((lossCount / sampleSize) * 100) / 100,
      recentZeroZeroCount: zeroZeroCount,
      failedToScoreCount,
      detailedSampleSize: 0,
    };

    basicMetricsCache.set(id, { timestamp: nowMs, data: metrics });

    if (fetchDetailedStats) {
      // Sample up to 3 most recent fixtures for detailed Corners / Cards / Shots telemetry
      const statsFixtures = validFixtures.slice(0, 3);
      const statsResults = await Promise.all(
        statsFixtures.map((f) => apiFootball.getFixtureStatistics(f.fixture.id).catch(() => []))
      );

      let cornerMatches = 0;
      let cornersForSum = 0;
      let cornersAgainstSum = 0;
      let over85CornersHits = 0;

      let cardMatches = 0;
      let cardsForSum = 0;
      let cardsAgainstSum = 0;
      let over35CardsHits = 0;

      let shotMatches = 0;
      let sogForSum = 0;
      let sogAgainstSum = 0;
      let over75SogHits = 0;
      let over85SogHits = 0;
      let totalShotsForSum = 0;
      let totalShotsAgainstSum = 0;
      let over225ShotsHits = 0;

      for (let i = 0; i < statsFixtures.length; i++) {
        const fix = statsFixtures[i];
        const rawStats = statsResults[i];
        if (!Array.isArray(rawStats) || rawStats.length < 2) continue;

        const details = extractMatchDetails(rawStats);
        if (!details.hasStats) continue;

        const isHome = Number(fix.teams?.home?.id) === id;

        if (details.hasCornerStats && details.totalCorners > 0) {
          cornerMatches++;
          const cf = isHome ? details.homeCorners : details.awayCorners;
          const ca = isHome ? details.awayCorners : details.homeCorners;
          cornersForSum += cf;
          cornersAgainstSum += ca;
          if (details.totalCorners >= 9) over85CornersHits++;
        }

        if (details.totalCards > 0 || details.hasCornerStats) {
          cardMatches++;
          const homeCards = details.homeYellowCards + details.homeRedCards;
          const awayCards = details.awayYellowCards + details.awayRedCards;
          const crdF = isHome ? homeCards : awayCards;
          const crdA = isHome ? awayCards : homeCards;
          cardsForSum += crdF;
          cardsAgainstSum += crdA;
          if (details.totalCards >= 4) over35CardsHits++;
        }

        if (details.hasShotStats && (details.totalShotsOnGoal > 0 || details.totalShots > 0)) {
          shotMatches++;
          const sf = isHome ? details.homeShotsOnGoal : details.awayShotsOnGoal;
          const sa = isHome ? details.awayShotsOnGoal : details.homeShotsOnGoal;
          const tsf = isHome ? details.homeTotalShots : details.awayTotalShots;
          const tsa = isHome ? details.awayTotalShots : details.homeTotalShots;

          sogForSum += sf;
          sogAgainstSum += sa;
          if (details.totalShotsOnGoal >= 8) over75SogHits++;
          if (details.totalShotsOnGoal >= 9) over85SogHits++;

          totalShotsForSum += tsf;
          totalShotsAgainstSum += tsa;
          if (details.totalShots >= 23) over225ShotsHits++;
        }
      }

      metrics.detailedSampleSize = Math.max(cornerMatches, cardMatches, shotMatches);

      if (cornerMatches >= 2) {
        metrics.cornersForAvg = Math.round((cornersForSum / cornerMatches) * 100) / 100;
        metrics.cornersAgainstAvg = Math.round((cornersAgainstSum / cornerMatches) * 100) / 100;
        metrics.totalCornersAvg = Math.round(((cornersForSum + cornersAgainstSum) / cornerMatches) * 100) / 100;
        metrics.over85CornersRate = Math.round((over85CornersHits / cornerMatches) * 100) / 100;
      }

      if (cardMatches >= 2) {
        metrics.cardsForAvg = Math.round((cardsForSum / cardMatches) * 100) / 100;
        metrics.cardsAgainstAvg = Math.round((cardsAgainstSum / cardMatches) * 100) / 100;
        metrics.totalCardsAvg = Math.round(((cardsForSum + cardsAgainstSum) / cardMatches) * 100) / 100;
        metrics.over35CardsRate = Math.round((over35CardsHits / cardMatches) * 100) / 100;
      }

      if (shotMatches >= 2) {
        metrics.shotsOnGoalForAvg = Math.round((sogForSum / shotMatches) * 100) / 100;
        metrics.shotsOnGoalAgainstAvg = Math.round((sogAgainstSum / shotMatches) * 100) / 100;
        metrics.totalShotsOnGoalAvg = Math.round(((sogForSum + sogAgainstSum) / shotMatches) * 100) / 100;
        metrics.over75SogRate = Math.round((over75SogHits / shotMatches) * 100) / 100;
        metrics.over85SogRate = Math.round((over85SogHits / shotMatches) * 100) / 100;
        metrics.totalShotsForAvg = Math.round((totalShotsForSum / shotMatches) * 100) / 100;
        metrics.totalShotsAgainstAvg = Math.round((totalShotsAgainstSum / shotMatches) * 100) / 100;
        metrics.totalShotsAvg = Math.round(((totalShotsForSum + totalShotsAgainstSum) / shotMatches) * 100) / 100;
        metrics.over225ShotsRate = Math.round((over225ShotsHits / shotMatches) * 100) / 100;
      }

      detailedMetricsCache.set(id, { timestamp: nowMs, data: metrics });
    }

    return metrics;
  } catch {
    return null;
  }
}

/**
 * Enriches a match with both teams' real recent form and optional detailed statistics,
 * bounded by a strict timeout so it never blocks the server.
 */
export async function enrichMatchRealStats(
  homeTeamId?: number,
  awayTeamId?: number,
  fetchDetailedStats: boolean = false,
  timeoutMs: number = 4500
): Promise<MatchRealConvergenceContext> {
  if (!homeTeamId || !awayTeamId) {
    return { hasGoalsTelemetry: false, hasDetailedTelemetry: false };
  }

  try {
    const workPromise = Promise.all([
      getRealTeamFormMetrics(homeTeamId, 5, fetchDetailedStats),
      getRealTeamFormMetrics(awayTeamId, 5, fetchDetailedStats),
    ]);
    const timeoutPromise = new Promise<[null, null]>((resolve) =>
      setTimeout(() => resolve([null, null]), timeoutMs)
    );

    const [home, away] = await Promise.race([workPromise, timeoutPromise]);
    const hasGoalsTelemetry = Boolean(home && away && home.sampleSize >= 3 && away.sampleSize >= 3);
    const hasDetailedTelemetry = Boolean(
      home && away && home.detailedSampleSize >= 2 && away.detailedSampleSize >= 2
    );

    return {
      home,
      away,
      hasGoalsTelemetry,
      hasDetailedTelemetry,
    };
  } catch {
    return { hasGoalsTelemetry: false, hasDetailedTelemetry: false };
  }
}

/**
 * Computes a unified Quality Score (0-100) balancing:
 * - 40% Real Model Probability
 * - 30% Recent Consistency (4/5 rule)
 * - 20% Profitability / Expected Value (+EV in profitable odds range 1.50 - 1.95)
 * - 10% League Hierarchy & Data Quality
 */
export function calculateUnifiedQualityScore(params: {
  probability: number; // 0-100
  odds: number;
  edge: number; // percentage
  leagueTier?: number;
  consistencyRate?: number; // 0.0 to 1.0 (e.g. 0.80 = 4/5)
}): number {
  const { probability, odds, edge, leagueTier = 2, consistencyRate = 0.72 } = params;

  // 1. Probability component (max 40 pts, reaches 34+ pts at 72% prob)
  const probScore = Math.min(40, Math.max(0, (probability / 85) * 40));

  // 2. Consistency 4/5 component (max 30 pts)
  const consistencyScore = Math.min(30, Math.max(0, consistencyRate * 30));

  // 3. Profitability & Sweet-Spot Odds component (max 20 pts)
  // Highest reward for profitable commercial odds (1.50 - 1.92) with solid positive edge
  let oddsSweetSpotBonus = 0;
  if (odds >= 1.50 && odds <= 1.92) {
    oddsSweetSpotBonus = 12;
  } else if (odds >= 1.42 && odds < 1.50) {
    oddsSweetSpotBonus = 8;
  } else if (odds > 1.92 && odds <= 2.05) {
    oddsSweetSpotBonus = 6;
  } else {
    oddsSweetSpotBonus = 2;
  }
  const evBonus = Math.min(8, Math.max(0, edge * 1.2));
  const profitScore = Math.min(20, oddsSweetSpotBonus + evBonus);

  // 4. League Tier & Data Quality component (max 10 pts)
  const tierScore = leagueTier === 1 ? 10 : leagueTier === 2 ? 8 : leagueTier === 3 ? 6 : 3;

  return Math.round(probScore + consistencyScore + profitScore + tierScore);
}

