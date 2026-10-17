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
import { MarketOpportunity } from './prediction-engine';
import {
  loadDailySnapshot,
  loadDailySnapshotAsync,
  getStoredPredictions,
} from './db';

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
      // Actualizar info dinámica de ciclo en caso de cambio de hora
      parsed.cycle = cycle;
      return parsed;
    } catch {
      // Si falla lectura, re-generar
    }
  }

  // 2. Compilar pronósticos de Viernes, Sábado y Domingo
  const candidatePicks: MarketOpportunity[] = [];

  const daysToLoad = [cycle.fridayDate, cycle.saturdayDate, cycle.sundayDate];

  for (const dateStr of daysToLoad) {
    let daySnap = await loadDailySnapshotAsync(dateStr, 'football');
    if (!daySnap || daySnap.length === 0) {
      daySnap = loadDailySnapshot(dateStr, 'football');
    }
    if (Array.isArray(daySnap) && daySnap.length > 0) {
      candidatePicks.push(...daySnap);
    }
  }

  // Si no hay suficientes en los 3 días de snapshot, incorporar los almacenados de hoy
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

    qualifiedMap.set(key, {
      ...pick,
      ruleMatch,
      dayOfWeek,
      dayLabel,
      weekendOrder: 0,
    });
  }

  // 4. Ordenar por convicción cuantitativa:
  // Mayor probabilidad, mayor edge, y cuotas óptimas
  const sortedPicks = Array.from(qualifiedMap.values()).sort((a, b) => {
    // 1. Probabilidad matemática
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    // 2. SmartScore o Edge
    const scoreA = ((a as unknown as { smartScore?: number }).smartScore) || a.edge || 0;
    const scoreB = ((b as unknown as { smartScore?: number }).smartScore) || b.edge || 0;
    return scoreB - scoreA;
  });

  // Limitar al objetivo de 15 pronósticos de fin de semana
  const curatedPicks: WeekendExclusivePick[] = sortedPicks
    .slice(0, WEEKEND_EXCLUSIVE_TARGET_COUNT)
    .map((pick, idx) => ({
      ...pick,
      weekendOrder: idx + 1,
    }));

  // 5. Estadísticas de la edición
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

  // Guardar en disco si hay pronósticos compilados
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
