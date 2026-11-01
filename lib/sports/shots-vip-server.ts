import fs from "fs";
import path from "path";
import {
  applyTier4QuotaProtection,
  MarketOpportunity,
  isExcludedMatch,
  getCanonicalTeamKey,
  getTeamRating,
  isElitePick,
  normalizeLeagueInfo,
  sortByKickoff,
} from "./prediction-engine";
import {
  loadDailySnapshot,
  loadDailySnapshotAsync,
  saveDailySnapshotAsync,
  clearDailySnapshotAsync,
  settleActiveSnapshotWithRealScores,
  isYouthOrReserveFixture,
  getOpportunityKey,
  isCuratedLeague,
} from "./db";
import { apiFootball, extractMarketOddsFromBookmaker, ApiFootballOddsItem } from "./api-football";
import { auditPredictionsWithGeminiVeto } from "@/lib/ai/claude-analyst";
import {
  enrichMatchRealStats,
  MatchRealConvergenceContext,
  calculateUnifiedQualityScore,
} from "./team-stats-enricher";

function getEcuadorDateString(d: Date | number | string = Date.now()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d));
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

/**
 * Directorio de almacenamiento en disco para los snapshots de Disparos VIP.
 */
export function getShotsVipStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "daily_snapshots", "shots_vip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Carga el snapshot síncrono de Disparos VIP para una fecha determinada.
 */
export function loadShotsVipSnapshot(dateStr?: string): MarketOpportunity[] | null {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshot(targetDate, "shots_vip");
}

/**
 * Carga el snapshot asíncrono de Disparos VIP (disco + Supabase con sportKey = 'shots_vip').
 */
export async function loadShotsVipSnapshotAsync(dateStr?: string): Promise<MarketOpportunity[] | null> {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshotAsync(targetDate, "shots_vip");
}

/**
 * Elimina por completo el snapshot de Disparos VIP en memoria, disco y Supabase.
 */
export async function clearShotsVipSnapshotAsync(dateStr?: string): Promise<void> {
  const targetDate = dateStr || getEcuadorDateString();
  return clearDailySnapshotAsync(targetDate, "shots_vip");
}

/**
 * Guarda el snapshot de Disparos VIP garantizando aislamiento total frente a otros deportes y módulos.
 */
export async function saveShotsVipSnapshotAsync(
  dateStr: string,
  picks: MarketOpportunity[],
  overwrite = false
): Promise<MarketOpportunity[]> {
  const taggedPicks = picks.map((p) => {
    const isElite = isElitePick(p);
    const pickBadge = isElite
      ? "elite"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge)
        ? p.pickBadge
        : (p.edge || 0) >= 4.0
          ? "valor"
          : (p.odds || 0) >= 2.0
            ? "bomba"
            : "estandar");
    return {
      ...p,
      sport: "shots_vip" as any,
      source: "shots_vip" as const,
      isShotsVip: true,
      pickBadge,
      isElite,
      vipBadge: "Disparos VIP",
      confidence: (p.confidence as any) || (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : "Media"),
      isDestacado: p.probability >= 70,
      destacadoRule: "Alta de Disparos (≥ 70%)",
    };
  });
  return saveDailySnapshotAsync(dateStr, taggedPicks, "shots_vip", overwrite);
}

/**
 * Verifica si un fixture califica para el análisis de disparos (competiciones profesionales con telemetría de remates comprobada).
 */
function isSeniorCompetitiveShotsFixture(item: any): boolean {
  if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name || !item.fixture?.date) {
    return false;
  }

  const shortStatus = item.fixture.status?.short || "NS";
  if (["PST", "CANC", "ABD", "AWD", "WO", "POST"].includes(shortStatus)) return false;

  const legName = (item.league?.name || "").toLowerCase();
  const cName = (item.league?.country || "").toLowerCase();
  const hName = (item.teams.home.name || "").toLowerCase();
  const aName = (item.teams.away.name || "").toLowerCase();

  // Excluir ligas de bajo ritmo ofensivo o sin telemetría oficial de disparos
  if (
    cName.includes("japan") ||
    legName.includes("j1") ||
    legName.includes("j2") ||
    legName.includes("j3") ||
    cName.includes("new-zealand") ||
    cName.includes("zealand") ||
    legName.includes("second league") ||
    legName.includes("division a") ||
    legName.includes("division b") ||
    legName.includes("expansion") ||
    legName.includes("expansión") ||
    legName.includes("lowland")
  ) {
    return false;
  }

  // Excluir categorías formativas, filiales y ligas no profesionales
  if (
    legName.includes("primavera") ||
    legName.includes("u17") ||
    legName.includes("u18") ||
    legName.includes("u19") ||
    legName.includes("u20") ||
    legName.includes("u21") ||
    legName.includes("reserve") ||
    legName.includes("next pro") ||
    legName.includes("lowland") ||
    legName.includes("women") ||
    legName.includes("femen") ||
    hName.includes("women") ||
    aName.includes("women") ||
    hName.endsWith(" w") ||
    aName.endsWith(" w") ||
    hName.includes(" w ") ||
    aName.includes(" w ") ||
    hName.endsWith(" ii") ||
    hName.endsWith(" 2") ||
    aName.endsWith(" ii") ||
    aName.endsWith(" 2")
  ) {
    return false;
  }

  if (
    isYouthOrReserveFixture({
      leagueId: item.league?.id,
      leagueName: item.league?.name,
      homeTeam: item.teams.home.name,
      awayTeam: item.teams.away.name,
    })
  ) {
    return false;
  }

  if (isExcludedMatch(hName, aName)) return false;
  if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) return false;
  const norm = normalizeLeagueInfo(item.league?.name, item.league?.country, item.league?.id);
  if (norm.tier && norm.tier > 3) return false;

  return true;
}

