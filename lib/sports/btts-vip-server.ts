import fs from "fs";
import path from "path";
import {
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
 * Retorna el directorio de almacenamiento en disco para los snapshots de Ambos Anotan VIP.
 */
export function getBttsVipStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "daily_snapshots", "btts_vip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Carga el snapshot síncrono de Ambos Anotan VIP para una fecha determinada.
 */
export function loadBttsVipSnapshot(dateStr?: string): MarketOpportunity[] | null {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshot(targetDate, "btts_vip");
}

/**
 * Carga el snapshot asíncrono de Ambos Anotan VIP (disco + Supabase con sportKey = 'btts_vip').
 */
export async function loadBttsVipSnapshotAsync(dateStr?: string): Promise<MarketOpportunity[] | null> {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshotAsync(targetDate, "btts_vip");
}

/**
 * Guarda el snapshot de Ambos Anotan VIP garantizando aislamiento total frente al pre match y otros módulos.
 */
export async function saveBttsVipSnapshotAsync(
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
      sport: "btts_vip" as any,
      source: "btts_vip" as const,
      isBttsVip: true,
      pickBadge,
      isElite,
      vipBadge: "Ambos Anotan VIP",
      confidence: (p.probability >= 70 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
      isDestacado: p.probability >= 58,
      destacadoRule: "Ambos Anotan (≥ 58%)",
    };
  });
  return saveDailySnapshotAsync(dateStr, taggedPicks, "btts_vip", overwrite);
}

/**
 * Verifica si un fixture califica para el análisis de fútbol profesional de alto nivel.
 */
function isSeniorCompetitiveBttsFixture(item: any): boolean {
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
  return true;
}

/**
 * Escanea y descubre nuevas oportunidades exclusivamente de AMBOS EQUIPOS ANOTAN para la jornada de hoy.
 * Aplica modelos predictivos avanzados con la regla estricta de CONVICCIÓN / PROBABILIDAD >= 58%.
 */
