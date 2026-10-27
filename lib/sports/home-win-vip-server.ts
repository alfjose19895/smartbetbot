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
 * Retorna el directorio de almacenamiento en disco para los snapshots de Ganador Local VIP.
 */
export function getHomeWinVipStorageDir(): string {
  const dir = path.join(process.cwd(), "data", "daily_snapshots", "home_win_vip");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Carga el snapshot síncrono de Ganador Local VIP para una fecha determinada.
 */
export function loadHomeWinVipSnapshot(dateStr?: string): MarketOpportunity[] | null {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshot(targetDate, "home_win_vip");
}

/**
 * Carga el snapshot asíncrono de Ganador Local VIP (disco + Supabase con sportKey = 'home_win_vip').
 */
export async function loadHomeWinVipSnapshotAsync(dateStr?: string): Promise<MarketOpportunity[] | null> {
  const targetDate = dateStr || getEcuadorDateString();
  return loadDailySnapshotAsync(targetDate, "home_win_vip");
}

/**
 * Guarda el snapshot de Ganador Local VIP garantizando aislamiento total frente al pre match y otros módulos.
 */
export async function saveHomeWinVipSnapshotAsync(
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
      : (p.probability >= 65.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
      ? "valor"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

    return {
      ...p,
      sport: "home_win_vip" as any,
      source: "home_win_vip" as const,
      isHomeWinVip: true,
      pickBadge,
      isElite,
      vipBadge: "Ganador Local VIP",
      confidence: (p.probability >= 68 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
      isDestacado: p.probability >= 58,
      destacadoRule: "Ganador Local (≥ 58%)",
    };
  });
  return saveDailySnapshotAsync(dateStr, taggedPicks, "home_win_vip", overwrite);
}

/**
 * Verifica si un fixture califica para el análisis de fútbol profesional de alto nivel.
 */
function isSeniorCompetitiveHomeWinFixture(item: any): boolean {
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
 * Aplica modelos predictivos avanzados con la regla estricta de CONVICCIÓN / PROBABILIDAD >= 58%.
 */
export async function searchAndAddNewHomeWinVipAlerts(dateStr?: string, forceRefresh = false): Promise<{
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

  // 1. Auto-liquidar partidos previos finalizados de Ganador Local VIP
  await settleActiveSnapshotWithRealScores(targetDate, "home_win_vip").catch(() => []);

  // 2. Cargar snapshot actual de Ganador Local VIP
  let existingSnapshot = forceRefresh ? [] :
    (await loadDailySnapshotAsync(targetDate, "home_win_vip")) ||
    loadDailySnapshot(targetDate, "home_win_vip") ||
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
    if (!isSeniorCompetitiveHomeWinFixture(item)) continue;

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
    if (!realMarketOdds || !realMarketOdds.homeWin || realMarketOdds.homeWin < 1.15 || realMarketOdds.homeWin > 3.00) continue;

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
      const won = homeGoals > awayGoals;
      if (won) {
        matchStatus = "won";
        profit = Number(((realMarketOdds.homeWin || 1) - 1).toFixed(2));
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
      targetMarket: "Ganador Local",
    });

    // Filtrar estrictamente solo pronósticos de GANADOR LOCAL con regla estricta >= 58% de probabilidad/convicción
    const homeWinOpps = opportunities.filter((p) => {
      const isHomeWin = p.market === "Ganador Local" || (p.selection || "").toLowerCase() === "1" || (p.selection || "").toLowerCase() === (p.homeTeam || "").toLowerCase();
      // REGLA ESTRICTA DE CONVICCIÓN: PROBABILIDAD >= 58%
      const meetsStrictProb = p.probability >= 58.0;
      return isHomeWin && meetsStrictProb && p.odds >= 1.15 && p.odds <= 3.50;
    });

    if (homeWinOpps.length > 0) {
      homeWinOpps.sort((a, b) => b.probability - a.probability || b.edge - a.edge);
      const bestHomeWin = homeWinOpps[0];

      const isElite = isElitePick(bestHomeWin);
      let pickBadge: "elite" | "valor" | "bomba" | "estandar" = "estandar";
      if (isElite) {
        pickBadge = "elite";
      } else if (bestHomeWin.odds >= 2.00 && (bestHomeWin.edge || 0) >= 2.0) {
        pickBadge = "bomba";
      } else if (bestHomeWin.probability >= 65.0 && (bestHomeWin.edge || 0) >= 2.0) {
        pickBadge = "valor";
      } else if (bestHomeWin.odds >= 1.65 && (bestHomeWin.edge || 0) >= 1.5) {
        pickBadge = "valor";
      }

      const taggedPick: MarketOpportunity = {
        ...bestHomeWin,
        sport: "home_win_vip" as any,
        source: "home_win_vip",
        isHomeWinVip: true,
        pickBadge,
        isElite,
        vipBadge: "Ganador Local VIP",
        status: matchStatus,
        actualScore,
        profit,
        result: isFinished ? (matchStatus === "won" ? "WON" : "LOST") : undefined,
        isDestacado: true,
        destacadoRule: "Ganador Local (≥ 58%)",
        confidence: bestHomeWin.probability >= 68 ? "Muy Alta" : "Alta",
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
      console.warn("[Ganador Local VIP] Gemini Veto fallback:", err);
    }
  }

  // 5. Fusionar preservando unicidad absoluta
  const mergedMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    if (!isCuratedLeague(p.leagueId, p.league, p.country)) continue;
    if (p.probability < 58.0) continue; // Garantizar regla estricta >= 58%
    const isElite = isElitePick(p);
    const pickBadge = isElite
      ? "elite"
      : p.odds >= 2.0 && (p.edge || 0) >= 2.0
      ? "bomba"
      : (p.probability >= 65.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
      ? "valor"
      : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

    const key = getOpportunityKey(p);
    mergedMap.set(key, {
      ...p,
      sport: "home_win_vip" as any,
      source: "home_win_vip",
      isHomeWinVip: true,
      pickBadge,
      isElite,
      vipBadge: "Ganador Local VIP",
      confidence: p.probability >= 68 ? "Muy Alta" : "Alta",
      isDestacado: true,
      destacadoRule: "Ganador Local (≥ 58%)",
    });
  }

  for (const p of approvedNewAlerts) {
    const key = getOpportunityKey(p);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, p);
    }
  }

  const finalPicks = sortByKickoff(Array.from(mergedMap.values()), "asc");
  await saveHomeWinVipSnapshotAsync(targetDate, finalPicks, true);

  return {
    success: true,
    newAlerts: approvedNewAlerts,
    totalAlerts: finalPicks.length,
    predictions: finalPicks,
    message:
      approvedNewAlerts.length > 0
        ? existingSnapshot.length === 0
          ? `✓ Se generó la cartelera inicial de Ganador Local VIP con ${approvedNewAlerts.length} pronósticos de alta jerarquía (≥ 58%).`
          : `✓ Se agregaron ${approvedNewAlerts.length} nuevas alertas a Ganador Local VIP (Total: ${finalPicks.length}).`
        : `✓ Panel de Ganador Local VIP al día (${finalPicks.length} alertas disponibles).`,
  };
}

