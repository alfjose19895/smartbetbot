import fs from "fs";
import path from "path";
import {
  applyTier4QuotaProtection,
  MarketOpportunity,
  evaluateFixturePrediction,
  isExcludedMatch,
  getCanonicalTeamKey,
  isElitePick,
  normalizeLeagueInfo,
  sortByKickoff,
} from "./prediction-engine";
import {
  loadDailySnapshot,
  loadDailySnapshotAsync,
  saveDailySnapshotAsync,
  settleActiveSnapshotWithRealScores,
  isCuratedLeague,
  isYouthOrReserveFixture,
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
 * Retorna el directorio de almacenamiento en disco para los snapshots de Over 2.5 VIP.
 */
export function getOver25VipStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "daily_snapshots", "over25_vip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Carga el snapshot síncrono de Over 2.5 VIP para una fecha determinada.
 */
export function loadOver25VipSnapshot(dateStr?: string): MarketOpportunity[] | null {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshot(targetDate, "over25_vip");
}

/**
 * Carga el snapshot asíncrono de Over 2.5 VIP (disco + Supabase con sportKey = 'over25_vip').
 */
export async function loadOver25VipSnapshotAsync(dateStr?: string): Promise<MarketOpportunity[] | null> {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshotAsync(targetDate, "over25_vip");
}

/**
 * Guarda el snapshot de Over 2.5 VIP garantizando aislamiento total frente al pre match y otros módulos.
 */
export async function saveOver25VipSnapshotAsync(
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
      sport: "over25_vip" as any,
      source: "over25_vip" as const,
      isOver25Vip: true,
      pickBadge,
      isElite,
      vipBadge: "Over 2.5 VIP",
      confidence: (p.probability >= 70 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
      isDestacado: p.probability >= 60,
      destacadoRule: "Alta de Goles (≥ 60%)",
    };
  });
  return saveDailySnapshotAsync(dateStr, taggedPicks, "over25_vip", overwrite);
}

/**
 * Verifica si un fixture califica para el análisis de fútbol profesional de alto nivel.
 */
function isSeniorCompetitiveOver25Fixture(item: any): boolean {
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
  if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) return false;
  const norm = normalizeLeagueInfo(item.league?.name, item.league?.country, item.league?.id);
  if (norm.tier && norm.tier > 3) return false;

  return true;
}

/**
 * Escanea y descubre nuevas oportunidades exclusivamente de OVER 2.5 GOLES para la jornada de hoy.
 * Aplica modelos predictivos avanzados con la regla estricta de CONVICCIÓN / PROBABILIDAD >= 60%.
 */
