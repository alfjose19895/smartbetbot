import fs from 'fs';
import path from 'path';
import {
  WEEKEND_EXCLUSIVE_TARGET_COUNT,
  WeekendCycleInfo,
  WeekendExclusivePick,
  WeekendSlate,
  getWeekendCycleInfo,
  getWeekendExclusiveRuleMatch,
  isWeekendExclusivePick,
  getPickDayOfWeek,
} from './weekend-exclusive';
import {
  MarketOpportunity,
  evaluateFixturePrediction,
  isExcludedMatch,
  getMarketPriorityRank,
} from './prediction-engine';
import {
  loadDailySnapshot,
  loadDailySnapshotAsync,
  getStoredPredictions,
  saveDailySnapshot,
  isCuratedLeague,
  isYouthOrReserveFixture,
  getDailyAlertLimit,
} from './db';
import { apiFootball } from './api-football';

export * from './weekend-exclusive';

/**
 * Directorio de almacenamiento para las ediciones de fin de semana
 */
function getWeekendStorageDir(): string {
  const dir = path.join(process.cwd(), 'data', 'weekend_exclusives');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Orden canónico SmartBetBot:
 * 1) Prioridad de Ligas: Tier 1 > Tier 2 > Tier 3 > Tier 4
 * 2) Prioridad de Mercados: Córners (1) > Ambos Anotan (2) > Over Goles (3) > Local (4) > Visitante (5)
 * 3) Mayor Probabilidad Matemática
 * 4) SmartScore / Edge
 */
export function sortMatchesByTierAndMarket<T extends MarketOpportunity>(picks: T[]): T[] {
  return [...picks].sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;

    const aRank = getMarketPriorityRank(a.market, a.selection);
    const bRank = getMarketPriorityRank(b.market, b.selection);
    if (aRank !== bRank) return aRank - bRank;

    if (b.probability !== a.probability) return b.probability - a.probability;

    const scoreA = ((a as unknown as { smartScore?: number }).smartScore) || a.edge || 0;
    const scoreB = ((b as unknown as { smartScore?: number }).smartScore) || b.edge || 0;
    return scoreB - scoreA;
  });
}

/**
 * Protección de cuota para ligas exóticas / menores (Tier 4):
 * Cuando existen ligas de primer nivel (Tier 1 o Tier 2), se limita Tier 4 a máximo 2 selecciones.
 */
export function applyTier4QuotaProtection<T extends MarketOpportunity>(picks: T[], maxTier4 = 2): T[] {
  const hasElite = picks.some((p) => (p.leagueTier || 3) <= 2);
  let tier4Count = 0;
  return picks.filter((p) => {
    const tier = p.leagueTier || 3;
    if (hasElite && tier >= 4) {
      if (tier4Count >= maxTier4) return false;
      tier4Count++;
    }
    return true;
  });
}

/**
 * Filtro estricto para partidos de fútbol profesional masculino senior:
 * Excluye ligas juveniles (U17/U18/U19/U20/U21/U23), filiales/reservas (II, 2, B), ligas amateur y regionales.
 */
export function isSeniorCompetitiveFixture(item: any): boolean {
  if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name) return false;
  const legName = (item.league?.name || '').toLowerCase();
  const hName = (item.teams?.home?.name || '').toLowerCase();
  const aName = (item.teams?.away?.name || '').toLowerCase();

  if (
    legName.includes('primavera') ||
    legName.includes('u17') ||
    legName.includes('u18') ||
    legName.includes('u19') ||
    legName.includes('u20') ||
    legName.includes('u21') ||
    legName.includes('u23') ||
    legName.includes('next pro') ||
    legName.includes('reserve') ||
    legName.includes('youth') ||
    legName.includes('juvenil') ||
    legName.includes('regional') ||
    legName.includes('amateur')
  ) {
    return false;
  }

  if (
    hName.endsWith(' ii') ||
    hName.endsWith(' 2') ||
    hName.endsWith(' b') ||
    aName.endsWith(' ii') ||
    aName.endsWith(' 2') ||
    aName.endsWith(' b')
  ) {
    return false;
  }

  if (
    hName.includes(' u18') ||
    hName.includes(' u19') ||
    hName.includes(' u20') ||
    hName.includes(' u21') ||
    aName.includes(' u18') ||
    aName.includes(' u19') ||
    aName.includes(' u20') ||
    aName.includes(' u21')
  ) {
    return false;
  }

  if (
    hName.includes('women') ||
    aName.includes('women') ||
    hName.endsWith(' w') ||
    aName.endsWith(' w') ||
    legName.includes('women') ||
    legName.includes('femen')
  ) {
    return false;
  }

  if (isExcludedMatch(item.teams.home.name, item.teams.away.name)) return false;

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

  if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) return false;

  const shortStatus = item.fixture.status?.short || 'NS';
  if (['PST', 'CANC', 'ABD', 'AWD', 'WO', 'POST'].includes(shortStatus)) return false;

  return true;
}

