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
 * Retorna el directorio de almacenamiento en disco para los snapshots de Ganador Visitante VIP.
 */
export function getAwayWinVipStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "daily_snapshots", "away_win_vip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Carga el snapshot síncrono de Ganador Visitante VIP para una fecha determinada.
 */
export function loadAwayWinVipSnapshot(dateStr?: string): MarketOpportunity[] | null {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshot(targetDate, "away_win_vip");
}

/**
 * Carga el snapshot asíncrono de Ganador Visitante VIP (disco + Supabase con sportKey = 'away_win_vip').
 */
export async function loadAwayWinVipSnapshotAsync(dateStr?: string): Promise<MarketOpportunity[] | null> {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshotAsync(targetDate, "away_win_vip");
}

/**
 * Guarda el snapshot de Ganador Visitante VIP garantizando aislamiento total frente al pre match y otros módulos.
 */
export async function saveAwayWinVipSnapshotAsync(
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
      : (p.probability >= 70.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
      ? "valor"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

    return {
      ...p,
      sport: "away_win_vip" as any,
      source: "away_win_vip" as const,
      isAwayWinVip: true,
      pickBadge,
      isElite,
      vipBadge: "Ganador Visitante VIP",
      confidence: (p.probability >= 72 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
      isDestacado: p.probability >= 65,
      destacadoRule: "Ganador Visitante (≥ 60%)",
    };
  });
  return saveDailySnapshotAsync(dateStr, taggedPicks, "away_win_vip", overwrite);
}

/**
 * Verifica si un fixture califica para el análisis de fútbol profesional de alto nivel.
 */
function isSeniorCompetitiveAwayWinFixture(item: any): boolean {
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
    legName.includes("reserves") ||
    legName.includes("youth") ||
    legName.includes("sub-") ||
    legName.includes("women") ||
    legName.includes("femenin") ||
    legName.includes("amateur")
  ) {
    return false;
  }

  if (
    hName.includes(" u21") ||
    hName.includes(" u23") ||
    hName.includes(" u19") ||
    hName.includes("reserves") ||
    aName.includes(" u21") ||
    aName.includes(" u23") ||
    aName.includes(" u19") ||
    aName.includes("reserves")
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

  if (isExcludedMatch(item.teams.home.name, item.teams.away.name)) {
    return false;
  }

  if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) {
    return false;
  }

  return true;
}

/**
 * Escanea de forma desacoplada todos los partidos disponibles en la fecha solicitada.
 * Aplica modelos predictivos avanzados con la regla estricta de CONVICCIÓN / PROBABILIDAD >= 65%.
 */
export async function searchAndAddNewAwayWinVipAlerts(dateStr?: string, forceRefresh = false): Promise<{
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

  // 1. Auto-liquidar partidos previos finalizados de Ganador Visitante VIP
  await settleActiveSnapshotWithRealScores(targetDate, "away_win_vip").catch(() => []);

  // 2. Cargar snapshot actual de Ganador Visitante VIP
  let existingSnapshot = forceRefresh ? [] :
    (await loadDailySnapshotAsync(targetDate, "away_win_vip")) ||
    loadDailySnapshot(targetDate, "away_win_vip") ||
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
    if (!isSeniorCompetitiveAwayWinFixture(item)) continue;

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
    if (!realMarketOdds || !realMarketOdds.awayWin || realMarketOdds.awayWin < 1.15 || realMarketOdds.awayWin > 3.20) continue;

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
      const won = awayGoals > homeGoals;
      if (won) {
        matchStatus = "won";
        profit = Number(((realMarketOdds.awayWin || 1) - 1).toFixed(2));
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

    // Filtrar estrictamente solo pronósticos de GANADOR VISITANTE con regla estricta >= 65% de probabilidad/convicción
    const awayWinOpps = opportunities.filter((p) => {
      const isAwayWin = p.market === "Ganador Visitante" || (p.selection || "").toLowerCase() === "2" || (p.selection || "").toLowerCase() === (p.awayTeam || "").toLowerCase();
      // REGLA ESTRICTA DE CONVICCIÓN: PROBABILIDAD >= 65%
      const meetsStrictProb = p.probability >= 65.0;
      return isAwayWin && meetsStrictProb && p.odds >= 1.20 && p.odds <= 4.00;
    });

    if (awayWinOpps.length > 0) {
      awayWinOpps.sort((a, b) => b.probability - a.probability || b.edge - a.edge);
      const bestAwayWin = awayWinOpps[0];

      const isElite = isElitePick(bestAwayWin);
      let pickBadge: "elite" | "valor" | "bomba" | "estandar" = "estandar";
      if (isElite) {
        pickBadge = "elite";
      } else if (bestAwayWin.odds >= 2.00 && (bestAwayWin.edge || 0) >= 2.0) {
        pickBadge = "bomba";
      } else if (bestAwayWin.probability >= 70.0 && (bestAwayWin.edge || 0) >= 2.0) {
        pickBadge = "valor";
      } else if (bestAwayWin.odds >= 1.65 && (bestAwayWin.edge || 0) >= 1.5) {
        pickBadge = "valor";
      }

      const taggedPick: MarketOpportunity = {
        ...bestAwayWin,
        sport: "away_win_vip" as any,
        source: "away_win_vip",
        isAwayWinVip: true,
        pickBadge,
        isElite,
        vipBadge: "Ganador Visitante VIP",
        status: matchStatus,
        actualScore,
        profit,
        result: isFinished ? (matchStatus === "won" ? "WON" : "LOST") : undefined,
        isDestacado: true,
        destacadoRule: "Ganador Visitante (≥ 60%)",
        confidence: bestAwayWin.probability >= 72 ? "Muy Alta" : "Alta",
        isNewlyDiscovered: true,
        addedAt: new Date().toISOString(),
      };

      newlyFoundAlerts.push(taggedPick);
      usedTeams.add(hNorm);
      usedTeams.add(aNorm);
    }
  }

  // 4. Auditoría con Gemini Veto Engine
  let approvedNewAlerts = newlyFoundAlerts;
  if (newlyFoundAlerts.length > 0) {
    try {
      const vetoRes = await auditPredictionsWithGeminiVeto(newlyFoundAlerts, "football");
      if (vetoRes?.approvedPicks && vetoRes.approvedPicks.length > 0) {
        approvedNewAlerts = vetoRes.approvedPicks;
      }
    } catch (err) {
      console.warn("[Ganador Visitante VIP] Gemini Veto fallback:", err);
    }
  }

  // 5. Fusionar preservando unicidad absoluta
  const mergedMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    if (!isCuratedLeague(p.leagueId, p.league, p.country)) continue;
    if (p.probability < 65.0) continue; // Garantizar regla estricta >= 65%
    const isElite = isElitePick(p);
    const pickBadge = isElite
      ? "elite"
      : p.odds >= 2.0 && (p.edge || 0) >= 2.0
      ? "bomba"
      : (p.probability >= 70.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
      ? "valor"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

    const key = getOpportunityKey(p);
    mergedMap.set(key, {
      ...p,
      sport: "away_win_vip" as any,
      source: "away_win_vip",
      isAwayWinVip: true,
      pickBadge,
      isElite,
      vipBadge: "Ganador Visitante VIP",
      confidence: p.probability >= 72 ? "Muy Alta" : "Alta",
      isDestacado: true,
      destacadoRule: "Ganador Visitante (≥ 60%)",
    });
  }

  for (const p of approvedNewAlerts) {
    const key = getOpportunityKey(p);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, p);
    }
  }

  const finalPicks = sortByKickoff(Array.from(mergedMap.values()), "asc");
  await saveAwayWinVipSnapshotAsync(targetDate, finalPicks, true);

  return {
    success: true,
    newAlerts: approvedNewAlerts,
    totalAlerts: finalPicks.length,
    predictions: finalPicks,
    message:
      approvedNewAlerts.length > 0
        ? existingSnapshot.length === 0
          ? `✓ Se generó la cartelera inicial de Ganador Visitante VIP con ${approvedNewAlerts.length} pronósticos de alta jerarquía (≥ 65%).`
          : `✓ Se agregaron ${approvedNewAlerts.length} nuevas alertas a Ganador Visitante VIP (Total: ${finalPicks.length}).`
        : `✓ Panel de Ganador Visitante VIP al día (${finalPicks.length} alertas disponibles).`,
  };
}

