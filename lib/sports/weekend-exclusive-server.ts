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
} from './prediction-engine';
import {
  loadDailySnapshot,
  loadDailySnapshotAsync,
  getStoredPredictions,
  saveDailySnapshot,
  isCuratedLeague,
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
 * Obtiene y evalúa los fixtures de una fecha directamente desde la API oficial
 * generando su snapshot correspondiente en disco.
 */
export async function fetchAndEvaluateDayFixtures(dateStr: string): Promise<MarketOpportunity[]> {
  try {
    const fixtures = await apiFootball.getFixturesByDate(dateStr, 'America/Guayaquil');
    if (!Array.isArray(fixtures) || fixtures.length === 0) return [];

    const opps: MarketOpportunity[] = [];
    const usedTeams = new Set<string>();

    for (const item of fixtures) {
      if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name) continue;
      if (isExcludedMatch(item.teams.home.name, item.teams.away.name)) continue;
      if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) continue;

      const shortStatus = item.fixture.status?.short || 'NS';
      if (['PST', 'CANC', 'ABD', 'AWD', 'WO', 'POST'].includes(shortStatus)) continue;

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

      for (const p of evaluated) {
        if (isWeekendExclusivePick(p)) {
          opps.push(p);
          usedTeams.add(hNorm);
          usedTeams.add(aNorm);
          break; // 1 mejor pick por partido
        }
      }
    }

    // Guardar snapshot de la fecha si encontramos oportunidades
    if (opps.length > 0) {
      try {
        saveDailySnapshot(dateStr, opps, 'football');
      } catch (saveErr) {
        console.warn(`[WeekendExclusive] Error guardando daily snapshot para ${dateStr}:`, saveErr);
      }
    }

    return opps;
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

  // 1. Si no es forceRefresh y el archivo existe, retornar slate cacheado
  if (!options?.forceRefresh && fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed: WeekendSlate = JSON.parse(content);
      // Validar que el archivo contenga pronósticos y tenga cobertura de fin de semana
      if (Array.isArray(parsed.picks) && parsed.picks.length > 0) {
        const hasSatSun = parsed.picks.some((p) => p.dayOfWeek === 'saturday' || p.dayOfWeek === 'sunday');
        if (hasSatSun) {
          parsed.cycle = cycle;
          return parsed;
        }
      }
    } catch {
      // Si falla lectura, re-generar
    }
  }

  // 2. Compilar pronósticos de Sábado y Domingo (y Viernes si aplica)
  const candidatePicks: MarketOpportunity[] = [];

  const daysToLoad = [cycle.saturdayDate, cycle.sundayDate, cycle.fridayDate];

  for (const dateStr of daysToLoad) {
    let daySnap = await loadDailySnapshotAsync(dateStr, 'football');
    if (!daySnap || daySnap.length === 0) {
      daySnap = loadDailySnapshot(dateStr, 'football');
    }

    // Si no existe snapshot en disco para sábado o domingo, consultarlo directamente
    if ((!daySnap || daySnap.length === 0) && (dateStr === cycle.saturdayDate || dateStr === cycle.sundayDate)) {
      daySnap = await fetchAndEvaluateDayFixtures(dateStr);
    }

    if (Array.isArray(daySnap) && daySnap.length > 0) {
      candidatePicks.push(...daySnap);
    }
  }

  // Si aún faltan candidatos, complementar con los almacenados de hoy
  if (candidatePicks.length < WEEKEND_EXCLUSIVE_TARGET_COUNT) {
    const stored = getStoredPredictions('football');
    if (Array.isArray(stored)) {
      for (const p of stored) {
        if (!candidatePicks.some((c) => (c.id && c.id === p.id) || (c.match === p.match && c.market === p.market))) {
          candidatePicks.push(p);
        }
      }
    }
  }

  // 3. Filtrar estrictamente con las 5 reglas de Destacados para fútbol
  const qualifiedSat: WeekendExclusivePick[] = [];
  const qualifiedSun: WeekendExclusivePick[] = [];
  const qualifiedFri: WeekendExclusivePick[] = [];
  const qualifiedMap = new Map<string, WeekendExclusivePick>();

  for (const pick of candidatePicks) {
    if (!isWeekendExclusivePick(pick)) continue;
    const ruleMatch = getWeekendExclusiveRuleMatch(pick);
    if (!ruleMatch) continue;

    const key = `${pick.homeTeam}-${pick.awayTeam}-${pick.market}-${pick.selection}`;
    if (qualifiedMap.has(key)) continue;

    const { dayOfWeek, dayLabel } = getPickDayOfWeek(
      pick,
      cycle.fridayDate,
      cycle.saturdayDate,
      cycle.sundayDate
    );

    const weekendPick: WeekendExclusivePick = {
      ...pick,
      ruleMatch,
      dayOfWeek,
      dayLabel,
      weekendOrder: 0,
    };

    qualifiedMap.set(key, weekendPick);

    if (dayOfWeek === 'saturday') qualifiedSat.push(weekendPick);
    else if (dayOfWeek === 'sunday') qualifiedSun.push(weekendPick);
    else qualifiedFri.push(weekendPick);
  }

  // 4. Ordenar cada lista por mayor convicción cuantitativa
  const sortByConviction = (a: WeekendExclusivePick, b: WeekendExclusivePick) => {
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    const scoreA = ((a as unknown as { smartScore?: number }).smartScore) || a.edge || 0;
    const scoreB = ((b as unknown as { smartScore?: number }).smartScore) || b.edge || 0;
    return scoreB - scoreA;
  };

  qualifiedSat.sort(sortByConviction);
  qualifiedSun.sort(sortByConviction);
  qualifiedFri.sort(sortByConviction);

  // 5. Balancear selecciones priorizando Sábado y Domingo
  let curatedPicks: WeekendExclusivePick[] = [];

  if (qualifiedSat.length > 0 || qualifiedSun.length > 0) {
    // Si tenemos partidos de sábado y domingo, repartir equilibradamente
    const satQuota = Math.min(qualifiedSat.length, 8);
    const sunQuota = Math.min(qualifiedSun.length, WEEKEND_EXCLUSIVE_TARGET_COUNT - satQuota);

    curatedPicks.push(...qualifiedSat.slice(0, satQuota));
    curatedPicks.push(...qualifiedSun.slice(0, sunQuota));

    // Si aún no llegamos a 15, completar con los restantes de sábado/domingo
    if (curatedPicks.length < WEEKEND_EXCLUSIVE_TARGET_COUNT) {
      const remainingSat = qualifiedSat.slice(satQuota);
      const remainingSun = qualifiedSun.slice(sunQuota);
      const remainingSatSun = [...remainingSat, ...remainingSun].sort(sortByConviction);
      const needed = WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length;
      curatedPicks.push(...remainingSatSun.slice(0, needed));
    }

    // Si aún faltara para 15, incorporar los mejores de viernes
    if (curatedPicks.length < WEEKEND_EXCLUSIVE_TARGET_COUNT && qualifiedFri.length > 0) {
      const needed = WEEKEND_EXCLUSIVE_TARGET_COUNT - curatedPicks.length;
      curatedPicks.push(...qualifiedFri.slice(0, needed));
    }
  } else {
    // Fallback general si solo hubiesen de viernes
    curatedPicks = Array.from(qualifiedMap.values())
      .sort(sortByConviction)
      .slice(0, WEEKEND_EXCLUSIVE_TARGET_COUNT);
  }

  // Asignar orden final
  curatedPicks = curatedPicks.map((pick, idx) => ({
    ...pick,
    weekendOrder: idx + 1,
  }));

  // 6. Estadísticas de la edición
  const stats = {
    totalPicks: curatedPicks.length,
    avgProbability:
      curatedPicks.length > 0
        ? Math.round(
            (curatedPicks.reduce((acc, p) => acc + (p.probability || 0), 0) / curatedPicks.length) * 10
          ) / 10
        : 0,
    avgOdds:
      curatedPicks.length > 0
        ? Math.round(
            (curatedPicks.reduce((acc, p) => acc + (p.odds || 0), 0) / curatedPicks.length) * 100
          ) / 100
        : 0,
    byRule: {
      corners: curatedPicks.filter((p) => p.ruleMatch.ruleId === 'corners').length,
      btts: curatedPicks.filter((p) => p.ruleMatch.ruleId === 'btts').length,
      goals: curatedPicks.filter((p) => p.ruleMatch.ruleId === 'goals').length,
      local: curatedPicks.filter((p) => p.ruleMatch.ruleId === 'local').length,
      away: curatedPicks.filter((p) => p.ruleMatch.ruleId === 'away').length,
    },
    byDay: {
      friday: curatedPicks.filter((p) => p.dayOfWeek === 'friday').length,
      saturday: curatedPicks.filter((p) => p.dayOfWeek === 'saturday').length,
      sunday: curatedPicks.filter((p) => p.dayOfWeek === 'sunday').length,
    },
  };

  const slate: WeekendSlate = {
    cycle,
    picks: curatedPicks,
    targetCount: WEEKEND_EXCLUSIVE_TARGET_COUNT,
    stats,
    generatedAt: new Date().toISOString(),
  };

  // Guardar en disco
  if (curatedPicks.length > 0) {
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