/**
 * Obtiene, evalúa y cura rigurosamente los fixtures de una fecha desde la API oficial.
 * Guarda en disco exactamente el número objetivo diario (10 a 12 picks) respetando Tiers y Mercados.
 */
export async function fetchAndEvaluateDayFixtures(dateStr: string): Promise<MarketOpportunity[]> {
  try {
    const fixtures = await apiFootball.getFixturesByDate(dateStr, 'America/Guayaquil');
    if (!Array.isArray(fixtures) || fixtures.length === 0) return [];

    const candidates: MarketOpportunity[] = [];
    const usedTeams = new Set<string>();

    const seniorFixtures = fixtures.filter(isSeniorCompetitiveFixture);

    for (const item of seniorFixtures) {
      const hNorm = item.teams.home.name.toLowerCase();
      const aNorm = item.teams.away.name.toLowerCase();
      if (usedTeams.has(hNorm) || usedTeams.has(aNorm)) continue;

      const evaluated = evaluateFixturePrediction({
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
      });

      // Ordenar las opciones de este partido por prioridad de mercado (Córners > BTTS > Goles > 1X2)
      const validOptions = evaluated.filter(
        (p) => isWeekendExclusivePick(p) && p.odds >= 1.25 && p.odds <= 1.80
      );

      if (validOptions.length > 0) {
        validOptions.sort((a, b) => {
          const rA = getMarketPriorityRank(a.market, a.selection);
          const rB = getMarketPriorityRank(b.market, b.selection);
          if (rA !== rB) return rA - rB;
          return b.probability - a.probability;
        });

        const bestPick = validOptions[0];
        candidates.push(bestPick);
        usedTeams.add(hNorm);
        usedTeams.add(aNorm);
      }
    }

    // Ordenar rigurosamente por Tier y Jerarquía de Mercados
    const sorted = sortMatchesByTierAndMarket(candidates);
    const protectedPicks = applyTier4QuotaProtection(sorted, 2);

    // Limitar al rango diario oficial: 10 a 12 selecciones
    const dailyLimit = getDailyAlertLimit();
    const curatedPicks = protectedPicks.slice(0, dailyLimit);

    if (curatedPicks.length > 0) {
      try {
        saveDailySnapshot(dateStr, curatedPicks, 'football');
      } catch (saveErr) {
        console.warn(`[WeekendExclusive] Error guardando daily snapshot para ${dateStr}:`, saveErr);
      }
    }

    return curatedPicks;
  } catch (err) {
    console.warn(`[WeekendExclusive] Error consultando fixtures para ${dateStr}:`, err);
    return [];
  }
}

/**
 * Obtiene o compila el conjunto de 15 pronósticos de élite para el fin de semana.
 */
