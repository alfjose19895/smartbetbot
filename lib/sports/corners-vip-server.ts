import fs from "fs";
import path from "path";
import {
  MarketOpportunity,
  evaluateFixturePrediction,
  isExcludedMatch,
  isCompetitionWithCornerTelemetry,
  getCanonicalTeamKey,
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
  const taggedPicks = picks.map((p) => ({
    ...p,
    sport: "corners_vip" as any,
    source: "corners_vip" as const,
    isCornersVip: true,
    pickBadge: "corners_vip" as const,
    vipBadge: "Corners VIP",
  }));
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
  if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) return false;

  return true;
}

/**
 * Escanea y descubre nuevas oportunidades exclusivamente de CÓRNERS para la jornada de hoy.
 * Aplica modelos cuantitativos avanzados (Poisson y Bivariada) respaldados por cuotas reales de casas de apuestas.
 */
export async function searchAndAddNewCornersVipAlerts(dateStr?: string): Promise<{
  success: boolean;
  newAlerts: MarketOpportunity[];
  totalAlerts: number;
  predictions: MarketOpportunity[];
  message: string;
}> {
  const nowMs = Date.now();
  const targetDate = dateStr || getEcuadorDateString(nowMs);

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
    if (!isSeniorCompetitiveCornerFixture(item)) continue;

    const kickoffMs = new Date(item.fixture.date).getTime();
    const shortStatus = item.fixture.status?.short || "NS";

    // Solo evaluar partidos pendientes en el futuro próximo
    if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP", "FT", "AET", "PEN"].includes(shortStatus)) {
      continue;
    }
    if (kickoffMs <= nowMs) continue;

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

    // REGLA FUNDAMENTAL: Requiere telemetría de saques de esquina y cuotas reales de córners
    const hasTelemetry = isCompetitionWithCornerTelemetry(
      item.league.name,
      item.league.country,
      item.teams.home.name,
      item.teams.away.name
    );
    const hasRealOdds = Boolean(
      realMarketOdds && (
        realMarketOdds.cornersOver65 ||
        realMarketOdds.cornersOver75 ||
        realMarketOdds.cornersOver85 ||
        realMarketOdds.cornersOver95 ||
        realMarketOdds.cornersOver105
      )
    );

    if (!hasTelemetry || !hasRealOdds) continue;

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

    // Filtrar estrictamente solo oportunidades de córners
    const cornerOpps = opportunities.filter((p) => {
      const isCorner = p.market === "Córners" || (p.selection || "").toLowerCase().includes("córner");
      return isCorner && p.probability >= 58 && p.odds >= 1.25 && p.odds <= 1.95;
    });

    if (cornerOpps.length > 0) {
      // Elegir la opción de mayor probabilidad y mejor edge
      cornerOpps.sort((a, b) => b.probability - a.probability || b.edge - a.edge);
      const bestCorner = cornerOpps[0];

      const taggedPick: MarketOpportunity = {
        ...bestCorner,
        sport: "corners_vip" as any,
        source: "corners_vip",
        isCornersVip: true,
        pickBadge: "corners_vip",
        vipBadge: "Corners VIP",
        status: "pending",
        isDestacado: bestCorner.probability >= 70,
        destacadoRule: "Alta de Córners (≥ 70%)",
        isNewlyDiscovered: true,
        addedAt: new Date().toISOString(),
      };

      newlyFoundAlerts.push(taggedPick);
      usedTeams.add(hNorm);
      usedTeams.add(aNorm);
    }
  }

  // 4. Fusionar nuevas alertas con el snapshot existente
  const mergedMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    mergedMap.set(getOpportunityKey(p), {
      ...p,
      isCornersVip: true,
      source: "corners_vip",
      pickBadge: "corners_vip",
      vipBadge: "Corners VIP",
    });
  }

  for (const np of newlyFoundAlerts) {
    const key = getOpportunityKey(np);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, np);
    }
  }

  const finalPicks = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  // 5. Guardar en disco y Supabase
  await saveCornersVipSnapshotAsync(targetDate, finalPicks, false);

  return {
    success: true,
    newAlerts: newlyFoundAlerts,
    totalAlerts: finalPicks.length,
    predictions: finalPicks,
    message:
      newlyFoundAlerts.length > 0
        ? `✓ Se descubrieron ${newlyFoundAlerts.length} nuevas alertas de Corners VIP para hoy.`
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
    avgProb: number;
    avgOdds: number;
  };
}> {
  const targetDate = dateStr || getEcuadorDateString();

  // 1. Auto-liquidar partidos finalizados en el snapshot
  await settleActiveSnapshotWithRealScores(targetDate, "corners_vip").catch(() => []);

  // 2. Cargar snapshot
  let picks =
    (await loadDailySnapshotAsync(targetDate, "corners_vip")) ||
    loadDailySnapshot(targetDate, "corners_vip") ||
    [];

  // 3. Si no hay picks o forceRefresh, buscar alertas automáticamente
  if (picks.length === 0 || forceRefresh) {
    const searchRes = await searchAndAddNewCornersVipAlerts(targetDate).catch(() => null);
    if (searchRes && searchRes.predictions.length > 0) {
      picks = searchRes.predictions;
    }
  }

  // Filtrar exclusivamente córners y asegurar banderas VIP
  const sanitizedPicks = picks
    .filter((p) => p.market === "Córners" || (p.selection || "").toLowerCase().includes("córner"))
    .map((p) => ({
      ...p,
      sport: "corners_vip" as any,
      source: "corners_vip" as const,
      isCornersVip: true,
      pickBadge: "corners_vip" as const,
      vipBadge: "Corners VIP",
    }))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  const total = sanitizedPicks.length;
  const won = sanitizedPicks.filter((p) => p.status === "won" || (p as any).result === "WON").length;
  const lost = sanitizedPicks.filter((p) => p.status === "lost" || (p as any).result === "LOST").length;
  const pending = total - (won + lost);
  const avgProb = total > 0 ? Math.round((sanitizedPicks.reduce((acc, p) => acc + (p.probability || 0), 0) / total) * 10) / 10 : 0;
  const avgOdds = total > 0 ? Math.round((sanitizedPicks.reduce((acc, p) => acc + (p.odds || 0), 0) / total) * 100) / 100 : 0;

  return {
    date: targetDate,
    count: total,
    predictions: sanitizedPicks,
    stats: {
      total,
      pending,
      won,
      lost,
      avgProb,
      avgOdds,
    },
  };
}