/**
 * Retorna la cartelera actual de Ganador Visitante VIP con liquidación en tiempo real.
 */
export async function getAwayWinVipSlate(dateStr?: string, forceRefresh = false): Promise<{
  predictions: MarketOpportunity[];
  date: string;
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
  await settleActiveSnapshotWithRealScores(targetDate, "away_win_vip").catch(() => []);

  // 2. Cargar snapshot
  let picks =
    (await loadDailySnapshotAsync(targetDate, "away_win_vip")) ||
    loadDailySnapshot(targetDate, "away_win_vip") ||
    [];

  // 3. Generación inicial si no existe snapshot o forzar refresco
  if (forceRefresh) {
    try {
      const searchRes = await searchAndAddNewAwayWinVipAlerts(targetDate);
      if (searchRes?.predictions && searchRes.predictions.length > 0) {
        picks = searchRes.predictions;
      }
    } catch (e) {
      console.warn("[Ganador Visitante VIP] Generación automática de cartelera falló:", e);
    }
  }

  // Filtrar exclusivamente Ganador Visitante y garantizar probabilidad estricta >= 65%
  const sanitizedPicks = picks
    .filter((p) => {
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) return false;
      const isAwayWin = p.market === "Ganador Visitante" || (p.selection || "").toLowerCase() === "2" || (p.selection || "").toLowerCase() === (p.awayTeam || "").toLowerCase();
      return isAwayWin && p.probability >= 65.0;
    })
    .map((p) => {
      const isElite = isElitePick(p);
      const pickBadge = isElite
        ? "elite"
        : p.odds >= 2.0 && (p.edge || 0) >= 2.0
        ? "bomba"
        : (p.probability >= 70.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
        ? "valor"
        : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

      return {
        ...p,
        sport: "away_win_vip" as any,
        source: "away_win_vip" as const,
        isAwayWinVip: true,
        pickBadge,
        isElite,
        vipBadge: "Ganador Visitante VIP",
        confidence: (p.probability >= 72 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
        isDestacado: true,
        destacadoRule: "Ganador Visitante (≥ 60%)",
      };
    })
    .sort((a, b) => {
      const timeDiff = new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (b.probability || 0) - (a.probability || 0);
    });

  const total = sanitizedPicks.length;
  const won = sanitizedPicks.filter((p) => p.status === "won" || (p as any).result === "WON").length;
  const lost = sanitizedPicks.filter((p) => p.status === "lost" || (p as any).result === "LOST").length;
  const pending = total - (won + lost);
  const settled = won + lost;
  const winRate = settled > 0 ? Math.round((won / settled) * 1000) / 10 : undefined;
  const avgProb = total > 0 ? Math.round((sanitizedPicks.reduce((acc, p) => acc + (p.probability || 0), 0) / total) * 10) / 10 : 0;
  const avgOdds = total > 0 ? Math.round((sanitizedPicks.reduce((acc, p) => acc + (p.odds || 0), 0) / total) * 100) / 100 : 0;

  return {
    predictions: sanitizedPicks,
    date: targetDate,
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
