import fs from "fs";
import path from "path";
import {
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
  // Incluir TODAS las ligas profesionales del mundo con cuotas y telemetría de saques de esquina
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

    // Filtrar estrictamente solo oportunidades de córners en modalidad OVER respetando Tiers de Ligas
    const cornerOpps = opportunities.filter((p) => {
      const isCorner = p.market === "Córners" || (p.selection || "").toLowerCase().includes("córner");
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

      const tier = p.leagueTier || 3;
      // Umbrales calibrados por Tier de Liga
      const meetsTierThreshold =
        tier === 1 ? (p.probability >= 62 && (p.edge || 0) >= 1.5) :
        tier === 2 ? (p.probability >= 64 && (p.edge || 0) >= 2.0) :
        tier === 3 ? (p.probability >= 68 && (p.edge || 0) >= 2.5) :
        (p.probability >= 72 && (p.edge || 0) >= 3.5);

      return isCorner && !isUnder && isOver && meetsTierThreshold && p.odds >= 1.25 && p.odds <= 2.05;
    });

    if (cornerOpps.length > 0) {
      // Elegir la opción de mayor probabilidad y mejor edge
      cornerOpps.sort((a, b) => b.probability - a.probability || b.edge - a.edge);
      const bestCorner = cornerOpps[0];

      const isElite = isElitePick(bestCorner);
      let pickBadge: "elite" | "valor" | "bomba" | "estandar" = "estandar";
      if (isElite) {
        pickBadge = "elite";
      } else if (bestCorner.odds >= 2.00 && (bestCorner.edge || 0) >= 2.0) {
        pickBadge = "bomba";
      } else if (bestCorner.probability >= 62.0 && (bestCorner.edge || 0) >= 2.0) {
        pickBadge = "valor";
      } else if (bestCorner.odds >= 1.65 && (bestCorner.edge || 0) >= 1.5) {
        pickBadge = "valor";
      }

      const taggedPick: MarketOpportunity = {
        ...bestCorner,
        sport: "corners_vip" as any,
        source: "corners_vip",
        isCornersVip: true,
        pickBadge,
        isElite,
        vipBadge: "Corners VIP",
        status: "pending",
        isDestacado: bestCorner.probability >= 70,
        destacadoRule: "Alta de Córners (≥ 70%)",
        confidence: bestCorner.probability >= 70 ? "Muy Alta" : bestCorner.probability >= 58 ? "Alta" : "Media",
        isNewlyDiscovered: true,
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

  // REGLA DE CANTIDADES (10 a 12 iniciales, y al buscar alertas se agregan más):
  // Si no hay snapshot previo: seleccionar entre 10 y 12 alertas iniciales (máximo 12 de las más calificadas).
  // Si ya hay cartelera existente y se buscan alertas: agregar un lote adicional de hasta 6 alertas.
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
      console.warn("[Corners VIP] Gemini Veto audit warning:", vetoErr);
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

  // Ordenamiento canónico: Tier de Liga (T1 > T2 > T3 > T4) > Élite/Destacado > Probabilidad > Edge
  const finalPicks = Array.from(mergedMap.values()).sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;

    const aRank = a.isElite ? 1 : a.isDestacado ? 2 : a.pickBadge === "valor" ? 3 : a.pickBadge === "bomba" ? 4 : 5;
    const bRank = b.isElite ? 1 : b.isDestacado ? 2 : b.pickBadge === "valor" ? 3 : b.pickBadge === "bomba" ? 4 : 5;
    if (aRank !== bRank) return aRank - bRank;

    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.edge || 0) - (a.edge || 0);
  });

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

  // 6. Guardar en disco y Supabase
  await saveCornersVipSnapshotAsync(targetDate, finalPicks, false);

  if (!isTargetToday) {
    await settleActiveSnapshotWithRealScores(targetDate, "corners_vip").catch(() => []);
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

  // Filtrar exclusivamente córners en modalidad OVER (estrictamente no under) y asegurar banderas VIP
  const sanitizedPicks = picks
    .filter((p) => {
      const isCorner = p.market === "Córners" || (p.selection || "").toLowerCase().includes("córner");
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

  const total = sanitizedPicks.length;
  const won = sanitizedPicks.filter((p) => p.status === "won" || (p as any).result === "WON").length;
  const lost = sanitizedPicks.filter((p) => p.status === "lost" || (p as any).result === "LOST").length;
  const settled = won + lost;
  const pending = total - settled;
  const winRate = settled > 0 ? Math.round((won / settled) * 100) : 0;
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
      winRate,
      avgProb,
      avgOdds,
    },
  };
}

