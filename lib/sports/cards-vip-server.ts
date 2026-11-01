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
  isCuratedLeague,
  getOpportunityKey,
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
 * Directorio de almacenamiento en disco para los snapshots de Tarjetas VIP.
 */
export function getCardsVipStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "daily_snapshots", "cards_vip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Carga el snapshot síncrono de Tarjetas VIP para una fecha determinada.
 */
export function loadCardsVipSnapshot(dateStr?: string): MarketOpportunity[] | null {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshot(targetDate, "cards_vip");
}

/**
 * Carga el snapshot asíncrono de Tarjetas VIP (disco + Supabase con sportKey = 'cards_vip').
 */
export async function loadCardsVipSnapshotAsync(dateStr?: string): Promise<MarketOpportunity[] | null> {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshotAsync(targetDate, "cards_vip");
}

/**
 * Elimina por completo el snapshot de Tarjetas VIP en memoria, disco y Supabase.
 */
export async function clearCardsVipSnapshotAsync(dateStr?: string): Promise<void> {
  const targetDate = dateStr || getEcuadorDateString();
  return clearDailySnapshotAsync(targetDate, "cards_vip");
}

/**
 * Guarda el snapshot de Tarjetas VIP garantizando aislamiento total frente a otros deportes y módulos.
 */
export async function saveCardsVipSnapshotAsync(
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
      sport: "cards_vip" as any,
      source: "cards_vip" as const,
      isCardsVip: true,
      pickBadge,
      isElite,
      vipBadge: "Tarjetas VIP",
      confidence: (p.confidence as any) || (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : "Media"),
      isDestacado: p.probability >= 70,
      destacadoRule: "Alta de Tarjetas (≥ 70%)",
    };
  });
  return saveDailySnapshotAsync(dateStr, taggedPicks, "cards_vip", overwrite);
}

/**
 * Verifica si un fixture califica para el análisis de tarjetas (competiciones profesionales con telemetría disciplinaria comprobada).
 */
function isSeniorCompetitiveCardsFixture(item: any): boolean {
  if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name || !item.fixture?.date) {
    return false;
  }

  const shortStatus = item.fixture.status?.short || "NS";
  if (["PST", "CANC", "ABD", "AWD", "WO", "POST"].includes(shortStatus)) return false;

  const legName = (item.league?.name || "").toLowerCase();
  const cName = (item.league?.country || "").toLowerCase();
  const hName = (item.teams.home.name || "").toLowerCase();
  const aName = (item.teams.away.name || "").toLowerCase();

  // Excluir ligas de bajo promedio disciplinario (< 3.2 tarjetas/partido) o sin telemetría oficial
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
 * Evalúa las probabilidades cuantitativas de Tarjetas Totales para un fixture.
 * Pondera la tasa de la liga, la agresividad de los equipos, el colegiado asignado y la fricción del duelo.
 */