export async function getWeekendExclusiveSlate(options?: {
  refDate?: Date | number;
  forceRefresh?: boolean;
}): Promise<WeekendSlate> {
  const cycle: WeekendCycleInfo = getWeekendCycleInfo(options?.refDate);
  const storageDir = getWeekendStorageDir();
  const filePath = path.join(storageDir, `weekend_${cycle.fridayDate}.json`);

  // 1. Si no es forceRefresh y el archivo existe, retornar slate cacheado si tiene formato válido
  if (!options?.forceRefresh && fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed: WeekendSlate = JSON.parse(content);
      if (Array.isArray(parsed.picks) && parsed.picks.length > 0) {
        const hasSatSun = parsed.picks.some((p) => p.dayOfWeek === 'saturday' || p.dayOfWeek === 'sunday');
        // Validar que las ligas sean de calidad (no copadas por Tier 4)
        const tier1Count = parsed.picks.filter((p) => (p.leagueTier || 3) === 1).length;
        if (hasSatSun && tier1Count >= 4) {
          parsed.cycle = cycle;
          return parsed;
        }
      }
    } catch {
      // Re-generar si lectura es inválida
    }
  }

  // 2. Compilar pronósticos curados de Sábado y Domingo (prioridad central de fin de semana)
  let satPicks = await loadDailySnapshotAsync(cycle.saturdayDate, 'football');
  if (!satPicks || satPicks.length === 0 || satPicks.length > 20) {
    satPicks = await fetchAndEvaluateDayFixtures(cycle.saturdayDate);
  }

  let sunPicks = await loadDailySnapshotAsync(cycle.sundayDate, 'football');
  if (!sunPicks || sunPicks.length === 0 || sunPicks.length > 20) {
    sunPicks = await fetchAndEvaluateDayFixtures(cycle.sundayDate);
  }

  // Si sábado o domingo quedaron cortos, complementar
  if (!satPicks || satPicks.length === 0) {
    satPicks = await fetchAndEvaluateDayFixtures(cycle.saturdayDate);
  }
  if (!sunPicks || sunPicks.length === 0) {
    sunPicks = await fetchAndEvaluateDayFixtures(cycle.sundayDate);
  }

  // 3. Preparar candidatos con su metadato de día
  const mapWithDayMeta = (picks: MarketOpportunity[], dayOfWeek: 'saturday' | 'sunday'): WeekendExclusivePick[] => {
    return (picks || [])
      .filter((p) => isWeekendExclusivePick(p) && p.odds >= 1.25 && p.odds <= 1.80)
      .map((p) => {
        const ruleMatch = getWeekendExclusiveRuleMatch(p)!;
        const dayLabel = dayOfWeek === 'saturday'
          ? `Sábado ${cycle.saturdayDate.split('-')[2]}`
          : `Domingo ${cycle.sundayDate.split('-')[2]}`;
        return {
          ...p,
          ruleMatch,
          dayOfWeek,
          dayLabel,
          weekendOrder: 0,
        };
      });
  };

  const qualifiedSat = sortMatchesByTierAndMarket(mapWithDayMeta(satPicks || [], 'saturday'));
  const qualifiedSun = sortMatchesByTierAndMarket(mapWithDayMeta(sunPicks || [], 'sunday'));

  // Aplicar protección de Tier 4 a cada día
  const cleanSat = applyTier4QuotaProtection(qualifiedSat, 2);
  const cleanSun = applyTier4QuotaProtection(qualifiedSun, 2);

  // 4. Seleccionar exactamente 15 pronósticos equilibrados (8 sábado + 7 domingo)
  const satQuota = Math.min(cleanSat.length, 8);
  const sunQuota = Math.min(cleanSun.length, WEEKEND_EXCLUSIVE_TARGET_COUNT - satQuota);

  const curatedPicks: WeekendExclusivePick[] = [
    ...cleanSat.slice(0, satQuota),
    ...cleanSun.slice(0, sunQuota),
  ];

  // Si faltasen picks para completar los 15, rellenar de la bolsa restante de sábado o domingo
  if (curatedPicks.length < WEEKEND_EXCLUSIVE_TARGET_COUNT) {
    const remainingPool = sortMatchesByTierAndMarket([
      ...cleanSat.slice(satQuota),
      ...cleanSun.slice(sunQuota),
    ]);
    const needed = WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length;
    curatedPicks.push(...remainingPool.slice(0, needed));
  }

  // Re-ordenar el conjunto global respetando Tiers y Mercados
  const finalOrdered = sortMatchesByTierAndMarket(curatedPicks).map((p, idx) => ({
    ...p,
    weekendOrder: idx + 1,
  }));

  // 5. Estadísticas de la edición
  const stats = {
    totalPicks: finalOrdered.length,
    avgProbability:
      finalOrdered.length > 0
        ? Math.round(
            (finalOrdered.reduce((acc, p) => acc + (p.probability || 0), 0) / finalOrdered.length) * 10
          ) / 10
        : 0,
    avgOdds:
      finalOrdered.length > 0
        ? Math.round(
            (finalOrdered.reduce((acc, p) => acc + (p.odds || 0), 0) / finalOrdered.length) * 100
          ) / 100
        : 0,
    byRule: {
      corners: finalOrdered.filter((p) => p.ruleMatch.ruleId === 'corners').length,
      btts: finalOrdered.filter((p) => p.ruleMatch.ruleId === 'btts').length,
      goals: finalOrdered.filter((p) => p.ruleMatch.ruleId === 'goals').length,
      local: finalOrdered.filter((p) => p.ruleMatch.ruleId === 'local').length,
      away: finalOrdered.filter((p) => p.ruleMatch.ruleId === 'away').length,
    },
    byDay: {
      friday: finalOrdered.filter((p) => p.dayOfWeek === 'friday').length,
      saturday: finalOrdered.filter((p) => p.dayOfWeek === 'saturday').length,
      sunday: finalOrdered.filter((p) => p.dayOfWeek === 'sunday').length,
    },
  };

  const slate: WeekendSlate = {
    cycle,
    picks: finalOrdered,
    targetCount: WEEKEND_EXCLUSIVE_TARGET_COUNT,
    stats,
    generatedAt: new Date().toISOString(),
  };

  // Guardar en disco
  if (finalOrdered.length > 0) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(slate, null, 2), 'utf-8');
    } catch (saveErr) {
      console.warn('[WeekendExclusive] Error guardando slate en disco:', saveErr);
    }
  }

  return slate;
}

/**
 * Lista las ediciones de fin de semana guardadas en histórico
 */
export function listWeekendEditions(): string[] {
  try {
    const dir = getWeekendStorageDir();
    const files = fs.readdirSync(dir);
    return files
      .filter((f) => f.startsWith('weekend_') && f.endsWith('.json'))
      .map((f) => f.replace('weekend_', '').replace('.json', ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
