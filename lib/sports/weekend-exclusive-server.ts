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
import { apiFootball, extractMarketOddsFromBookmaker, ApiFootballOddsItem } from './api-football';
import { auditPredictionsWithGeminiVeto } from '@/lib/ai/claude-analyst';

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
    const [fixtures, oddsList] = await Promise.all([
      apiFootball.getFixturesByDate(dateStr, 'America/Guayaquil').catch(() => []),
      apiFootball.getOddsByDate(dateStr, 'America/Guayaquil').catch(() => [] as ApiFootballOddsItem[]),
    ]);
    if (!Array.isArray(fixtures) || fixtures.length === 0) return [];

    const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
    if (Array.isArray(oddsList)) {
      for (const item of oddsList) {
        if (item.fixture?.id) {
          oddsMapByFixture[item.fixture.id] = item;
        }
      }
    }

    const candidates: MarketOpportunity[] = [];
    const usedTeams = new Set<string>();

    const seniorFixtures = fixtures.filter(isSeniorCompetitiveFixture);

    for (const item of seniorFixtures) {
      const hNorm = item.teams.home.name.toLowerCase();
      const aNorm = item.teams.away.name.toLowerCase();
      if (usedTeams.has(hNorm) || usedTeams.has(aNorm)) continue;

      const realOddsItem = oddsMapByFixture[item.fixture.id];
      const realMarketOdds = extractMarketOddsFromBookmaker(realOddsItem);

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
        marketOdds: realMarketOdds,
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
    let curatedPicks = protectedPicks.slice(0, dailyLimit);

    try {
      const vetoResult = await auditPredictionsWithGeminiVeto(curatedPicks, 'football');
      if (vetoResult?.approvedPicks && vetoResult.approvedPicks.length > 0) {
        curatedPicks = vetoResult.approvedPicks;
      }
    } catch (vetoErr) {
      console.warn('[WeekendExclusive] Gemini Veto daily fixtures warning:', vetoErr);
    }

    if (curatedPicks.length > 0) {
      try {
        if (!(process.env.VITEST || process.env.NODE_ENV === 'test')) {
          // Only save an initial daily snapshot IF no snapshot exists yet (never overwrite an existing snapshot)
          const existingSnapshot = (await loadDailySnapshotAsync(dateStr, 'football')) || loadDailySnapshot(dateStr, 'football');
          if (!existingSnapshot || existingSnapshot.length === 0) {
            saveDailySnapshot(dateStr, curatedPicks, 'football', false);
          }
        }
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
        const hasWeekendDays = parsed.picks.some((p) => p.dayOfWeek === 'friday' || p.dayOfWeek === 'saturday' || p.dayOfWeek === 'sunday');
        // Validar que las ligas sean de calidad (no copadas por Tier 4)
        const tier1Count = parsed.picks.filter((p) => (p.leagueTier || 3) === 1).length;
        if (hasWeekendDays && tier1Count >= 4) {
          parsed.cycle = cycle;
          return parsed;
        }
      }
    } catch {
      // Re-generar si lectura es inválida
    }
  }

  // 2. Compilar pronósticos curados de Viernes, Sábado y Domingo (Cartelera Completa Fin de Semana)
  const isHealthyDailySnapshot = (picks: MarketOpportunity[] | null): boolean => {
    if (!picks || !Array.isArray(picks) || picks.length === 0) return false;
    return !picks.some((p) => {
      const leg = (p.league || '').toLowerCase();
      const h = (p.homeTeam || '').toLowerCase();
      const a = (p.awayTeam || '').toLowerCase();
      return (
        isExcludedMatch(p.homeTeam, p.awayTeam, p.match) ||
        leg.includes('primavera') ||
        leg.includes('u18') ||
        leg.includes('u19') ||
        leg.includes('u20') ||
        leg.includes('u21') ||
        leg.includes('women') ||
        leg.includes('femen') ||
        h.includes('women') ||
        a.includes('women')
      );
    });
  };

  let friPicks = await loadDailySnapshotAsync(cycle.fridayDate, 'football');
  if (!isHealthyDailySnapshot(friPicks)) {
    friPicks = await fetchAndEvaluateDayFixtures(cycle.fridayDate);
  }

  let satPicks = await loadDailySnapshotAsync(cycle.saturdayDate, 'football');
  if (!isHealthyDailySnapshot(satPicks)) {
    satPicks = await fetchAndEvaluateDayFixtures(cycle.saturdayDate);
  }

  let sunPicks = await loadDailySnapshotAsync(cycle.sundayDate, 'football');
  if (!isHealthyDailySnapshot(sunPicks)) {
    sunPicks = await fetchAndEvaluateDayFixtures(cycle.sundayDate);
  }

  // 3. Preparar candidatos con su metadato de día (Viernes, Sábado o Domingo)
  const mapWithDayMeta = (picks: MarketOpportunity[], dayOfWeek: 'friday' | 'saturday' | 'sunday'): WeekendExclusivePick[] => {
    return (picks || [])
      .filter((p) => isWeekendExclusivePick(p) && p.odds >= 1.25 && p.odds <= 1.80)
      .map((p) => {
        const ruleMatch = getWeekendExclusiveRuleMatch(p)!;
        const dayLabel = dayOfWeek === 'friday'
          ? `Viernes ${cycle.fridayDate.split('-')[2]}`
          : dayOfWeek === 'saturday'
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

  // Deduplicación estricta por partido y equipos
  const deduplicatePicks = (list: WeekendExclusivePick[]): WeekendExclusivePick[] => {
    const seenTeams = new Set<string>();
    const seenMatches = new Set<string>();
    const result: WeekendExclusivePick[] = [];
    for (const p of list) {
      const h = (p.homeTeam || '').toLowerCase().trim();
      const a = (p.awayTeam || '').toLowerCase().trim();
      const mKey = `${h}-${a}`;
      if (seenTeams.has(h) || seenTeams.has(a) || seenMatches.has(mKey)) continue;
      seenTeams.add(h);
      seenTeams.add(a);
      seenMatches.add(mKey);
      result.push(p);
    }
    return result;
  };

  const qualifiedFri = deduplicatePicks(sortMatchesByTierAndMarket(mapWithDayMeta(friPicks || [], 'friday')));
  const qualifiedSat = deduplicatePicks(sortMatchesByTierAndMarket(mapWithDayMeta(satPicks || [], 'saturday')));
  const qualifiedSun = deduplicatePicks(sortMatchesByTierAndMarket(mapWithDayMeta(sunPicks || [], 'sunday')));

  // Aplicar protección de Tier 4 a cada día (máximo 1 viernes si hay pocos, 2 sábado y domingo)
  const cleanFri = applyTier4QuotaProtection(qualifiedFri, 1);
  const cleanSat = applyTier4QuotaProtection(qualifiedSat, 2);
  const cleanSun = applyTier4QuotaProtection(qualifiedSun, 2);

  // 4. Seleccionar exactamente 15 pronósticos con prioridad a partidos que AÚN NO COMIENZAN y mayor cuota a CÓRNERS (Rank #1)
  const nowMs = Date.now();
  const allCandidates = deduplicatePicks([
    ...qualifiedSat,
    ...qualifiedSun,
    ...qualifiedFri,
  ]);

  // Priorizar estrictamente partidos futuros / por comenzar (kickoff > now)
  const unstarted = allCandidates.filter((p) => p.kickoff && new Date(p.kickoff).getTime() > nowMs);
  const candidatePool = unstarted.length >= WEEKEND_EXCLUSIVE_TARGET_COUNT ? unstarted : allCandidates;

  // Clasificar por Mercados respetando la jerarquía oficial
  const cornersPool = applyTier4QuotaProtection(
    candidatePool.filter((p) => getMarketPriorityRank(p.market, p.selection) === 1),
    2
  );
  const bttsPool = applyTier4QuotaProtection(
    candidatePool.filter((p) => getMarketPriorityRank(p.market, p.selection) === 2),
    2
  );
  const goalsPool = applyTier4QuotaProtection(
    candidatePool.filter((p) => getMarketPriorityRank(p.market, p.selection) === 3),
    1
  );
  const localPool = applyTier4QuotaProtection(
    candidatePool.filter((p) => getMarketPriorityRank(p.market, p.selection) === 4),
    2
  );
  const awayPool = applyTier4QuotaProtection(
    candidatePool.filter((p) => getMarketPriorityRank(p.market, p.selection) === 5),
    1
  );

  const curatedPicks: WeekendExclusivePick[] = [];
  const chosenTeams = new Set<string>();

  const takeFromPool = (pool: WeekendExclusivePick[], maxCount: number) => {
    let taken = 0;
    for (const p of pool) {
      if (taken >= maxCount || curatedPicks.length >= WEEKEND_EXCLUSIVE_TARGET_COUNT) break;
      const h = (p.homeTeam || '').toLowerCase().trim();
      const a = (p.awayTeam || '').toLowerCase().trim();
      if (chosenTeams.has(h) || chosenTeams.has(a)) continue;
      chosenTeams.add(h);
      chosenTeams.add(a);
      curatedPicks.push(p);
      taken++;
    }
  };

  // Cuotas de Mercado oficiales SmartBetBot:
  // 1: Córners (Dominante: 40-47% del slate -> hasta 7 selecciones)
  // 2: Ambos Equipos Anotan (30-33% del slate -> hasta 5 selecciones)
  // 3: Over Goles (hasta 3 selecciones)
  // 4: Ganador Local (hasta 4 selecciones)
  // 5: Ganador Visitante (hasta 1 selección)
  takeFromPool(cornersPool, 7);
  takeFromPool(bttsPool, 5);
  takeFromPool(goalsPool, 3);
  takeFromPool(localPool, 4);
  takeFromPool(awayPool, 1);

  // Relleno dinámico si faltasen selecciones en riguroso orden de mercados (Córners > BTTS > Goles > 1X2)
  if (curatedPicks.length < WEEKEND_EXCLUSIVE_TARGET_COUNT) {
    takeFromPool(cornersPool, WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length);
    takeFromPool(bttsPool, WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length);
    takeFromPool(goalsPool, WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length);
    takeFromPool(localPool, WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length);
    takeFromPool(awayPool, WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length);
  }

  // Re-ordenar el conjunto global respetando Tiers y Mercados (Córners > BTTS > Goles > 1X2)
  const finalOrdered = sortMatchesByTierAndMarket(curatedPicks).map((p, idx) => ({
    ...p,
    weekendOrder: idx + 1,
  }));

  // Auditoría con Agente IA Google Gemini ("Abogado del Diablo" / Veto Táctico)
  // Idéntico al estándar cuantitativo de Pre-Match (db.ts) y Corners VIP
  let auditedWeekendPicks: WeekendExclusivePick[] = finalOrdered;
  try {
    const vetoResult = await auditPredictionsWithGeminiVeto(finalOrdered, 'football');
    if (vetoResult?.approvedPicks && vetoResult.approvedPicks.length > 0) {
      const auditMap = new Map(vetoResult.approvedPicks.map((p) => [String(p.fixtureId), p]));
      auditedWeekendPicks = finalOrdered.map((p) => {
        const audited = auditMap.get(String(p.fixtureId));
        return audited
          ? {
              ...p,
              explanation: audited.explanation,
              confidence: audited.confidence || p.confidence,
            }
          : p;
      });
    }
  } catch (vetoErr) {
    console.warn('[WeekendExclusive] Gemini Veto audit warning:', vetoErr);
  }

  // 5. Estadísticas de la edición
  const stats = {
    totalPicks: auditedWeekendPicks.length,
    avgProbability:
      auditedWeekendPicks.length > 0
        ? Math.round(
            (auditedWeekendPicks.reduce((acc, p) => acc + (p.probability || 0), 0) / auditedWeekendPicks.length) * 10
          ) / 10
        : 0,
    avgOdds:
      auditedWeekendPicks.length > 0
        ? Math.round(
            (auditedWeekendPicks.reduce((acc, p) => acc + (p.odds || 0), 0) / auditedWeekendPicks.length) * 100
          ) / 100
        : 0,
    byRule: {
      corners: auditedWeekendPicks.filter((p) => p.ruleMatch.ruleId === 'corners').length,
      btts: auditedWeekendPicks.filter((p) => p.ruleMatch.ruleId === 'btts').length,
      goals: auditedWeekendPicks.filter((p) => p.ruleMatch.ruleId === 'goals').length,
      local: auditedWeekendPicks.filter((p) => p.ruleMatch.ruleId === 'local').length,
      away: auditedWeekendPicks.filter((p) => p.ruleMatch.ruleId === 'away').length,
    },
    byDay: {
      friday: auditedWeekendPicks.filter((p) => p.dayOfWeek === 'friday').length,
      saturday: auditedWeekendPicks.filter((p) => p.dayOfWeek === 'saturday').length,
      sunday: auditedWeekendPicks.filter((p) => p.dayOfWeek === 'sunday').length,
    },
  };

  const slate: WeekendSlate = {
    cycle,
    picks: auditedWeekendPicks,
    targetCount: WEEKEND_EXCLUSIVE_TARGET_COUNT,
    stats,
    generatedAt: new Date().toISOString(),
  };

  // Guardar en disco (nunca escribir archivos de producción durante tests)
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return slate;
  }

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