export async function searchAndAddNewOver25VipAlerts(dateStr?: string, forceRefresh = false): Promise<{
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

  // 1. Auto-liquidar partidos previos finalizados de Over 2.5 VIP
  await settleActiveSnapshotWithRealScores(targetDate, "over25_vip").catch(() => []);

  // 2. Cargar snapshot actual de Over 2.5 VIP
  let existingSnapshot =
    (await loadDailySnapshotAsync(targetDate, "over25_vip")) ||
    loadDailySnapshot(targetDate, "over25_vip") ||
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
    if (!isSeniorCompetitiveOver25Fixture(item)) return false;
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

  for (const item of candidateFixtures) {
    if (!isSeniorCompetitiveOver25Fixture(item)) continue;

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
    if (!realMarketOdds || !realMarketOdds.over25 || realMarketOdds.over25 < 1.15 || realMarketOdds.over25 > 2.60) continue;

    const shortStatus = item.fixture.status?.short || "NS";
    const isFinished = ["FT", "AET", "PEN"].includes(shortStatus);
    const isInPlay = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(shortStatus);
    let matchStatus: "pending" | "in_play" | "won" | "lost" = "pending";
    let actualScore: string | undefined = undefined;
    let currentScore: string | undefined = undefined;
    let matchTiming: "prematch" | "live" | "finished" = "prematch";
    let profit: number | undefined = undefined;

    if (isFinished) {
      const homeGoals = item.goals?.home ?? 0;
      const awayGoals = item.goals?.away ?? 0;
      actualScore = `${homeGoals} - ${awayGoals}`;
      matchTiming = "finished";
      const overHit = (homeGoals + awayGoals) >= 3;
      if (overHit) {
        matchStatus = "won";
        profit = Number((realMarketOdds.over25 - 1).toFixed(2));
      } else {
        matchStatus = "lost";
        profit = -1;
      }
    } else if (isInPlay) {
      matchStatus = "in_play";
      matchTiming = "live";
      currentScore = `${item.goals?.home ?? 0} - ${item.goals?.away ?? 0}`;
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
      targetMarket: "Over 2.5 Goles",
    });

    // Filtrar estrictamente solo pronósticos de OVER 2.5 GOLES con regla calibrada >= 58% de probabilidad/convicción (>= 60% Destacado)
    const over25Opps = opportunities.filter((p) => {
      const isOver25 = p.market === "Over 2.5 Goles" || p.selection === "Over 2.5" || (p.selection || "").toLowerCase().includes("over 2.5");
      const meetsStrictProb = p.probability >= 58.0;
      return isOver25 && meetsStrictProb && p.odds >= 1.15 && p.odds <= 2.60;
    });

    if (over25Opps.length > 0) {
      // Ordenar por probabilidad descendente y mayor edge
      over25Opps.sort((a, b) => b.probability - a.probability || b.edge - a.edge);
      const bestOver25 = over25Opps[0];

      const isElite = isElitePick(bestOver25);
      let pickBadge: "elite" | "valor" | "bomba" | "estandar" = "estandar";
      if (isElite) {
        pickBadge = "elite";
      } else if (bestOver25.odds >= 2.00 && (bestOver25.edge || 0) >= 2.0) {
        pickBadge = "bomba";
      } else if (bestOver25.probability >= 62.0 && (bestOver25.edge || 0) >= 2.0) {
        pickBadge = "valor";
      } else if (bestOver25.odds >= 1.65 && (bestOver25.edge || 0) >= 1.5) {
        pickBadge = "valor";
      }

      const taggedPick: MarketOpportunity = {
        ...bestOver25,
        sport: "over25_vip" as any,
        source: "over25_vip",
        isOver25Vip: true,
        pickBadge,
        isElite,
        vipBadge: "Over 2.5 VIP",
        status: matchStatus,
        actualScore,
        currentScore,
        matchTiming,
        profit,
        result: isFinished ? (matchStatus === "won" ? "WON" : "LOST") : undefined,
        isDestacado: true,
        destacadoRule: "Alta de Goles (≥ 60%)",
        confidence: bestOver25.probability >= 70 ? "Muy Alta" : "Alta",
        isNewlyDiscovered: matchStatus === "pending",
        addedAt: new Date().toISOString(),
      };

      newlyFoundAlerts.push(taggedPick);
      usedTeams.add(hNorm);
      usedTeams.add(aNorm);
    }
  }

  // Ordenar candidatos por jerarquía estricta:
  // Tier de Liga (T1 > T2 > T3 > T4) > Badge > Probabilidad > Edge
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

  const isInitial = existingSnapshot.length === 0;
  const auditPoolSize = isInitial
    ? Math.min(newlyFoundAlerts.length, 16)
    : Math.min(newlyFoundAlerts.length, 8);

  const candidatesToAudit = newlyFoundAlerts.slice(0, auditPoolSize);

  // 4. Auditoría con Agente IA Google Gemini con límite de tiempo para no bloquear el servidor
  let approvedNewAlerts = candidatesToAudit;
  if (candidatesToAudit.length > 0) {
    try {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const vetoPromise = auditPredictionsWithGeminiVeto(candidatesToAudit, "football");
      const vetoResult = await Promise.race([vetoPromise, timeoutPromise]);
      if (vetoResult?.approvedPicks && vetoResult.approvedPicks.length > 0) {
        approvedNewAlerts = vetoResult.approvedPicks;
      }
    } catch (vetoErr) {
      console.warn("[Over 2.5 VIP] Gemini Veto audit warning:", vetoErr);
    }
  }

  // Asegurar rango estricto: 10 a 12 iniciales (o todas las disponibles si hay menos de 10)
  // Al buscar alertas subsecuentes: hasta 6 adicionales
  if (isInitial) {
    if (approvedNewAlerts.length > 12) {
      // slice limit removed
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

  // 5. Fusionar nuevas alertas con snapshot existente
  const mergedMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    const isSettledOrInPlay = p.status === "won" || p.status === "lost" || p.status === "in_play" || (p as any).result === "WON" || (p as any).result === "LOST" || Boolean(p.actualScore) || Boolean(p.currentScore) || p.matchTiming === "live" || p.matchTiming === "finished";
    if (!isSettledOrInPlay) {
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) continue;
      if (p.probability < 58.0) continue; // Garantizar regla estricta >= 58%
    }
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
      isOver25Vip: true,
      source: "over25_vip",
      pickBadge,
      isElite,
      vipBadge: "Over 2.5 VIP",
      confidence: p.probability >= 70 ? "Muy Alta" : "Alta",
      isDestacado: true,
      destacadoRule: "Alta de Goles (≥ 60%)",
    });
  }

  for (const np of approvedNewAlerts) {
    const key = getOpportunityKey(np);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, np);
    }
  }

  // Ordenar candidatos por jerarquía estricta de calidad: Tier de Liga > Badge > Probabilidad > Edge
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

  const curatedPicks = applyTier4QuotaProtection(rankedPicks, 2);
  let finalPicks = sortByKickoff(curatedPicks, "asc");

  // Auditoría complementaria
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
      console.warn("[Over 2.5 VIP] Gemini Veto audit on existing picks warning:", auditErr);
    }
  }

  // 6. Guardar en disco y Supabase y liquidar estados en vivo/finalizados
  await saveOver25VipSnapshotAsync(targetDate, finalPicks, false);

  const settledAfterSave = await settleActiveSnapshotWithRealScores(targetDate, "over25_vip").catch(() => []);
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
          ? `✓ Se generó la cartelera inicial de Over 2.5 VIP con ${approvedNewAlerts.length} pronósticos de alta jerarquía (≥ 60%).`
          : `✓ Se agregaron ${approvedNewAlerts.length} nuevas alertas a Over 2.5 VIP (Total: ${finalPicks.length}).`
        : `✓ Panel de Over 2.5 VIP al día (${finalPicks.length} alertas disponibles).`,
  };
}

