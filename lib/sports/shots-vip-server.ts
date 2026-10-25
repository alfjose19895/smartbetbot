import fs from "fs";
import path from "path";
import {
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
  } = params;

  const norm = normalizeLeagueInfo(league, country, leagueId);
  const canonicalLeague = norm.canonicalLeague || league;
  const normCountry = norm.country || country;
  const tier = norm.tier || 3;

  const cLower = (normCountry || "").toLowerCase();
  const lLower = (canonicalLeague || "").toLowerCase();

  // 1. Tasa base calibrada por liga/país para Tiros al Arco (SOG) y Disparos Totales
  let baseSOG = 8.6;
  let baseTotalShots = 22.8;

  if (cLower.includes("england") || lLower.includes("premier")) {
    baseSOG = 9.8;
    baseTotalShots = 25.5;
  } else if (cLower.includes("germany") || lLower.includes("bundesliga")) {
    baseSOG = 9.6;
    baseTotalShots = 25.0;
  } else if (lLower.includes("champions") || lLower.includes("europa") || lLower.includes("libertadores")) {
    baseSOG = 9.5;
    baseTotalShots = 24.8;
  } else if (cLower.includes("spain") || lLower.includes("laliga")) {
    baseSOG = 8.8;
    baseTotalShots = 23.4;
  } else if (cLower.includes("ital") || lLower.includes("serie a")) {
    baseSOG = 8.9;
    baseTotalShots = 23.6;
  } else if (cLower.includes("argentina") || cLower.includes("brazil")) {
    baseSOG = 9.0;
    baseTotalShots = 23.8;
  } else if (cLower.includes("netherlands") || lLower.includes("eredivisie") || cLower.includes("belgium")) {
    baseSOG = 9.4;
    baseTotalShots = 24.5;
  }

  // 2. Factor ofensivo dinámico basado en ratings ELO y clubes de alto volumen
  const rHome = getTeamRating(homeTeam);
  const rAway = getTeamRating(awayTeam);
  const avgRating = (rHome + rAway) / 2;

  let qualityMultiplier = 1.0;
  if (avgRating >= 1830) {
    qualityMultiplier = 1.14; // Élite europea ofensiva
  } else if (avgRating >= 1740) {
    qualityMultiplier = 1.07; // Ritmo competitivo alto
  } else if (avgRating < 1560) {
    qualityMultiplier = 0.88; // Clubes de bajo promedio ofensivo / ligas menores
  }

  const hCanon = getCanonicalTeamKey(homeTeam);
  const aCanon = getCanonicalTeamKey(awayTeam);

  const highVolumeTeams = [
    "manchestercity", "liverpool", "arsenal", "realmadrid", "barcelona",
    "bayernmunchen", "bayerleverkusen", "borussiadortmund", "psg",
    "inter", "atalanta", "napoli", "juventus", "riverplate", "bocajuniors",
    "flamengo", "palmeiras", "chelsea", "tottenham", "astonvilla"
  ];

  let volumeMultiplier = qualityMultiplier;
  if (highVolumeTeams.some((t) => hCanon.includes(t))) volumeMultiplier += 0.08;
  if (highVolumeTeams.some((t) => aCanon.includes(t))) volumeMultiplier += 0.05;

  const expectedSOG = baseSOG * volumeMultiplier;
  const expectedTotalShots = baseTotalShots * volumeMultiplier;

  // Si no hay suficiente volumen proyectado en el duelo, descartar
  if (expectedSOG < 8.2 && expectedTotalShots < 22.5) {
    return [];
  }

  // 3. Evaluar líneas reales proporcionadas por las casas de apuestas (Tiros a Puerta y Disparos Totales)
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

  // A) Procesar líneas reales de Tiros a Puerta (SOG)
  if (marketOdds?.shotsOnGoalLines && Object.keys(marketOdds.shotsOnGoalLines).length > 0) {
    for (const [lineStr, oddsObj] of Object.entries(marketOdds.shotsOnGoalLines)) {
      const lineNum = parseFloat(lineStr);
      if (oddsObj.over && oddsObj.over >= 1.25 && oddsObj.over <= 2.25) {
        candidateLines.push({
          type: "sog",
          line: lineNum,
          threshold: Math.floor(lineNum),
          selection: `Over ${lineNum} Tiros a Puerta`,
          realOdd: oddsObj.over,
          lambda: expectedSOG,
          minExpected: lineNum * 0.90,
          minProb: 55.0,
        });
      }
    }
  } else {
    // Compatibilidad con cuotas directas legacy
    if (marketOdds?.shotsOnGoalOver75 && marketOdds.shotsOnGoalOver75 >= 1.25 && marketOdds.shotsOnGoalOver75 <= 2.25) {
      candidateLines.push({ type: "sog", line: 7.5, threshold: 7, selection: "Over 7.5 Tiros a Puerta", realOdd: marketOdds.shotsOnGoalOver75, lambda: expectedSOG, minExpected: 6.8, minProb: 62.0 });
    }
    if (marketOdds?.shotsOnGoalOver85 && marketOdds.shotsOnGoalOver85 >= 1.25 && marketOdds.shotsOnGoalOver85 <= 2.25) {
      candidateLines.push({ type: "sog", line: 8.5, threshold: 8, selection: "Over 8.5 Tiros a Puerta", realOdd: marketOdds.shotsOnGoalOver85, lambda: expectedSOG, minExpected: 7.7, minProb: 58.0 });
    }
    if (marketOdds?.shotsOnGoalOver95 && marketOdds.shotsOnGoalOver95 >= 1.25 && marketOdds.shotsOnGoalOver95 <= 2.25) {
      candidateLines.push({ type: "sog", line: 9.5, threshold: 9, selection: "Over 9.5 Tiros a Puerta", realOdd: marketOdds.shotsOnGoalOver95, lambda: expectedSOG, minExpected: 8.6, minProb: 55.0 });
    }
  }

  // B) Procesar líneas reales de Disparos Totales
  if (marketOdds?.totalShotsLines && Object.keys(marketOdds.totalShotsLines).length > 0) {
    for (const [lineStr, oddsObj] of Object.entries(marketOdds.totalShotsLines)) {
      const lineNum = parseFloat(lineStr);
      if (oddsObj.over && oddsObj.over >= 1.25 && oddsObj.over <= 2.25) {
        candidateLines.push({
          type: "total",
          line: lineNum,
          threshold: Math.floor(lineNum),
          selection: `Over ${lineNum} Disparos Totales`,
          realOdd: oddsObj.over,
          lambda: expectedTotalShots,
          minExpected: lineNum * 0.88,
          minProb: 55.0,
        });
      }
    }
  } else {
    // Compatibilidad con cuotas directas legacy
    if (marketOdds?.totalShotsOver215 && marketOdds.totalShotsOver215 >= 1.25 && marketOdds.totalShotsOver215 <= 2.25) {
      candidateLines.push({ type: "total", line: 21.5, threshold: 21, selection: "Over 21.5 Disparos Totales", realOdd: marketOdds.totalShotsOver215, lambda: expectedTotalShots, minExpected: 19.0, minProb: 65.0 });
    }
    if (marketOdds?.totalShotsOver235 && marketOdds.totalShotsOver235 >= 1.25 && marketOdds.totalShotsOver235 <= 2.25) {
      candidateLines.push({ type: "total", line: 23.5, threshold: 23, selection: "Over 23.5 Disparos Totales", realOdd: marketOdds.totalShotsOver235, lambda: expectedTotalShots, minExpected: 21.0, minProb: 60.0 });
    }
    if (marketOdds?.totalShotsOver255 && marketOdds.totalShotsOver255 >= 1.25 && marketOdds.totalShotsOver255 <= 2.25) {
      candidateLines.push({ type: "total", line: 25.5, threshold: 25, selection: "Over 25.5 Disparos Totales", realOdd: marketOdds.totalShotsOver255, lambda: expectedTotalShots, minExpected: 23.0, minProb: 55.0 });
    }
  }

  // REGLA ESTRICTA: Exclusivamente pronosticar en base a cuota original real de casas de apuestas
  // Queda estrictamente prohibido inventar cuotas artificiales o forzar rangos arbitrarios fijos
  if (candidateLines.length === 0) {
    return [];
  }

  const opportunities: MarketOpportunity[] = [];

  for (const c of candidateLines) {
    if (c.lambda < c.minExpected) continue;

    const rawProb = poissonOver(c.lambda, c.threshold);
    const probPercent = Math.round(rawProb * 1000) / 10;

    const minTierProb =
      tier === 1 ? 58.0 : tier === 2 ? 60.0 : tier === 3 ? 64.0 : 68.0;
    const effectiveMinProb = Math.max(c.minProb, minTierProb);
    if (probPercent < effectiveMinProb) continue;

    const fairOdds = Math.round((1 / rawProb) * 100) / 100;

    // Cuota auténtica real obligatoria de la casa de apuestas
    const effectiveOdds = c.realOdd;
    if (!effectiveOdds || effectiveOdds < 1.25 || effectiveOdds > 2.05) {
      continue;
    }

    const edge = Math.round(((effectiveOdds / fairOdds) - 1) * 1000) / 10;

    // Si la cuota de la casa representa un subpago severo (-EV > -5%), descartar
    if (edge < -5.0) {
      continue;
    }

    const minTierEdge =
      tier === 1 ? 1.5 : tier === 2 ? 2.0 : tier === 3 ? 2.5 : 3.5;
    if (edge < minTierEdge) {
      continue;
    }

    const confidence = (probPercent >= 70 ? "Muy Alta" : probPercent >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media";

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
      odds: effectiveOdds,
      fairOdds,
      probability: probPercent,
      edge: Math.max(0.5, edge),
      expectedValue: Math.max(0.5, edge),
      confidence,
      smartScore: Math.min(99, Math.round(probPercent * 1.08 + (c.type === "sog" ? 6 : 2))),
      status: "pending",
      explanation: `Proyección ofensiva calibrada de ${c.lambda.toFixed(1)} ${
        c.type === "sog" ? "tiros a puerta" : "disparos totales"
      } en ${canonicalLeague} (Tier ${tier}). Ritmo dinámico de llegadas.`,
      isShotsVip: true,
      vipBadge: "Disparos VIP",
      isDestacado: probPercent >= 70,
      destacadoRule: "Alta de Disparos (≥ 70%)",
    };

    const isElite = isElitePick(oppBase);
    const pickBadge = isElite
      ? "elite"
      : edge >= 5.0 && probPercent >= 65
      ? "valor"
      : effectiveOdds >= 2.0
      ? "bomba"
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
export async function searchAndAddNewShotsVipAlerts(dateStr?: string): Promise<{
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
    apiFootball.getFixturesByDate(targetDate, "America/Guayaquil").catch(() => []),
    apiFootball.getOddsByDate(targetDate, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]),
  ]);

  const candidateFixtures = Array.isArray(fixtures) ? fixtures : [];
  const allOdds = Array.isArray(oddsList) ? oddsList : [];

  const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
  for (const item of allOdds) {
    if (item.fixture?.id) {
      oddsMapByFixture[item.fixture.id] = item;
    }
  }

  const newlyFoundAlerts: MarketOpportunity[] = [];
  const usedTeams = new Set<string>();

  for (const item of candidateFixtures) {
    if (!isSeniorCompetitiveShotsFixture(item)) continue;

    const kickoffMs = new Date(item.fixture.date).getTime();
    const shortStatus = item.fixture.status?.short || "NS";

    // Solo evaluar partidos pendientes en el futuro próximo si es la fecha de hoy
    if (isTargetToday) {
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
    const realMarketOdds = extractMarketOddsFromBookmaker(realOddsItem);

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
    });

    // Filtrar estrictamente solo oportunidades de disparos en modalidad OVER (no Under)
    const validOpps = shotOpps.filter((p) => {
      const isShot =
        p.market === "Disparos" ||
        (p.selection || "").toLowerCase().includes("disparo") ||
        (p.selection || "").toLowerCase().includes("tiro");
      const selLower = (p.selection || "").toLowerCase();
      const isUnder = selLower.includes("under") || selLower.includes("menos") || selLower.includes("baja");
      const isOver = selLower.includes("over") || selLower.includes("más") || selLower.includes("+");
      const tier = p.leagueTier || 3;
      const minTierProb = tier === 1 ? 62.0 : tier === 2 ? 64.0 : tier === 3 ? 68.0 : 72.0;
      return isShot && !isUnder && isOver && p.probability >= minTierProb && p.odds >= 1.25 && p.odds <= 2.05;
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

      const taggedPick: MarketOpportunity = {
        ...bestShot,
        sport: "shots_vip" as any,
        source: "shots_vip",
        isShotsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Disparos VIP",
        status: "pending",
        confidence: (bestShot.probability >= 70 ? "Muy Alta" : bestShot.probability >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media",
        isDestacado: bestShot.probability >= 70,
        destacadoRule: "Alta de Disparos (≥ 70%)",
        isNewlyDiscovered: true,
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

  // REGLA DE CANTIDADES (10 a 12 iniciales, y al buscar alertas se agregan más):
  // 1) Cartelera inicial (sin snapshot previo): seleccionar entre 10 y 12 alertas de máxima jerarquía.
  // 2) Búsqueda incremental ("Buscar Alertas"): agregar un lote adicional de hasta 6 alertas calificadas.
  const isInitial = existingSnapshot.length === 0;
  const auditPoolSize = isInitial
    ? Math.min(newlyFoundAlerts.length, 16)
    : Math.min(newlyFoundAlerts.length, 8);

  const candidatesToAudit = newlyFoundAlerts.slice(0, auditPoolSize);

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

  // Asegurar rango estricto: 10 a 12 iniciales (o todas las disponibles si hay menos de 10)
  // Al buscar alertas subsecuentes: hasta 6 adicionales
  if (isInitial) {
    if (approvedNewAlerts.length > 12) {
      approvedNewAlerts = approvedNewAlerts.slice(0, 12);
    } else if (approvedNewAlerts.length < 10 && newlyFoundAlerts.length >= 10) {
      const approvedKeys = new Set(approvedNewAlerts.map((p) => getOpportunityKey(p)));
      for (const cand of newlyFoundAlerts) {
        if (approvedNewAlerts.length >= 10) break;
        const key = getOpportunityKey(cand);
        if (!approvedKeys.has(key)) {
          approvedNewAlerts.push(cand);
          approvedKeys.add(key);
        }
      }
    }
  } else {
    if (approvedNewAlerts.length > 6) {
      approvedNewAlerts = approvedNewAlerts.slice(0, 6);
    }
  }

  // 5. Fusionar nuevas alertas con el snapshot existente
  const mergedMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    if (!isCuratedLeague(p.leagueId, p.league, p.country)) continue;
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

  // 2) Limitar estrictamente al rango oficial VIP de 10 a 12 pronósticos
  const curatedPicks = rankedPicks.length > 12 ? rankedPicks.slice(0, 12) : rankedPicks;

  // 3) Ordenar por horario de inicio (kickoff)
  const finalPicks = sortByKickoff(curatedPicks, "asc");

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

  // 6. Guardar en disco y Supabase
  await saveShotsVipSnapshotAsync(targetDate, finalPicks, false);

  if (!isTargetToday) {
    await settleActiveSnapshotWithRealScores(targetDate, "shots_vip").catch(() => []);
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
  const targetDate = dateStr || getEcuadorDateString();

  // 1. Auto-liquidar partidos finalizados en el snapshot SOLO si se solicita explícitamente refresco (forceRefresh).
  // La navegación de usuario es 100% pasiva desde snapshots/base de datos sin consultar APIs externas en caliente.
  if (forceRefresh) {
    await settleActiveSnapshotWithRealScores(targetDate, "shots_vip").catch(() => []);
  }

  // 2. Cargar snapshot
  let picks =
    (await loadDailySnapshotAsync(targetDate, "shots_vip")) ||
    loadDailySnapshot(targetDate, "shots_vip") ||
    [];

  // 3. Si no hay picks o forceRefresh, buscar alertas automáticamente
  if (forceRefresh) {
    const searchRes = await searchAndAddNewShotsVipAlerts(targetDate).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente disparos en modalidad OVER (estrictamente no under) y asegurar banderas VIP
  const sanitizedPicks = picks
    .filter((p) => {
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

  // Limitar estrictamente al rango oficial VIP de 10 a 12 pronósticos de más alta jerarquía
  let curatedPicks = sanitizedPicks;
  if (curatedPicks.length > 12) {
    curatedPicks = [...curatedPicks].sort((a, b) => {
      const aTier = a.leagueTier || 3;
      const bTier = b.leagueTier || 3;
      if (aTier !== bTier) return aTier - bTier;
      const aRank = a.isElite ? 1 : a.isDestacado ? 2 : a.pickBadge === "valor" ? 3 : a.pickBadge === "bomba" ? 4 : 5;
      const bRank = b.isElite ? 1 : b.isDestacado ? 2 : b.pickBadge === "valor" ? 3 : b.pickBadge === "bomba" ? 4 : 5;
      if (aRank !== bRank) return aRank - bRank;
      if (b.probability !== a.probability) return b.probability - a.probability;
      return (b.edge || 0) - (a.edge || 0);
    }).slice(0, 12);
  }

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