/**
 * Función factorial para cálculo de Poisson.
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

/**
 * Probabilidad de Poisson acumulada P(X > k) = 1 - P(X <= k)
 */
function poissonOver(lambda: number, k: number): number {
  let cdf = 0;
  for (let i = 0; i <= k; i++) {
    cdf += (Math.pow(lambda, i) * Math.exp(-lambda)) / factorial(i);
  }
  return Math.max(0.01, Math.min(0.99, 1 - cdf));
}

/**
 * Evalúa las probabilidades cuantitativas de Disparos (Tiros a Puerta y Disparos Totales) para un fixture.
 * Pondera la tasa de la competición, la jerarquía ofensiva de los clubes y la expectativa combinada.
 */
export function evaluateFixtureShotsPrediction(params: {
  fixtureId: number | string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: number;
  awayTeamId?: number;
  homeLogo?: string;
  awayLogo?: string;
  league: string;
  leagueId?: number;
  country: string;
  leagueLogo?: string;
  kickoff: string;
  marketOdds?: ReturnType<typeof extractMarketOddsFromBookmaker>;
  realStats?: MatchRealConvergenceContext;
}): MarketOpportunity[] {
  const {
    fixtureId,
    homeTeam,
    awayTeam,
    homeLogo,
    awayLogo,
    league,
    leagueId,
    country,
    leagueLogo,
    kickoff,
    marketOdds,
    realStats,
  } = params;

  const norm = normalizeLeagueInfo(league, country, leagueId);
  const canonicalLeague = norm.canonicalLeague || league;
  const normCountry = norm.country || country;
  const tier = norm.tier || 3;

  const cLower = (normCountry || "").toLowerCase();
  const lLower = (canonicalLeague || "").toLowerCase();

  // Excluir ligas de ritmo lento / ultradefensivas para Disparos VIP
  if (
    lLower.includes("ligue 2") ||
    lLower.includes("serie b") ||
    lLower.includes("la liga 2") ||
    lLower.includes("segunda") ||
    lLower.includes("primera a")
  ) {
    return [];
  }

  // 1. Tasa base realista calibrada sin inflación artificial
  let baseSOG = 8.4;
  let baseTotalShots = 22.8;

  if (cLower.includes("england") || lLower.includes("premier")) {
    baseSOG = 9.2;
    baseTotalShots = 24.8;
  } else if (cLower.includes("germany") || lLower.includes("bundesliga")) {
    baseSOG = 9.3;
    baseTotalShots = 24.9;
  } else if (lLower.includes("champions") || lLower.includes("europa")) {
    baseSOG = 9.1;
    baseTotalShots = 24.5;
  } else if (cLower.includes("netherlands") || lLower.includes("eredivisie") || cLower.includes("belgium")) {
    baseSOG = 9.2;
    baseTotalShots = 24.6;
  } else if (cLower.includes("spain") || lLower.includes("laliga")) {
    baseSOG = 8.5;
    baseTotalShots = 23.2;
  } else if (cLower.includes("ital") || lLower.includes("serie a")) {
    baseSOG = 8.6;
    baseTotalShots = 23.4;
  } else if (cLower.includes("brazil")) {
    baseSOG = 8.8;
    baseTotalShots = 23.8;
  } else if (cLower.includes("argentina")) {
    baseSOG = 8.1;
    baseTotalShots = 22.2;
  }

  // 2. Factor ofensivo moderado y penalización por asimetría extrema (goleada temprana que mata el ritmo)
  const rHome = getTeamRating(homeTeam);
  const rAway = getTeamRating(awayTeam);
  const avgRating = (rHome + rAway) / 2;

  let qualityMultiplier = 1.0;
  if (avgRating >= 1830) {
    qualityMultiplier = 1.06;
  } else if (avgRating >= 1740) {
    qualityMultiplier = 1.03;
  } else if (avgRating < 1560) {
    qualityMultiplier = 0.90;
  }

  // Filtro táctico anti-posesión estéril: si hay súper favorito (< 1.30), suele anotar rápido y dormir el partido
  if ((marketOdds?.homeWin && marketOdds.homeWin < 1.30) || (marketOdds?.awayWin && marketOdds.awayWin < 1.30)) {
    qualityMultiplier *= 0.92;
  }

  const hCanon = getCanonicalTeamKey(homeTeam);
  const aCanon = getCanonicalTeamKey(awayTeam);

  const highVolumeTeams = [
    "manchestercity", "liverpool", "arsenal", "realmadrid", "barcelona",
    "bayernmunchen", "bayerleverkusen", "borussiadortmund", "psg",
    "inter", "atalanta", "napoli", "chelsea", "tottenham", "astonvilla"
  ];

  let volumeMultiplier = qualityMultiplier;
  if (highVolumeTeams.some((t) => hCanon.includes(t))) volumeMultiplier += 0.04;
  if (highVolumeTeams.some((t) => aCanon.includes(t))) volumeMultiplier += 0.03;

  let expectedSOG = baseSOG * volumeMultiplier;
  let expectedTotalShots = baseTotalShots * volumeMultiplier;
  let consistencyRate = 0.72;

  // 3. Convergencia Estadística Real de los últimos partidos de ambos equipos
  if (realStats?.home && realStats?.away) {
    const hStats = realStats.home;
    const aStats = realStats.away;

    // Veto inmediato si alguno de los dos equipos viene de >= 2 empates 0-0 recientes o nula producción ofensiva
    if (hStats.recentZeroZeroCount >= 2 || aStats.recentZeroZeroCount >= 2) {
      return [];
    }
    if (hStats.goalsForAvg < 0.85 && aStats.goalsForAvg < 0.85) {
      return [];
    }

    // A) Si tenemos telemetría real de disparos en sus últimos partidos
    if (
      typeof hStats.shotsOnGoalForAvg === "number" &&
      typeof aStats.shotsOnGoalForAvg === "number" &&
      typeof hStats.shotsOnGoalAgainstAvg === "number" &&
      typeof aStats.shotsOnGoalAgainstAvg === "number"
    ) {
      const realHomeSog = (hStats.shotsOnGoalForAvg + aStats.shotsOnGoalAgainstAvg) / 2;
      const realAwaySog = (aStats.shotsOnGoalForAvg + hStats.shotsOnGoalAgainstAvg) / 2;
      const realCombinedSog = realHomeSog + realAwaySog;

      // Veto de convergencia: Ambos equipos deben aportar volumen real al arco (mínimo 3.4 cada uno y 8.6 combinado)
      if (realCombinedSog < 8.4 || realHomeSog < 3.5 || realAwaySog < 3.2) {
        return [];
      }

      expectedSOG = 0.68 * realCombinedSog + 0.32 * expectedSOG;
      consistencyRate = ((hStats.over75SogRate ?? 0.75) + (aStats.over75SogRate ?? 0.75)) / 2;
    } else if (realStats.hasGoalsTelemetry) {
      // B) Ajuste por caudal real de goles recientes (correlación directa con volumen de remates)
      const combinedGoalsAvg = (hStats.totalGoalsAvg + aStats.totalGoalsAvg) / 2;
      if (combinedGoalsAvg < 2.2) {
        return [];
      }
      const goalsPaceFactor = Math.max(0.90, Math.min(1.12, combinedGoalsAvg / 2.75));
      expectedSOG *= goalsPaceFactor;
      expectedTotalShots *= goalsPaceFactor;
      consistencyRate = (hStats.over25Rate + aStats.over25Rate) / 2;
    }

    if (
      typeof hStats.totalShotsForAvg === "number" &&
      typeof aStats.totalShotsForAvg === "number" &&
      typeof hStats.totalShotsAgainstAvg === "number" &&
      typeof aStats.totalShotsAgainstAvg === "number"
    ) {
      const realHomeShots = (hStats.totalShotsForAvg + aStats.totalShotsAgainstAvg) / 2;
      const realAwayShots = (aStats.totalShotsForAvg + hStats.totalShotsAgainstAvg) / 2;
      const realCombinedShots = realHomeShots + realAwayShots;
      if (realCombinedShots < 22.0) {
        return [];
      }
      expectedTotalShots = 0.68 * realCombinedShots + 0.32 * expectedTotalShots;
    }
  }

  // Si no hay suficiente volumen proyectado real en el duelo, descartar
  if (expectedSOG < 8.8 && expectedTotalShots < 23.5) {
    return [];
  }

  // 4. Evaluar líneas comerciales reales de las casas de apuestas con colchón de seguridad estricto
  const candidateLines: Array<{
    type: "sog" | "total";
    line: number;
    threshold: number;
    selection: string;
    realOdd: number;
    lambda: number;
    minExpected: number;
    minProb: number;
  }> = [];

  // A) Procesar líneas reales de Tiros a Puerta (SOG: idealmente 7.5 y 8.5, máximo 9.5 si el volumen es altísimo)
  if (marketOdds?.shotsOnGoalLines && Object.keys(marketOdds.shotsOnGoalLines).length > 0) {
    for (const [lineStr, oddsObj] of Object.entries(marketOdds.shotsOnGoalLines)) {
      const lineNum = parseFloat(lineStr);
      // Descartar líneas extremas de alta varianza (> 9.5 tiros a puerta)
      if (lineNum > 9.5 || lineNum < 6.5) continue;
      if (oddsObj.over && oddsObj.over >= 1.42 && oddsObj.over <= 1.98) {
        candidateLines.push({
          type: "sog",
          line: lineNum,
          threshold: Math.floor(lineNum),
          selection: `Over ${lineNum} Tiros a Puerta`,
          realOdd: oddsObj.over,
          lambda: expectedSOG,
          // Colchón de seguridad real: exigir al menos +1.05 tiros esperados por encima de la línea
          minExpected: lineNum + 1.05,
          minProb: lineNum >= 9.5 ? 66.0 : 64.0,
        });
      }
    }
  } else {
    if (marketOdds?.shotsOnGoalOver75 && marketOdds.shotsOnGoalOver75 >= 1.42 && marketOdds.shotsOnGoalOver75 <= 1.98) {
      candidateLines.push({ type: "sog", line: 7.5, threshold: 7, selection: "Over 7.5 Tiros a Puerta", realOdd: marketOdds.shotsOnGoalOver75, lambda: expectedSOG, minExpected: 8.6, minProb: 65.0 });
    }
    if (marketOdds?.shotsOnGoalOver85 && marketOdds.shotsOnGoalOver85 >= 1.42 && marketOdds.shotsOnGoalOver85 <= 1.98) {
      candidateLines.push({ type: "sog", line: 8.5, threshold: 8, selection: "Over 8.5 Tiros a Puerta", realOdd: marketOdds.shotsOnGoalOver85, lambda: expectedSOG, minExpected: 9.6, minProb: 64.0 });
    }
    if (marketOdds?.shotsOnGoalOver95 && marketOdds.shotsOnGoalOver95 >= 1.48 && marketOdds.shotsOnGoalOver95 <= 1.95) {
      candidateLines.push({ type: "sog", line: 9.5, threshold: 9, selection: "Over 9.5 Tiros a Puerta", realOdd: marketOdds.shotsOnGoalOver95, lambda: expectedSOG, minExpected: 10.7, minProb: 66.0 });
    }
  }

  // B) Procesar líneas reales de Disparos Totales (máximo 25.5 con colchón real de +2.0 disparos)
  if (marketOdds?.totalShotsLines && Object.keys(marketOdds.totalShotsLines).length > 0) {
    for (const [lineStr, oddsObj] of Object.entries(marketOdds.totalShotsLines)) {
      const lineNum = parseFloat(lineStr);
      if (lineNum > 25.5 || lineNum < 19.5) continue;
      if (oddsObj.over && oddsObj.over >= 1.42 && oddsObj.over <= 1.98) {
        candidateLines.push({
          type: "total",
          line: lineNum,
          threshold: Math.floor(lineNum),
          selection: `Over ${lineNum} Disparos Totales`,
          realOdd: oddsObj.over,
          lambda: expectedTotalShots,
          minExpected: lineNum + 2.0,
          minProb: 64.0,
        });
      }
    }
  } else {
    if (marketOdds?.totalShotsOver215 && marketOdds.totalShotsOver215 >= 1.42 && marketOdds.totalShotsOver215 <= 1.98) {
      candidateLines.push({ type: "total", line: 21.5, threshold: 21, selection: "Over 21.5 Disparos Totales", realOdd: marketOdds.totalShotsOver215, lambda: expectedTotalShots, minExpected: 23.6, minProb: 65.0 });
    }
    if (marketOdds?.totalShotsOver235 && marketOdds.totalShotsOver235 >= 1.42 && marketOdds.totalShotsOver235 <= 1.98) {
      candidateLines.push({ type: "total", line: 23.5, threshold: 23, selection: "Over 23.5 Disparos Totales", realOdd: marketOdds.totalShotsOver235, lambda: expectedTotalShots, minExpected: 25.6, minProb: 64.0 });
    }
    if (marketOdds?.totalShotsOver255 && marketOdds.totalShotsOver255 >= 1.48 && marketOdds.totalShotsOver255 <= 1.95) {
      candidateLines.push({ type: "total", line: 25.5, threshold: 25, selection: "Over 25.5 Disparos Totales", realOdd: marketOdds.totalShotsOver255, lambda: expectedTotalShots, minExpected: 27.8, minProb: 66.0 });
    }
  }

  // REGLA ESTRICTA: Exclusivamente pronosticar en base a cuota original real de casas de apuestas
  if (candidateLines.length === 0) {
    return [];
  }

  const opportunities: MarketOpportunity[] = [];

  for (const c of candidateLines) {
    if (c.lambda < c.minExpected) continue;

    const rawProb = poissonOver(c.lambda, c.threshold);
    const probPercent = Math.round(rawProb * 1000) / 10;

    const minTierProb =
      tier === 1 ? 64.0 : tier === 2 ? 65.0 : tier === 3 ? 67.0 : 70.0;
    const effectiveMinProb = Math.max(c.minProb, minTierProb);
    if (probPercent < effectiveMinProb) continue;

    const fairOdds = Math.round((1 / rawProb) * 100) / 100;

    // Cuota auténtica real obligatoria en zona rentable (1.42 a 1.98)
    const effectiveOdds = c.realOdd;
    if (!effectiveOdds || effectiveOdds < 1.42 || effectiveOdds > 1.98) {
      continue;
    }

    const edge = Math.round(((effectiveOdds / fairOdds) - 1) * 1000) / 10;

    const minTierEdge =
      tier === 1 ? 2.0 : tier === 2 ? 2.5 : tier === 3 ? 3.5 : 4.5;
    if (edge < minTierEdge) {
      continue;
    }

    const qualityScore = calculateUnifiedQualityScore({
      probability: probPercent,
      odds: effectiveOdds,
      edge,
      leagueTier: tier,
      consistencyRate,
    });

    const confidence = (probPercent >= 70 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media";

    const oppBase: MarketOpportunity = {
      fixtureId,
      match: `${homeTeam} vs ${awayTeam}`,
      homeTeam,
      awayTeam,
      homeLogo,
      awayLogo,
      league: canonicalLeague,
      leagueId,
      leagueTier: tier,
      country: normCountry,
      leagueLogo,
      kickoff,
      market: "Disparos",
      selection: c.selection,
      pick: c.selection,
      odds: effectiveOdds,
      fairOdds,
      probability: probPercent,
      edge: Math.max(0.5, edge),
      expectedValue: Math.max(0.5, edge),
      confidence,
      smartScore: Math.min(99, Math.max(75, qualityScore)),
      status: "pending",
      explanation: `Convergencia ofensiva real de ${c.lambda.toFixed(1)} ${c.type === "sog" ? "tiros a puerta" : "disparos totales"
        } esperados (colchón +${(c.lambda - c.line).toFixed(1)} sobre línea ${c.line}) en ${canonicalLeague}. Cuota rentable @${effectiveOdds.toFixed(2)} con valor +${edge.toFixed(1)}%.`,
      isShotsVip: true,
      vipBadge: "Disparos VIP",
      isDestacado: probPercent >= 70,
      destacadoRule: "Alta de Disparos (≥ 70%)",
    };

    const isElite = isElitePick(oppBase);
    const pickBadge = isElite
      ? "elite"
      : edge >= 4.0 && probPercent >= 66
        ? "valor"
        : "estandar";

    opportunities.push({
      ...oppBase,
      isElite,
      pickBadge,
    });
  }

  return opportunities;
}

/**
 * Escanea y descubre nuevas oportunidades exclusivamente de DISPAROS (solo Over) para la jornada.
 */
export async function searchAndAddNewShotsVipAlerts(dateStr?: string, forceRefresh = false): Promise<{
  success: boolean;
  newAlerts: MarketOpportunity[];
  totalAlerts: number;
  predictions: MarketOpportunity[];
  message: string;
}> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  const targetDate = dateStr || todayDateStr;
  const isTargetToday = targetDate === todayDateStr;

  // 1. Auto-liquidar partidos finalizados previos
  await settleActiveSnapshotWithRealScores(targetDate, "shots_vip").catch(() => []);

  // 2. Cargar snapshot actual de Disparos VIP
  let existingSnapshot =
    (await loadDailySnapshotAsync(targetDate, "shots_vip")) ||
    loadDailySnapshot(targetDate, "shots_vip") ||
    [];

  const existingMatchKeys = new Set(
    existingSnapshot.map((p) => {
      const h = getCanonicalTeamKey(p.homeTeam);
      const a = getCanonicalTeamKey(p.awayTeam);
      return `${h}-${a}`;
    })
  );
  const existingFixIds = new Set(
    existingSnapshot.map((p) => Number(p.fixtureId)).filter(Boolean)
  );

  // 3. Consultar partidos de hoy y cuotas oficiales de casas de apuestas
  const [fixtures, oddsList] = await Promise.all([
    apiFootball.getFixturesByDate(targetDate, "America/Guayaquil", forceRefresh).catch(() => []),
    apiFootball.getOddsByDate(targetDate, "America/Guayaquil", forceRefresh).catch(() => [] as ApiFootballOddsItem[]),
  ]);

  const candidateFixtures = Array.isArray(fixtures) ? fixtures : [];
  const allOdds = Array.isArray(oddsList) ? oddsList : [];

  const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
  for (const item of allOdds) {
    if (item.fixture?.id) {
      oddsMapByFixture[item.fixture.id] = item;
    }
  }

  // Identificar candidatos prioritarios competitivos que no tengan cuotas en el lote masivo
  const candidatesNeedingOdds = candidateFixtures.filter((item) => {
    if (!isSeniorCompetitiveShotsFixture(item)) return false;
    const kickoffMs = new Date(item.fixture.date).getTime();
    const shortStatus = item.fixture.status?.short || "NS";
    if (isTargetToday && existingSnapshot.length >= 10) {
      if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP", "FT", "AET", "PEN"].includes(shortStatus)) return false;
      if (kickoffMs <= nowMs) return false;
    }
    const hNorm = getCanonicalTeamKey(item.teams.home.name);
    const aNorm = getCanonicalTeamKey(item.teams.away.name);
    const matchKey = `${hNorm}-${aNorm}`;
    const fixId = Number(item.fixture.id);
    if (existingMatchKeys.has(matchKey) || (fixId && existingFixIds.has(fixId))) return false;
    return !oddsMapByFixture[item.fixture.id];
  });

  if (candidatesNeedingOdds.length > 0) {
    // Priorizar ligas de mayor jerarquía (Tier 1 > Tier 2 > Tier 3)
    candidatesNeedingOdds.sort((a, b) => {
      const aTier = normalizeLeagueInfo(a.league.name, a.league.country, a.league.id).tier;
      const bTier = normalizeLeagueInfo(b.league.name, b.league.country, b.league.id).tier;
      return aTier - bTier;
    });

    const toEnrich = candidatesNeedingOdds.slice(0, 6);
    const enrichedResults = await Promise.all(
      toEnrich.map((item) => apiFootball.getOddsByFixture(item.fixture.id).catch(() => null))
    );
    for (const res of enrichedResults) {
      if (res && res.fixture?.id) {
        oddsMapByFixture[res.fixture.id] = res;
      }
    }
  }

  const newlyFoundAlerts: MarketOpportunity[] = [];
  const usedTeams = new Set<string>();
  let enrichedShotsCount = 0;

  for (const item of candidateFixtures) {
    if (!isSeniorCompetitiveShotsFixture(item)) continue;

    const kickoffMs = new Date(item.fixture.date).getTime();
    const shortStatus = item.fixture.status?.short || "NS";

    // Solo saltar partidos iniciados/finalizados de hoy cuando ya existe una cartelera completa (>= 10 alertas)
    if (isTargetToday && existingSnapshot.length >= 10) {
      if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP", "FT", "AET", "PEN"].includes(shortStatus)) {
        continue;
      }
      if (kickoffMs <= nowMs) continue;
    }

    const hNorm = getCanonicalTeamKey(item.teams.home.name);
    const aNorm = getCanonicalTeamKey(item.teams.away.name);
    const matchKey = `${hNorm}-${aNorm}`;
    const fixId = Number(item.fixture.id);

    if (existingMatchKeys.has(matchKey) || (fixId && existingFixIds.has(fixId))) {
      continue;
    }
    if (usedTeams.has(hNorm) || usedTeams.has(aNorm)) {
      continue;
    }

    const realOddsItem = oddsMapByFixture[item.fixture.id];
    if (!realOddsItem) continue;
    const realMarketOdds = extractMarketOddsFromBookmaker(realOddsItem);
    const hasShotOdds = Boolean(
      (realMarketOdds.shotsOnGoalLines && Object.keys(realMarketOdds.shotsOnGoalLines).length > 0) ||
      (realMarketOdds.totalShotsLines && Object.keys(realMarketOdds.totalShotsLines).length > 0) ||
      realMarketOdds.shotsOnGoalOver75 ||
      realMarketOdds.shotsOnGoalOver85 ||
      realMarketOdds.shotsOnGoalOver95 ||
      realMarketOdds.totalShotsOver215 ||
      realMarketOdds.totalShotsOver235 ||
      realMarketOdds.totalShotsOver255
    );
    if (!hasShotOdds) continue;

    let realStats: MatchRealConvergenceContext | undefined = undefined;
    if (enrichedShotsCount < 10 && item.teams.home.id && item.teams.away.id) {
      enrichedShotsCount++;
      realStats = await enrichMatchRealStats(item.teams.home.id, item.teams.away.id, false, 3000).catch(() => undefined);
    }

    const shotOpps = evaluateFixtureShotsPrediction({
      fixtureId: item.fixture.id,
      homeTeam: item.teams.home.name,
      awayTeam: item.teams.away.name,
      homeTeamId: item.teams.home.id,
      awayTeamId: item.teams.away.id,
      homeLogo: item.teams.home.logo,
      awayLogo: item.teams.away.logo,
      league: item.league.name,
      leagueId: item.league.id,
      country: item.league.country,
      leagueLogo: item.league.logo,
      kickoff: item.fixture.date,
      marketOdds: realMarketOdds,
      realStats,
    });

    // Filtrar estrictamente solo oportunidades de disparos en modalidad OVER (no Under) con cuota rentable
    const validOpps = shotOpps.filter((p) => {
      const isShot =
        p.market === "Disparos" ||
        (p.selection || "").toLowerCase().includes("disparo") ||
        (p.selection || "").toLowerCase().includes("tiro");
      const selLower = (p.selection || "").toLowerCase();
      const isUnder = selLower.includes("under") || selLower.includes("menos") || selLower.includes("baja");
      const isOver = selLower.includes("over") || selLower.includes("más") || selLower.includes("+");
      const tier = p.leagueTier || 3;
      const minTierProb = tier === 1 ? 64.0 : tier === 2 ? 65.0 : tier === 3 ? 67.0 : 70.0;
      return isShot && !isUnder && isOver && p.probability >= minTierProb && p.odds >= 1.42 && p.odds <= 1.98;
    });

    if (validOpps.length > 0) {
      // Elegir la opción de mayor jerarquía de liga, probabilidad y mejor edge
      validOpps.sort((a, b) => {
        const aTier = a.leagueTier || 3;
        const bTier = b.leagueTier || 3;
        if (aTier !== bTier) return aTier - bTier;
        if (a.isElite !== b.isElite) return a.isElite ? -1 : 1;
        if (b.probability !== a.probability) return b.probability - a.probability;
        return (b.edge || 0) - (a.edge || 0);
      });
      const bestShot = validOpps[0];

      const isElite = isElitePick(bestShot);
      const pickBadge = isElite
        ? "elite"
        : (bestShot.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(bestShot.pickBadge)
          ? bestShot.pickBadge
          : (bestShot.edge || 0) >= 4.0
            ? "valor"
            : (bestShot.odds || 0) >= 2.0
              ? "bomba"
              : "estandar");

      const isInPlay = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(shortStatus);
      const isFinished = ["FT", "AET", "PEN"].includes(shortStatus);
      const liveOrFtScore = (isInPlay || isFinished) && typeof item.goals?.home === "number" && typeof item.goals?.away === "number"
        ? `${item.goals.home} - ${item.goals.away}`
        : undefined;

      const taggedPick: MarketOpportunity = {
        ...bestShot,
        sport: "shots_vip" as any,
        source: "shots_vip",
        isShotsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Disparos VIP",
        status: isInPlay ? "in_play" : "pending",
        matchTiming: isFinished ? "finished" : isInPlay ? "live" : "prematch",
        currentScore: liveOrFtScore,
        confidence: (bestShot.probability >= 70 ? "Muy Alta" : bestShot.probability >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media",
        isDestacado: bestShot.probability >= 70,
        destacadoRule: "Alta de Disparos (≥ 70%)",
        isNewlyDiscovered: !isFinished && !isInPlay,
        addedAt: new Date().toISOString(),
      };

      newlyFoundAlerts.push(taggedPick);
      usedTeams.add(hNorm);
      usedTeams.add(aNorm);
    }
  }

  // Ordenar todos los candidatos descubiertos según la jerarquía estricta:
  // Tier de Liga (T1 > T2 > T3 > T4) > Badge (Élite > Destacado > Valor > Bomba > Estándar) > Probabilidad > Edge
  newlyFoundAlerts.sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;

    const aRank = a.isElite ? 1 : a.isDestacado ? 2 : a.pickBadge === "valor" ? 3 : a.pickBadge === "bomba" ? 4 : 5;
    const bRank = b.isElite ? 1 : b.isDestacado ? 2 : b.pickBadge === "valor" ? 3 : b.pickBadge === "bomba" ? 4 : 5;
    if (aRank !== bRank) return aRank - bRank;

    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.edge || 0) - (a.edge || 0);
  });

  // REGLA DE CALIDAD PURA SIN FORZAR CANTIDAD:
  // Evaluar todos los candidatos genuinos calificados por Tier de Liga y respetar estrictamente el Veto de IA.
  const candidatesToAudit = newlyFoundAlerts;

  // 4. Auditoría con Agente IA Google Gemini ("Abogado del Diablo" / Veto Táctico)
  let approvedNewAlerts = candidatesToAudit;
  if (candidatesToAudit.length > 0) {
    try {
      const vetoResult = await auditPredictionsWithGeminiVeto(candidatesToAudit, "football");
      if (vetoResult?.approvedPicks && vetoResult.approvedPicks.length > 0) {
        approvedNewAlerts = vetoResult.approvedPicks;
      }
    } catch (vetoErr) {
      console.warn("[Shots VIP] Gemini Veto audit warning:", vetoErr);
    }
  }

  // 5. Fusionar nuevas alertas con el snapshot existente
  const mergedMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    const isSettledOrInPlay = p.status === "won" || p.status === "lost" || p.status === "in_play" || (p as any).result === "WON" || (p as any).result === "LOST" || Boolean(p.actualScore) || Boolean(p.currentScore) || p.matchTiming === "live" || p.matchTiming === "finished";
    if (!isSettledOrInPlay && !isCuratedLeague(p.leagueId, p.league, p.country)) continue;
    const isElite = isElitePick(p);
    const pickBadge = isElite
      ? "elite"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge)
        ? p.pickBadge
        : (p.edge || 0) >= 4.0
          ? "valor"
          : (p.odds || 0) >= 2.0
            ? "bomba"
            : "estandar");
    mergedMap.set(getOpportunityKey(p), {
      ...p,
      isShotsVip: true,
      source: "shots_vip",
      pickBadge,
      isElite,
      vipBadge: "Disparos VIP",
    });
  }

  for (const np of approvedNewAlerts) {
    const key = getOpportunityKey(np);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, np);
    }
  }

  // 1) Ordenar candidatos por jerarquía estricta de calidad: Tier de Liga > Badge > Probabilidad > Edge
  const rankedPicks = Array.from(mergedMap.values()).sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;

    const aRank = a.isElite ? 1 : a.isDestacado ? 2 : a.pickBadge === "valor" ? 3 : a.pickBadge === "bomba" ? 4 : 5;
    const bRank = b.isElite ? 1 : b.isDestacado ? 2 : b.pickBadge === "valor" ? 3 : b.pickBadge === "bomba" ? 4 : 5;
    if (aRank !== bRank) return aRank - bRank;

    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.edge || 0) - (a.edge || 0);
  });

  // 2) Aplicar protección de cuota Tier 4 sin forzar ni recortar artificialmente la cantidad de alertas de alta calidad
  const curatedPicks = applyTier4QuotaProtection(rankedPicks, 2);

  // 3) Ordenar por horario de inicio (kickoff)
  let finalPicks = sortByKickoff(curatedPicks, "asc");

  // Asegurar auditoría en selecciones previas que aún no tengan nota de IA
  const unaudited = finalPicks.filter(
    (p) => !p.explanation?.includes("Auditoría") && !p.explanation?.includes("VETO")
  );
  if (unaudited.length > 0) {
    try {
      const batchResult = await auditPredictionsWithGeminiVeto(unaudited, "football");
      if (batchResult?.approvedPicks && batchResult.approvedPicks.length > 0) {
        const auditMap = new Map(batchResult.approvedPicks.map((p) => [getOpportunityKey(p), p]));
        for (let i = 0; i < finalPicks.length; i++) {
          const key = getOpportunityKey(finalPicks[i]);
          const audited = auditMap.get(key);
          if (audited) {
            finalPicks[i] = {
              ...finalPicks[i],
              explanation: audited.explanation,
              confidence: audited.confidence || finalPicks[i].confidence,
            };
          }
        }
      }
    } catch (auditErr) {
      console.warn("[Shots VIP] Gemini Veto audit on existing picks warning:", auditErr);
    }
  }

  // 6. Guardar en disco y Supabase y liquidar estados en vivo/finalizados
  await saveShotsVipSnapshotAsync(targetDate, finalPicks, false);

  const settledAfterSave = await settleActiveSnapshotWithRealScores(targetDate, "shots_vip").catch(() => []);
  if (settledAfterSave && settledAfterSave.length > 0) {
    finalPicks = settledAfterSave;
  }

  return {
    success: true,
    newAlerts: approvedNewAlerts,
    totalAlerts: finalPicks.length,
    predictions: finalPicks,
    message:
      approvedNewAlerts.length > 0
        ? existingSnapshot.length === 0
          ? `✓ Se generó la cartelera inicial de Disparos VIP con ${approvedNewAlerts.length} pronósticos de alta jerarquía.`
          : `✓ Se agregaron ${approvedNewAlerts.length} nuevas alertas a Disparos VIP (Total: ${finalPicks.length}).`
        : `✓ Panel de Disparos VIP al día (${finalPicks.length} alertas auditadas disponibles).`,
  };
}