/**
 * Retorna la cartelera actual de Ganador Local VIP con liquidación en tiempo real.
 */
export async function getHomeWinVipSlate(dateStr?: string, forceRefresh = false): Promise<{
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
  const todayDateStr = getEcuadorDateString();
  const targetDate = dateStr || todayDateStr;
  const isTargetToday = targetDate === todayDateStr;

  // 1. Cargar snapshot
  let picks =
    (await loadDailySnapshotAsync(targetDate, "home_win_vip")) ||
    loadDailySnapshot(targetDate, "home_win_vip") ||
    [];

  // 2. Auto-liquidar partidos finalizados en el snapshot si se solicita refresco o si hay partidos que ya iniciaron o están en vivo
  const nowMs = Date.now();
  const needsSettlement = forceRefresh || (Array.isArray(picks) && picks.some((p) => {
    const isSettled = (p.status === "won" || p.status === "lost") && Boolean(p.actualScore);
    const pKick = p.kickoff ? new Date(p.kickoff).getTime() : 0;
    return (!isSettled && pKick > 0 && nowMs >= pKick) || p.matchTiming === "live" || Boolean(p.currentScore);
  }));

  if (needsSettlement) {
    const settled = await settleActiveSnapshotWithRealScores(targetDate, "home_win_vip").catch(() => []);
    if (settled && settled.length > 0) {
      picks = settled;
    }
  }

  // 3. Generación inicial automática si no existen alertas para hoy, o forzar refresco
  if ((isTargetToday && picks.length === 0) || forceRefresh) {
    try {
      const searchRes = await searchAndAddNewHomeWinVipAlerts(targetDate);
      if (searchRes?.predictions && searchRes.predictions.length > 0) {
        picks = searchRes.predictions;
      }
    } catch (e) {
      console.warn("[Ganador Local VIP] Generación automática de cartelera falló:", e);
    }
  }

  // Filtrar exclusivamente Ganador Local y garantizar probabilidad estricta >= 58%
  const sanitizedPicks = picks
    .filter((p) => {
      if (!isCuratedLeague(p.leagueId, p.league, p.country)) return false;
      const isHomeWin = p.market === "Ganador Local" || (p.selection || "").toLowerCase() === "1" || (p.selection || "").toLowerCase() === (p.homeTeam || "").toLowerCase();
      return isHomeWin && p.probability >= 58.0;
    })
    .map((p) => {
      const isElite = isElitePick(p);
      const pickBadge = isElite
        ? "elite"
        : p.odds >= 2.0 && (p.edge || 0) >= 2.0
        ? "bomba"
        : (p.probability >= 65.0 && (p.edge || 0) >= 2.0) || (p.odds >= 1.65 && (p.edge || 0) >= 1.5)
        ? "valor"
        : (p.pickBadge && ["elite", "valor", "bomba", "estandar"].includes(p.pickBadge) ? p.pickBadge : "estandar");

      return {
        ...p,
        sport: "home_win_vip" as any,
        source: "home_win_vip" as const,
        isHomeWinVip: true,
        pickBadge,
        isElite,
        vipBadge: "Ganador Local VIP",
        confidence: (p.probability >= 68 ? "Muy Alta" : "Alta") as "Muy Alta" | "Alta" | "Media",
        isDestacado: true,
        destacadoRule: "Ganador Local (≥ 58%)",
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