export async function searchAndAddNewBttsVipAlerts(dateStr?: string, forceRefresh = false): Promise<{
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

  // 1. Auto-liquidar partidos previos finalizados de Ambos Anotan VIP
  await settleActiveSnapshotWithRealScores(targetDate, "btts_vip").catch(() => []);

  // 2. Cargar snapshot actual de Ambos Anotan VIP
  let existingSnapshot = forceRefresh ? [] :
    (await loadDailySnapshotAsync(targetDate, "btts_vip")) ||
    loadDailySnapshot(targetDate, "btts_vip") ||
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
    if (!isSeniorCompetitiveBttsFixture(item)) continue;

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
    if (!realMarketOdds || !realMarketOdds.bttsYes || realMarketOdds.bttsYes < 1.20 || realMarketOdds.bttsYes > 2.60) continue;

    const shortStatus = item.fixture.status?.short || "NS";
    const isFinished = ["FT", "AET", "PEN"].includes(shortStatus);
    const isInPlay = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(shortStatus);
    let matchStatus: "pending" | "in_play" | "won" | "lost" = "pending";
    let actualScore: string | undefined = undefined;
    let profit: number | undefined = undefined;

    if (isFinished) {
      const homeGoals = item.goals?.home ?? 0;
      const awayGoals = item.goals?.away ?? 0;
      actualScore = `${homeGoals}-${awayGoals}`;
      const bothScored = homeGoals > 0 && awayGoals > 0;
      if (bothScored) {
        matchStatus = "won";
        profit = Number((realMarketOdds.bttsYes - 1).toFixed(2));
      } else {
        matchStatus = "lost";
        profit = -1;
      }
    } else if (isInPlay) {
      matchStatus = "in_play";
      actualScore = `${item.goals?.home ?? 0}-${item.goals?.away ?? 0}`;
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
    });

    // Filtrar estrictamente solo pronósticos de AMBOS EQUIPOS ANOTAN con regla estricta >= 58% de probabilidad/convicción
    const bttsOpps = opportunities.filter((p) => {
      const isBtts = p.market === "Ambos Equipos Anotan" || (p.selection || "").toLowerCase().includes("ambos") || (p.selection || "").toLowerCase().includes("sí") || (p.selection || "").toLowerCase().includes("si");
      // REGLA ESTRICTA DE CONVICCIÓN: PROBABILIDAD >= 58%
      const meetsStrictProb = p.probability >= 58.0;
      return isBtts && meetsStrictProb && p.odds >= 1.20 && p.odds <= 2.60;
    });

    if (bttsOpps.length > 0) {
      // Ordenar por probabilidad descendente y mayor edge
      bttsOpps.sort((a, b) => b.probability - a.probability || b.edge - a.edge);
      const bestBtts = bttsOpps[0];

      const isElite = isElitePick(bestBtts);
      let pickBadge: "elite" | "valor" | "bomba" | "estandar" = "estandar";
      if (isElite) {
        pickBadge = "elite";
      } else if (bestBtts.odds >= 2.00 && (bestBtts.edge || 0) >= 2.0) {
        pickBadge = "bomba";
      } else if (bestBtts.probability >= 62.0 && (bestBtts.edge || 0) >= 2.0) {
        pickBadge = "valor";
      } else if (bestBtts.odds >= 1.65 && (bestBtts.edge || 0) >= 1.5) {
        pickBadge = "valor";
      }

      const taggedPick: MarketOpportunity = {
        ...bestBtts,
        sport: "btts_vip" as any,
        source: "btts_vip",
        isBttsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Ambos Anotan VIP",
        status: matchStatus,
        actualScore,
        profit,
        result: isFinished ? (matchStatus === "won" ? "WON" : "LOST") : undefined,
        isDestacado: true,
        destacadoRule: "Ambos Anotan (≥ 58%)",
        confidence: bestBtts.probability >= 70 ? "Muy Alta" : "Alta",
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
      console.warn("[Ambos Anotan VIP] Gemini Veto audit warning:", vetoErr);
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
    if (!isCuratedLeague(p.leagueId, p.league, p.country)) continue;
    if (p.probability < 58.0) continue; // Garantizar regla estricta >= 58%
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
      isBttsVip: true,
      source: "btts_vip",
      pickBadge,
      isElite,
      vipBadge: "Ambos Anotan VIP",
      confidence: p.probability >= 70 ? "Muy Alta" : "Alta",
      isDestacado: true,
      destacadoRule: "Ambos Anotan (≥ 58%)",
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

  const curatedPicks = rankedPicks;
  const finalPicks = sortByKickoff(curatedPicks, "asc");

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
      console.warn("[Ambos Anotan VIP] Gemini Veto audit on existing picks warning:", auditErr);
    }
  }

  // 6. Guardar en disco y Supabase
  await saveBttsVipSnapshotAsync(targetDate, finalPicks, false);

  if (!isTargetToday) {
    await settleActiveSnapshotWithRealScores(targetDate, "btts_vip").catch(() => []);
  }

  return {
    success: true,
    newAlerts: approvedNewAlerts,
    totalAlerts: finalPicks.length,
    predictions: finalPicks,
    message:
      approvedNewAlerts.length > 0
        ? existingSnapshot.length === 0
          ? `✓ Se generó la cartelera inicial de Ambos Anotan VIP con ${approvedNewAlerts.length} pronósticos de alta jerarquía (≥ 58%).`
          : `✓ Se agregaron ${approvedNewAlerts.length} nuevas alertas a Ambos Anotan VIP (Total: ${finalPicks.length}).`
        : `✓ Panel de Ambos Anotan VIP al día (${finalPicks.length} alertas disponibles).`,
  };
}

/**
 * Obtiene la cartelera de Ambos Anotan VIP para una fecha dada (auto-iniciando si el snapshot está vacío).
 */
export async function getBttsVipSlate(dateStr?: string, forceRefresh = false): Promise<{
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

  // 1. Auto-liquidar partidos finalizados en el snapshot
  await settleActiveSnapshotWithRealScores(targetDate, "btts_vip").catch(() => []);

  // 2. Cargar snapshot
  let picks =
    (await loadDailySnapshotAsync(targetDate, "btts_vip")) ||
    loadDailySnapshot(targetDate, "btts_vip") ||
    [];

  // 3. Si no hay picks o forceRefresh, buscar alertas automáticamente
  if (forceRefresh) {
    const searchRes = await searchAndAddNewBttsVipAlerts(targetDate, forceRefresh).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente Ambos Equipos Anotan y garantizar probabilidad estricta >= 58%
  const sanitizedPicks = picks
    .filter((p) => {
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) return false;
      const isBtts = p.market === "Ambos Equipos Anotan" || (p.selection || "").toLowerCase().includes("ambos") || (p.selection || "").toLowerCase().includes("sí") || (p.selection || "").toLowerCase().includes("si");
      return isBtts && p.probability >= 58.0;
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
        sport: "btts_vip" as any,
        source: "btts_vip" as const,
        isBttsVip: true,
        pickBadge,
        isElite,
        vipBadge: "Ambos Anotan VIP",
        confidence: (p.probability >= 70 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
        isDestacado: true,
        destacadoRule: "Ambos Anotan (≥ 58%)",
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