/**
 * Obtiene la cartelera de Disparos VIP para una fecha dada (auto-iniciando si el snapshot está vacío).
 */
export async function getShotsVipSlate(dateStr?: string, forceRefresh = false): Promise<{
  date: string;
  count: number;
  predictions: MarketOpportunity[];
  stats: {
    total: number;
    pending: number;
    won: number;
    lost: number;
    winRate?: number;
    avgProb: number;
    avgOdds: number;
  };
}> {
  const todayDateStr = getEcuadorDateString();
  const targetDate = dateStr || todayDateStr;
  const isTargetToday = targetDate === todayDateStr;

  // 1. Cargar snapshot
  let picks =
    (await loadDailySnapshotAsync(targetDate, "shots_vip")) ||
    loadDailySnapshot(targetDate, "shots_vip") ||
    [];

  // 2. Auto-liquidar partidos finalizados y actualizar marcadores en vivo en caliente
  const settledPicks = await settleActiveSnapshotWithRealScores(targetDate, "shots_vip").catch(() => []);
  if (settledPicks && settledPicks.length > 0) {
    picks = settledPicks;
  }

  // 3. Generación inicial si no existe snapshot o forzar refresco
  if (picks.length === 0 || forceRefresh) {
    const searchRes = await searchAndAddNewShotsVipAlerts(targetDate, forceRefresh).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente disparos en modalidad OVER (estrictamente no under) y asegurar banderas VIP
  const sanitizedPicks = picks
    .filter((p) => {
      const isSettledOrInPlay = p.status === "won" || p.status === "lost" || p.status === "in_play" || (p as any).result === "WON" || (p as any).result === "LOST" || p.matchTiming === "live" || p.matchTiming === "finished" || Boolean(p.actualScore) || Boolean(p.currentScore);
      if (isSettledOrInPlay) return true;
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) return false;
      const isShot =
        p.market === "Disparos" ||
        (p.selection || "").toLowerCase().includes("disparo") ||
        (p.selection || "").toLowerCase().includes("tiro");
      const selLower = (p.selection || "").toLowerCase();
      const mktLower = (p.market || "").toLowerCase();
      const isUnder =
        selLower.includes("under") ||
        selLower.includes("menos") ||
        selLower.includes("baja") ||
        mktLower.includes("under") ||
        mktLower.includes("menos") ||
        mktLower.includes("baja");
      const isOver =
        selLower.includes("over") ||
        selLower.includes("más") ||
        selLower.includes("+") ||
        mktLower.includes("over") ||
        mktLower.includes("alta");
      return isShot && !isUnder && isOver;
    })
    .map((p) => {
      const isElite = isElitePick(p);
      const pickBadge = isElite
        ? "elite"
        : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge)
          ? p.pickBadge
          : (p.edge || 0) >= 4.0
            ? "valor"
            : (p.odds || 0) >= 2.0
              ? "bomba"
              : "estandar");

      return {
        ...p,
        sport: "shots_vip" as any,
        source: "shots_vip" as const,
        isShotsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Disparos VIP",
        confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media",
        isDestacado: p.probability >= 70,
        destacadoRule: "Alta de Disparos (≥ 70%)",
      };
    })
    .sort((a, b) => {
      const timeA = a.kickoff ? new Date(a.kickoff).getTime() : Infinity;
      const timeB = b.kickoff ? new Date(b.kickoff).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;
      if (b.probability !== a.probability) return b.probability - a.probability;
      return (b.edge || 0) - (a.edge || 0);
    });

  // Retener todas las alertas válidas y partidos finalizados
  const curatedPicks = sanitizedPicks;

  const finalSlate = sortByKickoff(curatedPicks, "asc");

  const total = finalSlate.length;
  const won = finalSlate.filter((p) => p.status === "won" || (p as any).result === "WON").length;
  const lost = finalSlate.filter((p) => p.status === "lost" || (p as any).result === "LOST").length;
  const settled = won + lost;
  const pending = total - settled;
  const winRate = settled > 0 ? Math.round((won / settled) * 100) : 0;
  const avgProb = total > 0 ? Math.round((finalSlate.reduce((acc, p) => acc + (p.probability || 0), 0) / total) * 10) / 10 : 0;
  const avgOdds = total > 0 ? Math.round((finalSlate.reduce((acc, p) => acc + (p.odds || 0), 0) / total) * 100) / 100 : 0;

  return {
    date: targetDate,
    count: total,
    predictions: finalSlate,
    stats: {
      total,
      pending,
      won,
      lost,
      winRate,
      avgProb,
      avgOdds,
    },
  };
}

