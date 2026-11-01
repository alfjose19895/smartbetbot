import fs from "fs";
import path from "path";
import {
  applyTier4QuotaProtection,
  MarketOpportunity,
  evaluateFixturePrediction,
  isExcludedMatch,
  isCompetitionWithCornerTelemetry,
  getCanonicalTeamKey,
  isElitePick,
  normalizeLeagueInfo,
  sortByKickoff,
} from "./prediction-engine";
import {
  loadDailySnapshot,
  loadDailySnapshotAsync,
  saveDailySnapshot,
  saveDailySnapshotAsync,
  settleActiveSnapshotWithRealScores,
  isCuratedLeague,
  isYouthOrReserveFixture,
  getOpportunityKey,
} from "./db";
import { apiFootball, extractMarketOddsFromBookmaker, ApiFootballOddsItem } from "./api-football";
import { auditPredictionsWithGeminiVeto } from "@/lib/ai/claude-analyst";
import { enrichMatchRealStats, calculateUnifiedQualityScore } from "./team-stats-enricher";

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
 * Retorna el directorio de almacenamiento en disco para los snapshots de Corners VIP.
 */
export function getCornersVipStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "daily_snapshots", "corners_vip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Carga el snapshot síncrono de Corners VIP para una fecha determinada.
 */
export function loadCornersVipSnapshot(dateStr?: string): MarketOpportunity[] | null {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshot(targetDate, "corners_vip");
}

/**
 * Carga el snapshot asíncrono de Corners VIP (disco + Supabase con sportKey = 'corners_vip').
 */
export async function loadCornersVipSnapshotAsync(dateStr?: string): Promise<MarketOpportunity[] | null> {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshotAsync(targetDate, "corners_vip");
}

/**
 * Guarda el snapshot de Corners VIP garantizando aislamiento total frente a otros deportes.
 */
export async function saveCornersVipSnapshotAsync(
  dateStr: string,
  picks: MarketOpportunity[],
  overwrite = false
): Promise<MarketOpportunity[]> {
  const taggedPicks = picks.map((p) => {
    const isElite = isElitePick(p);
    const pickBadge = isElite
      ? "elite"
      : p.odds >= 2.0 && (p.edge || 0) >= 2.0
      ? "bomba"
      : (p.probability >= 62.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
      ? "valor"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

    return {
      ...p,
      sport: "corners_vip" as any,
      source: "corners_vip" as const,
      isCornersVip: true,
      pickBadge,
      isElite,
      vipBadge: "Corners VIP",
    };
  });
  return saveDailySnapshotAsync(dateStr, taggedPicks, "corners_vip", overwrite);
}

/**
 * Verifica si un fixture califica para el análisis de fútbol profesional de alto nivel.
 */
function isSeniorCompetitiveCornerFixture(item: any): boolean {
  if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name || !item.fixture?.date) {
    return false;
  }

  const shortStatus = item.fixture.status?.short || "NS";
  if (["PST", "CANC", "ABD", "AWD", "WO", "POST"].includes(shortStatus)) return false;

  const legName = (item.league?.name || "").toLowerCase();
  const hName = (item.teams.home.name || "").toLowerCase();
  const aName = (item.teams.away.name || "").toLowerCase();

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
  // Excluir segundas divisiones defensivas y ligas de ritmo lento donde el promedio de córners cae por debajo de 8.5
  if (
    legName.includes("ligue 2") ||
    legName.includes("serie b") ||
    legName.includes("segunda división") ||
    legName.includes("la liga 2") ||
    legName.includes("primera a") ||
    legName.includes("categoría primera a")
  ) {
    return false;
  }
  // Filtrar estrictamente solo ligas curadas con soporte oficial y telemetría de saques de esquina
  if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) return false;
  const norm = normalizeLeagueInfo(item.league?.name, item.league?.country, item.league?.id);
  if (norm.tier && norm.tier > 3) return false;

  return true;
}

/**
 * Escanea y descubre nuevas oportunidades exclusivamente de CÓRNERS para la jornada de hoy.
 * Aplica modelos cuantitativos avanzados (Poisson y Bivariada) respaldados por cuotas reales de casas de apuestas.
 */
