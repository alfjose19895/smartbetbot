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
  isCuratedLeague,
  getOpportunityKey,
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
  } = params;

  const norm = normalizeLeagueInfo(league, country, leagueId);
  const canonicalLeague = norm.canonicalLeague || league;
  const normCountry = norm.country || country;
  const tier = norm.tier || 3;

  // 1. Tasa base calibrada por país/liga (promedio histórico verificado de amonestaciones)
  const cLower = (normCountry || "").toLowerCase();
  const lLower = (canonicalLeague || "").toLowerCase();

  let baseLambda = 4.3; // Promedio estándar competitivo
  if (cLower.includes("spain") || cLower.includes("españa")) baseLambda = 5.2;
  else if (cLower.includes("ital") || cLower.includes("italia")) baseLambda = 4.9;
  else if (cLower.includes("argentina") || cLower.includes("uruguay") || cLower.includes("colombia") || cLower.includes("chile") || cLower.includes("peru")) baseLambda = 5.4;
  else if (cLower.includes("brazil") || cLower.includes("brasil")) baseLambda = 5.1;
  else if (cLower.includes("portugal")) baseLambda = 5.2;
  else if (cLower.includes("turkey") || cLower.includes("turqu") || cLower.includes("greece")) baseLambda = 5.2;
  else if (cLower.includes("mexico") && !lLower.includes("expansion")) baseLambda = 4.4;
  else if (cLower.includes("england") || cLower.includes("inglaterra")) baseLambda = 3.9;
  else if (cLower.includes("germany") || cLower.includes("alemania")) baseLambda = 4.0;
  else if (cLower.includes("france") || cLower.includes("francia")) baseLambda = 4.1;
  else if (lLower.includes("champions") || lLower.includes("libertadores") || lLower.includes("europa") || lLower.includes("sudamericana")) baseLambda = 5.0;

  // 2. Factor Árbitro (Referee Factor)
  let refereeFactor = 1.0;
  const refLower = (referee || "").toLowerCase();
  if (refLower) {
    if (
      refLower.includes("hernández") ||
      refLower.includes("lahoz") ||
      refLower.includes("gil manzano") ||
      refLower.includes("sanchez martinez") ||
      refLower.includes("marciniak") ||
      refLower.includes("massa") ||
      refLower.includes("raparini") ||
      refLower.includes("daronco") ||
      refLower.includes("orsato") ||
      refLower.includes("guida") ||
      refLower.includes("taylor")
    ) {
      refereeFactor = 1.15;
    } else if (
      refLower.includes("oliver") ||
      refLower.includes("kassai") ||
      refLower.includes("brych") ||
      refLower.includes("turpin")
    ) {
      refereeFactor = 0.90;
    }
  }

  // 3. Factor Tensión / Derbi / Fricción competitiva
  let tensionFactor = 1.0;
  const hCanon = getCanonicalTeamKey(homeTeam);
  const aCanon = getCanonicalTeamKey(awayTeam);
  const isDerby =
    (hCanon.includes("madrid") && aCanon.includes("madrid")) ||
    (hCanon.includes("milan") && aCanon.includes("inter")) ||
    (hCanon.includes("roma") && aCanon.includes("lazio")) ||
    (hCanon.includes("arsenal") && aCanon.includes("tottenham")) ||
    (hCanon.includes("liverpool") && (aCanon.includes("everton") || aCanon.includes("manchester"))) ||
    (hCanon.includes("boca") && aCanon.includes("river")) ||
    (hCanon.includes("racing") && aCanon.includes("independiente")) ||
    (hCanon.includes("flamengo") && (aCanon.includes("fluminense") || aCanon.includes("vasco"))) ||
    (hCanon.includes("celtic") && aCanon.includes("rangers")) ||
    (hCanon.includes("sevilla") && aCanon.includes("betis")) ||
    (hCanon.includes("porto") && (aCanon.includes("benfica") || aCanon.includes("sporting"))) ||
    (hCanon.includes("galatasaray") && (aCanon.includes("fenerbahce") || aCanon.includes("besiktas")));

  if (isDerby) tensionFactor = 1.20;

  // Fricción por paridad de nivel competitivo
  const rHome = getTeamRating(homeTeam);
  const rAway = getTeamRating(awayTeam);
  const eloDiff = Math.abs(rHome - rAway);
  const frictionFactor = eloDiff <= 25 ? 1.06 : 0.98;

  const expectedCards = baseLambda * refereeFactor * tensionFactor * frictionFactor;

  // Si la proyección total esperada es menor a 4.4, el partido no tiene suficiente potencial Over
  if (expectedCards < 4.4) {
    return [];
  }

  // 4. Evaluar líneas candidatas estrictamente OVER (3.5, 4.5, 5.5) con umbrales calibrados
  const candidateLines = [
    {
      line: 3.5,
      threshold: 3,
      selection: "Over 3.5 Tarjetas",
      realOdd: marketOdds?.cardsOver35,
      minExpectedCards: 4.5,
      minProb: 63.0,
    },
    {
      line: 4.5,
      threshold: 4,
      selection: "Over 4.5 Tarjetas",
      realOdd: marketOdds?.cardsOver45,
      minExpectedCards: 5.2,
      minProb: 59.0,
    },
    {
      line: 5.5,
      threshold: 5,
      selection: "Over 5.5 Tarjetas",
      realOdd: marketOdds?.cardsOver55,
      minExpectedCards: 6.0,
      minProb: 58.0,
    },
  ];

  const opportunities: MarketOpportunity[] = [];

  for (const c of candidateLines) {
    if (expectedCards < c.minExpectedCards) continue;

    const rawProb = poissonOver(expectedCards, c.threshold);
    const probPercent = Math.round(rawProb * 1000) / 10;

    const minTierProb =
      tier === 1 ? 62.0 : tier === 2 ? 64.0 : tier === 3 ? 68.0 : 72.0;
    const effectiveMinProb = Math.max(c.minProb, minTierProb);
    if (probPercent < effectiveMinProb) continue;

    const fairOdds = Math.round((1 / rawProb) * 100) / 100;

    // Obtener cuota auténtica o deducir con margen bookmaker si es liga curada de alta jerarquía
    let effectiveOdds = c.realOdd;
    if (!effectiveOdds) {
      if (isCuratedLeague(leagueId, canonicalLeague, normCountry)) {
        effectiveOdds = Math.round((fairOdds * 0.94) * 100) / 100;
      }
    }

    if (!effectiveOdds || effectiveOdds < 1.25 || effectiveOdds > 2.05) {
      continue;
    }

    const edge = Math.round(((effectiveOdds / fairOdds) - 1) * 1000) / 10;

    // Si la cuota de la casa representa un subpago severo (-EV > -5%), descartar
    if (c.realOdd && edge < -5.0) {
      continue;
    }

    const minTierEdge =
      tier === 1 ? 1.5 : tier === 2 ? 2.0 : tier === 3 ? 2.5 : 3.5;
    if (c.realOdd && edge < minTierEdge) {
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
      market: "Tarjetas",
      selection: c.selection,
      odds: effectiveOdds,
      fairOdds,
      probability: probPercent,
      edge: Math.max(0.5, edge),
      expectedValue: Math.max(0.5, edge),
      confidence,
      smartScore: Math.min(99, Math.round(probPercent * 1.1 + (isDerby ? 8 : 4))),
      status: "pending",
      explanation: `Proyección disciplinaria calibrada de ${expectedCards.toFixed(1)} tarjetas totales en ${canonicalLeague} (Tier ${tier}).${
        referee ? ` Árbitro designado: ${referee}.` : ""
      }${isDerby ? " Encuentro de máxima rivalidad y alta tensión competitiva." : ""}`,
      isCardsVip: true,
      vipBadge: "Tarjetas VIP",
      isDestacado: probPercent >= 70,
      destacadoRule: "Alta de Tarjetas (≥ 70%)",
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
 * Escanea y descubre nuevas oportunidades exclusivamente de TARJETAS (solo Over) para la jornada.
 */
export async function searchAndAddNewCardsVipAlerts(dateStr?: string): Promise<{
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
    if (!isSeniorCompetitiveCardsFixture(item)) continue;

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
    });

    // Filtrar estrictamente solo oportunidades de tarjetas en modalidad OVER (no Under)
    const validOpps = cardOpps.filter((p) => {
      const isCard = p.market === "Tarjetas" || (p.selection || "").toLowerCase().includes("tarjeta");
      const selLower = (p.selection || "").toLowerCase();
      const isUnder = selLower.includes("under") || selLower.includes("menos") || selLower.includes("baja");
      const isOver = selLower.includes("over") || selLower.includes("más") || selLower.includes("+");
      const tier = p.leagueTier || 3;
      const minTierProb = tier === 1 ? 62.0 : tier === 2 ? 64.0 : tier === 3 ? 68.0 : 72.0;
      return isCard && !isUnder && isOver && p.probability >= minTierProb && p.odds >= 1.25 && p.odds <= 2.05;
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

      const taggedPick: MarketOpportunity = {
        ...bestCard,
        sport: "cards_vip" as any,
        source: "cards_vip",
        isCardsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Tarjetas VIP",
        status: "pending",
        confidence: (bestCard.probability >= 70 ? "Muy Alta" : bestCard.probability >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media",
        isDestacado: bestCard.probability >= 70,
        destacadoRule: "Alta de Tarjetas (≥ 70%)",
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
      console.warn("[Cards VIP] Gemini Veto audit warning:", vetoErr);
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

  // 2) Limitar estrictamente al rango oficial VIP de 10 a 12 pronósticos
  const curatedPicks = isInitial && rankedPicks.length > 12 ? rankedPicks.slice(0, 12) : rankedPicks;

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
      console.warn("[Cards VIP] Gemini Veto audit on existing picks warning:", auditErr);
    }
  }

  // 6. Guardar en disco y Supabase
  await saveCardsVipSnapshotAsync(targetDate, finalPicks, false);

  if (!isTargetToday) {
    await settleActiveSnapshotWithRealScores(targetDate, "cards_vip").catch(() => []);
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

  // 1. Auto-liquidar partidos finalizados en el snapshot SOLO si se solicita explícitamente refresco (forceRefresh).
  if (forceRefresh) {
    await settleActiveSnapshotWithRealScores(targetDate, "cards_vip").catch(() => []);
  }

  // 2. Cargar snapshot
  let picks =
    (await loadDailySnapshotAsync(targetDate, "cards_vip")) ||
    loadDailySnapshot(targetDate, "cards_vip") ||
    [];

  // 3. Generación inicial automática si no existen alertas para hoy, o forzar refresco
  if ((isTargetToday && picks.length === 0) || forceRefresh) {
    const searchRes = await searchAndAddNewCardsVipAlerts(targetDate).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente tarjetas en modalidad OVER (estrictamente no under) y asegurar banderas VIP
  const sanitizedPicks = picks
    .filter((p) => {
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