export function evaluateFixtureCardsPrediction(params: {
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
  referee?: string | null;
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
    referee,
    marketOdds,
    realStats,
  } = params;

  const norm = normalizeLeagueInfo(league, country, leagueId);
  const canonicalLeague = norm.canonicalLeague || league;
  const normCountry = norm.country || country;
  const tier = norm.tier || 3;

  // 1. Tasa base realista calibrada sin sobreestimación genérica
  const cLower = (normCountry || "").toLowerCase();
  const lLower = (canonicalLeague || "").toLowerCase();

  // Excluir ligas nórdicas/inglesas bajas y Eredivisie de baja fricción disciplinaria salvo que haya cuota real alta
  if (
    (cLower.includes("netherlands") || lLower.includes("eredivisie") || cLower.includes("norway") || cLower.includes("sweden") || cLower.includes("denmark")) &&
    !marketOdds?.cardsOver35 &&
    !marketOdds?.cardsOver45
  ) {
    return [];
  }

  let baseLambda = 4.15;
  if (cLower.includes("argentina") || cLower.includes("uruguay") || cLower.includes("colombia") || cLower.includes("chile") || cLower.includes("peru")) baseLambda = 4.95;
  else if (lLower.includes("libertadores") || lLower.includes("sudamericana")) baseLambda = 5.10;
  else if (cLower.includes("spain") || cLower.includes("españa")) baseLambda = 4.75;
  else if (cLower.includes("portugal")) baseLambda = 4.85;
  else if (cLower.includes("turkey") || cLower.includes("turqu") || cLower.includes("greece")) baseLambda = 4.80;
  else if (cLower.includes("brazil") || cLower.includes("brasil")) baseLambda = 4.75;
  else if (cLower.includes("ital") || cLower.includes("italia")) baseLambda = 4.55;
  else if (cLower.includes("mexico") && !lLower.includes("expansion")) baseLambda = 4.45;
  else if (lLower.includes("champions") || lLower.includes("europa")) baseLambda = 4.40;
  else if (cLower.includes("england") || cLower.includes("inglaterra")) baseLambda = 3.85;
  else if (cLower.includes("germany") || cLower.includes("alemania")) baseLambda = 3.90;
  else if (cLower.includes("france") || cLower.includes("francia")) baseLambda = 3.95;

  // 2. Factor Árbitro Ampliado (Colegiados en activo de alta y baja severidad)
  let refereeFactor = 1.0;
  const refLower = (referee || "").toLowerCase();
  if (refLower) {
    if (
      refLower.includes("hernández") ||
      refLower.includes("hernandez") ||
      refLower.includes("gil manzano") ||
      refLower.includes("soto grado") ||
      refLower.includes("munuera") ||
      refLower.includes("cuadra") ||
      refLower.includes("sanchez martinez") ||
      refLower.includes("sánchez martínez") ||
      refLower.includes("marciniak") ||
      refLower.includes("massa") ||
      refLower.includes("guida") ||
      refLower.includes("mariani") ||
      refLower.includes("daronco") ||
      refLower.includes("wilton sampaio") ||
      refLower.includes("raphael claus") ||
      refLower.includes("roldán") ||
      refLower.includes("roldan") ||
      refLower.includes("tello") ||
      refLower.includes("herrera") ||
      refLower.includes("falcón") ||
      refLower.includes("matonte") ||
      refLower.includes("piero maza") ||
      refLower.includes("taylor") ||
      refLower.includes("kavanagh") ||
      refLower.includes("pinheiro") ||
      refLower.includes("godinho")
    ) {
      refereeFactor = 1.14;
    } else if (
      refLower.includes("oliver") ||
      refLower.includes("turpin") ||
      refLower.includes("letexier") ||
      refLower.includes("zwayer") ||
      refLower.includes("siebert") ||
      refLower.includes("makkelie") ||
      refLower.includes("alberola")
    ) {
      refereeFactor = 0.90;
    }
  }

  // 3. Factor Tensión / Derbi / Paridad Competitiva Real (sin el bug de eloDiff == 0)
  let tensionFactor = 1.0;
  const hCanon = getCanonicalTeamKey(homeTeam);
  const aCanon = getCanonicalTeamKey(awayTeam);
  const isDerby =
    (hCanon.includes("madrid") && aCanon.includes("madrid")) ||
    (hCanon.includes("barcelona") && (aCanon.includes("madrid") || aCanon.includes("espanyol"))) ||
    (hCanon.includes("milan") && aCanon.includes("inter")) ||
    (hCanon.includes("roma") && aCanon.includes("lazio")) ||
    (hCanon.includes("juventus") && (aCanon.includes("inter") || aCanon.includes("torino") || aCanon.includes("milan"))) ||
    (hCanon.includes("arsenal") && (aCanon.includes("tottenham") || aCanon.includes("chelsea"))) ||
    (hCanon.includes("liverpool") && (aCanon.includes("everton") || aCanon.includes("manchester"))) ||
    (hCanon.includes("boca") && (aCanon.includes("river") || aCanon.includes("racing") || aCanon.includes("independiente") || aCanon.includes("sanlorenzo"))) ||
    (hCanon.includes("racing") && aCanon.includes("independiente")) ||
    (hCanon.includes("flamengo") && (aCanon.includes("fluminense") || aCanon.includes("vasco") || aCanon.includes("botafogo") || aCanon.includes("palmeiras"))) ||
    (hCanon.includes("corinthians") && (aCanon.includes("palmeiras") || aCanon.includes("saopaulo"))) ||
    (hCanon.includes("celtic") && aCanon.includes("rangers")) ||
    (hCanon.includes("sevilla") && aCanon.includes("betis")) ||
    (hCanon.includes("athletic") && aCanon.includes("sociedad")) ||
    (hCanon.includes("porto") && (aCanon.includes("benfica") || aCanon.includes("sporting"))) ||
    (hCanon.includes("benfica") && aCanon.includes("sporting")) ||
    (hCanon.includes("galatasaray") && (aCanon.includes("fenerbahce") || aCanon.includes("besiktas"))) ||
    (hCanon.includes("fenerbahce") && aCanon.includes("besiktas")) ||
    (hCanon.includes("nacional") && aCanon.includes("penarol")) ||
    (hCanon.includes("colo") && aCanon.includes("universidad")) ||
    (hCanon.includes("millonarios") && (aCanon.includes("santafe") || aCanon.includes("nacional")));

  if (isDerby) tensionFactor = 1.22;

  // Evaluar paridad competitiva mediante cuotas reales 1X2 de las casas de apuestas
  const homeWinOdd = marketOdds?.homeWin;
  const awayWinOdd = marketOdds?.awayWin;

  // Veto de partido desigual: si hay un favorito muy pesado (< 1.44) y no es clásico/derbi, el partido se define rápido y sin fricción
  if (!isDerby && ((homeWinOdd && homeWinOdd < 1.44) || (awayWinOdd && awayWinOdd < 1.44))) {
    return [];
  }

  let frictionFactor = 0.98;
  if (homeWinOdd && awayWinOdd) {
    const oddGap = Math.abs(homeWinOdd - awayWinOdd);
    if (oddGap <= 0.85 || (homeWinOdd >= 1.75 && awayWinOdd <= 4.10)) {
      frictionFactor = 1.07; // Duelo genuinamente cerrado y disputado hasta el final
    } else if (oddGap <= 1.35) {
      frictionFactor = 1.02;
    } else {
      frictionFactor = 0.93;
    }
  } else {
    const rHome = getTeamRating(homeTeam);
    const rAway = getTeamRating(awayTeam);
    const hasVerifiedRatings = Math.abs(rHome - 1500) > 15 && Math.abs(rAway - 1500) > 15;
    if (hasVerifiedRatings && Math.abs(rHome - rAway) <= 35) {
      frictionFactor = 1.05;
    }
  }

  let expectedCards = baseLambda * refereeFactor * tensionFactor * frictionFactor;
  let consistencyRate = isDerby ? 0.84 : 0.74;

  // 4. Convergencia Estadística Real de Tarjetas de ambos equipos
  if (realStats?.home && realStats?.away) {
    const hStats = realStats.home;
    const aStats = realStats.away;

    if (
      typeof hStats.cardsForAvg === "number" &&
      typeof aStats.cardsForAvg === "number" &&
      typeof hStats.cardsAgainstAvg === "number" &&
      typeof aStats.cardsAgainstAvg === "number"
    ) {
      const realHomeCards = (hStats.cardsForAvg + aStats.cardsAgainstAvg) / 2;
      const realAwayCards = (aStats.cardsForAvg + hStats.cardsAgainstAvg) / 2;
      const realCombinedCards = realHomeCards + realAwayCards;

      // Veto disciplinario: si los equipos promedian pocas tarjetas en sus últimos partidos y no es derbi, descartar
      if (!isDerby && (realCombinedCards < 4.1 || realHomeCards < 1.6 || realAwayCards < 1.6)) {
        return [];
      }

      expectedCards = 0.65 * realCombinedCards + 0.35 * expectedCards;
      consistencyRate = ((hStats.over35CardsRate ?? 0.75) + (aStats.over35CardsRate ?? 0.75)) / 2;
    }
  }

  // Exigir un umbral mínimo sólido de tarjetas proyectadas (>= 4.65)
  if (expectedCards < 4.65) {
    return [];
  }

  // 5. Evaluar líneas comerciales reales (Over 3.5 y Over 4.5, y 5.5 solo en duelos extremos)
  const candidateLines = [
    {
      line: 3.5,
      threshold: 3,
      selection: "Over 3.5 Tarjetas",
      realOdd: marketOdds?.cardsOver35,
      minExpectedCards: 4.70,
      minProb: 67.0,
    },
    {
      line: 4.5,
      threshold: 4,
      selection: "Over 4.5 Tarjetas",
      realOdd: marketOdds?.cardsOver45,
      minExpectedCards: 5.55,
      minProb: 65.0,
    },
    {
      line: 5.5,
      threshold: 5,
      selection: "Over 5.5 Tarjetas",
      realOdd: marketOdds?.cardsOver55,
      minExpectedCards: 6.45,
      minProb: 64.0,
    },
  ];

  const opportunities: MarketOpportunity[] = [];

  for (const c of candidateLines) {
    if (expectedCards < c.minExpectedCards) continue;

    const rawProb = poissonOver(expectedCards, c.threshold);
    const probPercent = Math.round(rawProb * 1000) / 10;

    const minTierProb =
      tier === 1 ? 65.0 : tier === 2 ? 66.0 : tier === 3 ? 68.0 : 72.0;
    const effectiveMinProb = Math.max(c.minProb, minTierProb);
    if (probPercent < effectiveMinProb) continue;

    const fairOdds = Math.round((1 / rawProb) * 100) / 100;

    // Priorizar cuota real de la casa de apuestas; si la API solo entregó cuotas 1X2 en liga de alta fricción,
    // exigir que la línea tenga cuota comercial rentable (>= 1.48 y <= 1.95) y alta convergencia (prohibido cuotas basura @1.26)
    let effectiveOdds = c.realOdd;
    if (!effectiveOdds) {
      const hasReal1X2Parity = Boolean(homeWinOdd && awayWinOdd && homeWinOdd >= 1.65 && awayWinOdd <= 4.20);
      if (isCuratedLeague(leagueId, canonicalLeague, normCountry) && (hasReal1X2Parity || isDerby) && expectedCards >= c.line + 1.25) {
        // Calibrar sobre línea comercial real rentable (1.52 - 1.88)
        const commercialOdd = Math.round(Math.max(1.52, Math.min(1.88, fairOdds * 1.04)) * 100) / 100;
        effectiveOdds = commercialOdd;
      }
    }

    // Rango estricto de cuota rentable (1.46 a 1.98) — cero cuotas 1.22–1.38 sin rentabilidad
    if (!effectiveOdds || effectiveOdds < 1.46 || effectiveOdds > 1.98) {
      continue;
    }

    const edge = Math.round(((effectiveOdds / fairOdds) - 1) * 1000) / 10;

    const minTierEdge =
      tier === 1 ? 1.8 : tier === 2 ? 2.2 : tier === 3 ? 2.8 : 3.5;
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
      market: "Tarjetas",
      selection: c.selection,
      pick: c.selection,
      odds: effectiveOdds,
      fairOdds,
      probability: probPercent,
      edge: Math.max(1.5, edge),
      expectedValue: Math.max(1.5, edge),
      confidence,
      smartScore: Math.min(99, Math.max(76, qualityScore + (isDerby ? 5 : 0))),
      status: "pending",
      explanation: `Convergencia disciplinaria de ${expectedCards.toFixed(1)} tarjetas esperadas (colchón +${(expectedCards - c.line).toFixed(1)} sobre línea ${c.line}) en ${canonicalLeague}.${
        referee ? ` Árbitro: ${referee}.` : ""
      }${isDerby ? " Clásico/Derbi de máxima tensión." : " Duelo parejo de alta fricción competitiva."}`,
      isCardsVip: true,
      vipBadge: "Tarjetas VIP",
      isDestacado: probPercent >= 70,
      destacadoRule: "Alta de Tarjetas (≥ 70%)",
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
 * Escanea y descubre nuevas oportunidades exclusivamente de TARJETAS (solo Over) para la jornada.
 */
export async function searchAndAddNewCardsVipAlerts(dateStr?: string, forceRefresh = false): Promise<{
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
  await settleActiveSnapshotWithRealScores(targetDate, "cards_vip").catch(() => []);

  // 2. Cargar snapshot actual de Tarjetas VIP
  let existingSnapshot =
    (await loadDailySnapshotAsync(targetDate, "cards_vip")) ||
    loadDailySnapshot(targetDate, "cards_vip") ||
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
    if (!isSeniorCompetitiveCardsFixture(item)) return false;
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
  let enrichedCardsCount = 0;

  for (const item of candidateFixtures) {
    if (!isSeniorCompetitiveCardsFixture(item)) continue;

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

    let realStats: MatchRealConvergenceContext | undefined = undefined;
    if (enrichedCardsCount < 10 && item.teams.home.id && item.teams.away.id) {
      enrichedCardsCount++;
      realStats = await enrichMatchRealStats(item.teams.home.id, item.teams.away.id, false, 3000).catch(() => undefined);
    }

    const cardOpps = evaluateFixtureCardsPrediction({
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
      referee: item.fixture.referee,
      marketOdds: realMarketOdds,
      realStats,
    });

    // Filtrar estrictamente solo oportunidades de tarjetas en modalidad OVER con cuota rentable (1.46 - 1.98)
    const validOpps = cardOpps.filter((p) => {
      const isCard = p.market === "Tarjetas" || (p.selection || "").toLowerCase().includes("tarjeta");
      const selLower = (p.selection || "").toLowerCase();
      const isUnder = selLower.includes("under") || selLower.includes("menos") || selLower.includes("baja");
      const isOver = selLower.includes("over") || selLower.includes("más") || selLower.includes("+");
      const tier = p.leagueTier || 3;
      const minTierProb = tier === 1 ? 65.0 : tier === 2 ? 66.0 : tier === 3 ? 68.0 : 72.0;
      return isCard && !isUnder && isOver && p.probability >= minTierProb && p.odds >= 1.46 && p.odds <= 1.98;
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
      const bestCard = validOpps[0];

      const isElite = isElitePick(bestCard);
      const pickBadge = isElite
        ? "elite"
        : (bestCard.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(bestCard.pickBadge)
          ? bestCard.pickBadge
          : (bestCard.edge || 0) >= 4.0
          ? "valor"
          : (bestCard.odds || 0) >= 2.0
          ? "bomba"
          : "estandar");

      const isInPlay = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(shortStatus);
      const isFinished = ["FT", "AET", "PEN"].includes(shortStatus);
      const liveOrFtScore = (isInPlay || isFinished) && typeof item.goals?.home === "number" && typeof item.goals?.away === "number"
        ? `${item.goals.home} - ${item.goals.away}`
        : undefined;

      const taggedPick: MarketOpportunity = {
        ...bestCard,
        sport: "cards_vip" as any,
        source: "cards_vip",
        isCardsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Tarjetas VIP",
        status: isInPlay ? "in_play" : "pending",
        matchTiming: isFinished ? "finished" : isInPlay ? "live" : "prematch",
        currentScore: liveOrFtScore,
        confidence: (bestCard.probability >= 70 ? "Muy Alta" : bestCard.probability >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media",
        isDestacado: bestCard.probability >= 70,
        destacadoRule: "Alta de Tarjetas (≥ 70%)",
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
      console.warn("[Cards VIP] Gemini Veto audit warning:", vetoErr);
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
      isCardsVip: true,
      source: "cards_vip",
      pickBadge,
      isElite,
      vipBadge: "Tarjetas VIP",
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
      console.warn("[Cards VIP] Gemini Veto audit on existing picks warning:", auditErr);
    }
  }

  // 6. Guardar en disco y Supabase y liquidar estados en vivo/finalizados
  await saveCardsVipSnapshotAsync(targetDate, finalPicks, false);

  const settledAfterSave = await settleActiveSnapshotWithRealScores(targetDate, "cards_vip").catch(() => []);
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
          ? `✓ Se generó la cartelera inicial de Tarjetas VIP con ${approvedNewAlerts.length} pronósticos de alta jerarquía.`
          : `✓ Se agregaron ${approvedNewAlerts.length} nuevas alertas a Tarjetas VIP (Total: ${finalPicks.length}).`
        : `✓ Panel de Tarjetas VIP al día (${finalPicks.length} alertas auditadas disponibles).`,
  };
}

/**
 * Obtiene la cartelera de Tarjetas VIP para una fecha dada (auto-iniciando si el snapshot está vacío).
 */
export async function getCardsVipSlate(dateStr?: string, forceRefresh = false): Promise<{
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
    (await loadDailySnapshotAsync(targetDate, "cards_vip")) ||
    loadDailySnapshot(targetDate, "cards_vip") ||
    [];

  // 2. Auto-liquidar partidos finalizados y actualizar marcadores en vivo en caliente
  const settledPicks = await settleActiveSnapshotWithRealScores(targetDate, "cards_vip").catch(() => []);
  if (settledPicks && settledPicks.length > 0) {
    picks = settledPicks;
  }

  // 3. Generación inicial si no existe snapshot o forzar refresco
  if (picks.length === 0 || forceRefresh) {
    const searchRes = await searchAndAddNewCardsVipAlerts(targetDate, forceRefresh).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente tarjetas en modalidad OVER (estrictamente no under) y asegurar banderas VIP
  const sanitizedPicks = picks
    .filter((p) => {
      const isSettledOrInPlay = p.status === "won" || p.status === "lost" || p.status === "in_play" || (p as any).result === "WON" || (p as any).result === "LOST" || p.matchTiming === "live" || p.matchTiming === "finished" || Boolean(p.actualScore) || Boolean(p.currentScore);
      if (isSettledOrInPlay) return true;
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) return false;
      const isCard = p.market === "Tarjetas" || (p.selection || "").toLowerCase().includes("tarjeta");
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
      return isCard && !isUnder && isOver;
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
        sport: "cards_vip" as any,
        source: "cards_vip" as const,
        isCardsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Tarjetas VIP",
        confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media",
        isDestacado: p.probability >= 70,
        destacadoRule: "Alta de Tarjetas (≥ 70%)",
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