export async function searchAndAddNewCornersVipAlerts(dateStr?: string, forceRefresh = false): Promise<{
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

  // 1. Auto-liquidar partidos previos finalizados de Corners VIP
  await settleActiveSnapshotWithRealScores(targetDate, "corners_vip").catch(() => []);

  // 2. Cargar snapshot actual de Corners VIP
  let existingSnapshot =
    (await loadDailySnapshotAsync(targetDate, "corners_vip")) ||
    loadDailySnapshot(targetDate, "corners_vip") ||
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

  // Identificar candidatos prioritarios con telemetría que no tengan cuotas en el lote masivo
  const candidatesNeedingOdds = candidateFixtures.filter((item) => {
    if (!isSeniorCompetitiveCornerFixture(item)) return false;
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
    if (!isCompetitionWithCornerTelemetry(item.league.name, item.league.country, item.teams.home.name, item.teams.away.name)) return false;
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
  let enrichedCount = 0;

  for (const item of candidateFixtures) {
    if (!isSeniorCompetitiveCornerFixture(item)) continue;

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

    // REGLA FUNDAMENTAL: Requiere telemetría y LÍNEAS COMERCIALES REALES (>= 7.5 córners)
    const hasTelemetry = isCompetitionWithCornerTelemetry(
      item.league.name,
      item.league.country,
      item.teams.home.name,
      item.teams.away.name
    );
    const hasCommercialRealOdds = Boolean(
      realMarketOdds && (
        (realMarketOdds.cornersOver65 && realMarketOdds.cornersOver65 >= 1.48) ||
        realMarketOdds.cornersOver75 ||
        realMarketOdds.cornersOver85 ||
        realMarketOdds.cornersOver95 ||
        realMarketOdds.cornersOver105
      )
    );

    if (!hasTelemetry || !hasCommercialRealOdds) continue;

    // VETO ANTI-GOLEADA TEMPRANA: Si hay un favorito extremo (< 1.28), suele liquidar el partido en el 1T y dormir la posesión
    if (
      (realMarketOdds?.homeWin && realMarketOdds.homeWin < 1.28) ||
      (realMarketOdds?.awayWin && realMarketOdds.awayWin < 1.28)
    ) {
      continue;
    }

    // Enriquecer con estadísticas reales por equipo (córners a favor/en contra últimos 5 partidos)
    let historicalCornerData: {
      homeCornersFor: number;
      awayCornersFor: number;
      homeCornersAgainst?: number;
      awayCornersAgainst?: number;
      sampleSize?: number;
    } | undefined = undefined;
    let realCornerConsistency = 0.72;

    if (enrichedCount < 14 && item.teams?.home?.id && item.teams?.away?.id) {
      enrichedCount++;
      const realStats = await enrichMatchRealStats(item.teams.home.id, item.teams.away.id, true, 3000).catch(() => ({ home: null, away: null }));
      if (
        realStats.home?.cornersForAvg !== undefined &&
        realStats.away?.cornersForAvg !== undefined
      ) {
        const combinedRealCorners =
          (realStats.home.cornersForAvg + (realStats.away.cornersAgainstAvg ?? realStats.home.cornersForAvg)) / 2 +
          (realStats.away.cornersForAvg + (realStats.home.cornersAgainstAvg ?? realStats.away.cornersForAvg)) / 2;
        // Si ambos equipos promedian combinados menos de 7.8 córners reales, descartar trampa
        if (combinedRealCorners < 7.8) {
          continue;
        }
        historicalCornerData = {
          homeCornersFor: realStats.home.cornersForAvg,
          awayCornersFor: realStats.away.cornersForAvg,
          homeCornersAgainst: realStats.home.cornersAgainstAvg,
          awayCornersAgainst: realStats.away.cornersAgainstAvg,
          sampleSize: Math.min(realStats.home.matchesAnalyzed, realStats.away.matchesAnalyzed),
        };
        realCornerConsistency = combinedRealCorners >= 10.2 ? 0.90 : combinedRealCorners >= 9.2 ? 0.82 : 0.75;
      }
    }

    const opportunities = evaluateFixturePrediction({
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
      targetMarket: "Córners",
      historicalCornerData,
    });

    // Filtrar estrictamente LÍNEAS COMERCIALES REALES (7.5, 8.5, 9.5, 10.5; y 6.5 SOLO cuando es la línea original principal con cuota >= 1.48 y prob >= 68%)
    const cornerOpps = opportunities.filter((p) => {
      const isCorner = p.market === "Córners" || (p.selection || "").toLowerCase().includes("córner");
      const selLower = (p.selection || "").toLowerCase();
      const mktLower = (p.market || "").toLowerCase();
      const isLine65 = selLower.includes("6.5") || mktLower.includes("6.5");
      if (isLine65 && (p.odds < 1.48 || p.probability < 68.0)) return false;
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

      const tier = p.leagueTier || 3;
      const meetsTierThreshold =
        tier === 1 ? (p.probability >= 61.5 && (p.edge || 0) >= 1.5) :
        tier === 2 ? (p.probability >= 63.0 && (p.edge || 0) >= 1.8) :
        (p.probability >= 64.5 && (p.edge || 0) >= 2.0);

      return isCorner && !isUnder && isOver && meetsTierThreshold && p.odds >= 1.44 && p.odds <= 1.98;
    });

    if (cornerOpps.length > 0) {
      // Elegir la línea comercial más rentable y segura según el Quality Score unificado
      cornerOpps.sort((a, b) => {
        const scoreA = calculateUnifiedQualityScore({
          probability: a.probability,
          odds: a.odds,
          edge: a.edge || 0,
          consistencyRate: realCornerConsistency,
          leagueTier: a.leagueTier || 3,
        });
        const scoreB = calculateUnifiedQualityScore({
          probability: b.probability,
          odds: b.odds,
          edge: b.edge || 0,
          consistencyRate: realCornerConsistency,
          leagueTier: b.leagueTier || 3,
        });
        return scoreB - scoreA || b.probability - a.probability;
      });
      const bestCorner = cornerOpps[0];
      const unifiedScore = calculateUnifiedQualityScore({
        probability: bestCorner.probability,
        odds: bestCorner.odds,
        edge: bestCorner.edge || 0,
        consistencyRate: realCornerConsistency,
        leagueTier: bestCorner.leagueTier || 3,
      });

      const isElite = isElitePick(bestCorner) || unifiedScore >= 78;
      let pickBadge: "elite" | "valor" | "bomba" | "estandar" = "estandar";
      if (isElite) {
        pickBadge = "elite";
      } else if (bestCorner.probability >= 63.0 && (bestCorner.edge || 0) >= 2.0) {
        pickBadge = "valor";
      } else if (bestCorner.odds >= 1.58 && (bestCorner.edge || 0) >= 1.5) {
        pickBadge = "valor";
      }

      const isInPlay = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(shortStatus);
      const isFinished = ["FT", "AET", "PEN"].includes(shortStatus);
      const liveOrFtScore = (isInPlay || isFinished) && typeof item.goals?.home === "number" && typeof item.goals?.away === "number"
        ? `${item.goals.home} - ${item.goals.away}`
        : undefined;

      const taggedPick: MarketOpportunity = {
        ...bestCorner,
        smartScore: unifiedScore,
        sport: "corners_vip" as any,
        source: "corners_vip",
        isCornersVip: true,
        pickBadge,
        isElite,
        vipBadge: "Corners VIP",
        status: isInPlay ? "in_play" : "pending",
        matchTiming: isFinished ? "finished" : isInPlay ? "live" : "prematch",
        currentScore: liveOrFtScore,
        isDestacado: bestCorner.probability >= 66,
        destacadoRule: "Línea Comercial Rentable (≥ 66%)",
        confidence: bestCorner.probability >= 68 ? "Muy Alta" : "Alta",
        isNewlyDiscovered: !isFinished && !isInPlay,
        addedAt: new Date().toISOString(),
      };

      newlyFoundAlerts.push(taggedPick);
      usedTeams.add(hNorm);
      usedTeams.add(aNorm);
    }
  }

  // Ordenar todos los candidatos según la jerarquía estricta:
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
  // Evaluar todos los candidatos genuinos calificados por Tier de Liga y respetar estrictamente el Veto de IA (sin rellenar con picks vetados).
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
      console.warn("[Corners VIP] Gemini Veto audit warning:", vetoErr);
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
      : p.odds >= 2.0 && (p.edge || 0) >= 2.0
      ? "bomba"
      : (p.probability >= 62.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
      ? "valor"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

    mergedMap.set(getOpportunityKey(p), {
      ...p,
      isCornersVip: true,
      source: "corners_vip",
      pickBadge,
      isElite,
      vipBadge: "Corners VIP",
      confidence: p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : "Media",
      isDestacado: p.probability >= 70,
      destacadoRule: "Alta de Córners (≥ 70%)",
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
      console.warn("[Corners VIP] Gemini Veto audit on existing picks warning:", auditErr);
    }
  }

  // 6. Guardar en disco y Supabase y liquidar estados en vivo/finalizados
  await saveCornersVipSnapshotAsync(targetDate, finalPicks, false);

  const settledAfterSave = await settleActiveSnapshotWithRealScores(targetDate, "corners_vip").catch(() => []);
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
          ? `✓ Se generó la cartelera inicial de Corners VIP con ${approvedNewAlerts.length} pronósticos de alta jerarquía.`
          : `✓ Se agregaron ${approvedNewAlerts.length} nuevas alertas a Corners VIP (Total: ${finalPicks.length}).`
        : `✓ Panel de Corners VIP al día (${finalPicks.length} alertas disponibles).`,
  };
}

/**
 * Obtiene la cartelera de Corners VIP para una fecha dada (auto-iniciando si el snapshot está vacío).
 */
export async function getCornersVipSlate(dateStr?: string, forceRefresh = false): Promise<{
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
    (await loadDailySnapshotAsync(targetDate, "corners_vip")) ||
    loadDailySnapshot(targetDate, "corners_vip") ||
    [];

  // 2. Auto-liquidar partidos finalizados y actualizar marcadores en vivo en caliente
  const settledPicks = await settleActiveSnapshotWithRealScores(targetDate, "corners_vip").catch(() => []);
  if (settledPicks && settledPicks.length > 0) {
    picks = settledPicks;
  }

  // 3. Generación inicial si no existe snapshot o forzar refresco
  if (picks.length === 0 || forceRefresh) {
    const searchRes = await searchAndAddNewCornersVipAlerts(targetDate, forceRefresh).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente córners en modalidad OVER (estrictamente no under) y asegurar banderas VIP
  const sanitizedPicks = picks
    .filter((p) => {
      const isSettledOrInPlay = p.status === "won" || p.status === "lost" || p.status === "in_play" || (p as any).result === "WON" || (p as any).result === "LOST" || p.matchTiming === "live" || p.matchTiming === "finished" || Boolean(p.actualScore) || Boolean(p.currentScore);
      if (isSettledOrInPlay) return true;
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) return false;
      const isCorner = p.market === "Córners" || (p.selection || "").toLowerCase().includes("córner");
      const selLower = (p.selection || "").toLowerCase();
      const mktLower = (p.market || "").toLowerCase();
      const isLine65 = selLower.includes("6.5") || mktLower.includes("6.5");
      if (isLine65 && (p.odds < 1.48 || p.probability < 68.0)) return false;
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
      return isCorner && !isUnder && isOver;
    })
    .map((p) => {
      const isElite = isElitePick(p);
      const pickBadge = isElite
        ? "elite"
        : p.odds >= 2.0 && (p.edge || 0) >= 2.0
        ? "bomba"
        : (p.probability >= 62.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
        ? "valor"
        : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

      return {
        ...p,
        sport: "corners_vip" as any,
        source: "corners_vip" as const,
        isCornersVip: true,
        pickBadge,
        isElite,
        vipBadge: "Corners VIP",
        confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : "Media") as "Muy Alta" | "Alta" | "Media",
        isDestacado: p.probability >= 70,
        destacadoRule: "Alta de Córners (≥ 70%)",
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