/**
 * Obtiene la cartelera de Over 2.5 VIP para una fecha dada (auto-iniciando si el snapshot está vacío).
 */
export async function getOver25VipSlate(dateStr?: string, forceRefresh = false): Promise<{
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
    (await loadDailySnapshotAsync(targetDate, "over25_vip")) ||
    loadDailySnapshot(targetDate, "over25_vip") ||
    [];

  // 2. Auto-liquidar partidos finalizados y actualizar marcadores en vivo en caliente
  const settledPicks = await settleActiveSnapshotWithRealScores(targetDate, "over25_vip").catch(() => []);
  if (settledPicks && settledPicks.length > 0) {
    picks = settledPicks;
  }

  // 3. Generación inicial si no existe snapshot o forzar refresco
  if (picks.length === 0 || forceRefresh) {
    const searchRes = await searchAndAddNewOver25VipAlerts(targetDate, forceRefresh).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente Over 2.5 y garantizar probabilidad estricta >= 60%
  const sanitizedPicks = picks
    .filter((p) => {
      const isSettledOrInPlay = p.status === "won" || p.status === "lost" || p.status === "in_play" || (p as any).result === "WON" || (p as any).result === "LOST" || p.matchTiming === "live" || p.matchTiming === "finished" || Boolean(p.actualScore) || Boolean(p.currentScore);
      if (isSettledOrInPlay) return true;
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) return false;
      const isOver25 = p.market === "Over 2.5 Goles" || p.selection === "Over 2.5" || (p.selection || "").toLowerCase().includes("over 2.5");
      return isOver25 && p.probability >= 58.0;
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
        sport: "over25_vip" as any,
        source: "over25_vip" as const,
        isOver25Vip: true,
        pickBadge,
        isElite,
        vipBadge: "Over 2.5 VIP",
        confidence: (p.probability >= 70 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
        isDestacado: true,
        destacadoRule: "Alta de Goles (≥ 60%)",
      };
    })
    .sort((a, b) => {
      const timeA = a.kickoff ? new Date(a.kickoff).getTime() : Infinity;
      const timeB = b.kickoff ? new Date(b.kickoff).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;
      if (b.probability !== a.probability) return b.probability - a.probability;
      return (b.edge || 0) - (a.edge || 0);
    });

  let curatedPicks = sanitizedPicks;
  if (curatedPicks.length > 12) {
    curatedPicks = [...curatedPicks]
      .sort((a, b) => {
        const aTier = a.leagueTier || 3;
        const bTier = b.leagueTier || 3;
        if (aTier !== bTier) return aTier - bTier;
        const aRank = a.isElite ? 1 : a.isDestacado ? 2 : a.pickBadge === "valor" ? 3 : a.pickBadge === "bomba" ? 4 : 5;
        const bRank = b.isElite ? 1 : b.isDestacado ? 2 : b.pickBadge === "valor" ? 3 : b.pickBadge === "bomba" ? 4 : 5;
        if (aRank !== bRank) return aRank - bRank;
        if (b.probability !== a.probability) return b.probability - a.probability;
        return (b.edge || 0) - (a.edge || 0);
      })
      ;
  }

  const finalSlate = sortByKickoff(applyTier4QuotaProtection(curatedPicks, 2), "asc");

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
