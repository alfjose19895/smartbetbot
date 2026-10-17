import fs from 'fs';
import path from 'path';
import {
  MarketOpportunity,
  DestacadoRuleMatch,
  getDestacadoRuleMatch,
  isDestacadoPick,
} from './prediction-engine';
import {
  getEcuadorDateString,
  loadDailySnapshot,
  loadDailySnapshotAsync,
  getStoredPredictions,
} from './db';

export const WEEKEND_EXCLUSIVE_MODULE_NAME = 'Exclusivas Fin de Semana';
export const WEEKEND_EXCLUSIVE_TARGET_COUNT = 15;

export interface WeekendRuleDefinition {
  id: 'corners' | 'btts' | 'goals' | 'local' | 'away';
  name: string;
  minProb: number;
  icon: string;
  description: string;
  badgeText: string;
}

/**
 * REGLAS OFICIALES EXCLUSIVAS FIN DE SEMANA
 * • Alta de Córners: Probabilidad >= 70%
 * • Ambos anotan: Probabilidad >= 58%
 * • Alta de goles: Probabilidad >= 72%
 * • Ganador local: Probabilidad >= 58%
 * • Ganador Visitante: Probabilidad >= 71%
 */
export const WEEKEND_EXCLUSIVE_RULES: WeekendRuleDefinition[] = [
  {
    id: 'corners',
    name: 'Alta de Córners',
    minProb: 70,
    icon: '🚩',
    description: 'Probabilidad ≥ 70%',
    badgeText: 'Alta Córners (≥ 70%)',
  },
  {
    id: 'btts',
    name: 'Ambos Anotan',
    minProb: 58,
    icon: '⚽',
    description: 'Probabilidad ≥ 58%',
    badgeText: 'Ambos Anotan (≥ 58%)',
  },
  {
    id: 'goals',
    name: 'Alta de Goles',
    minProb: 72,
    icon: '🥅',
    description: 'Probabilidad ≥ 72%',
    badgeText: 'Alta Goles (≥ 72%)',
  },
  {
    id: 'local',
    name: 'Ganador Local',
    minProb: 58,
    icon: '🏠',
    description: 'Probabilidad ≥ 58%',
    badgeText: 'Ganador Local (≥ 58%)',
  },
  {
    id: 'away',
    name: 'Ganador Visitante',
    minProb: 71,
    icon: '✈️',
    description: 'Probabilidad ≥ 71%',
    badgeText: 'Ganador Visitante (≥ 71%)',
  },
];

export interface WeekendCycleInfo {
  isUnlocked: boolean;
  fridayDate: string;
  saturdayDate: string;
  sundayDate: string;
  cycleId: string;
  unlockTimeIso: string;
  msUntilUnlock: number;
  countdown: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  currentEcuadorTime: string;
  statusLabel: string;
}

export interface WeekendExclusivePick extends MarketOpportunity {
  ruleMatch: DestacadoRuleMatch;
  dayOfWeek: 'friday' | 'saturday' | 'sunday';
  dayLabel: string;
  weekendOrder: number;
}

export interface WeekendSlate {
  cycle: WeekendCycleInfo;
  picks: WeekendExclusivePick[];
  targetCount: number;
  stats: {
    totalPicks: number;
    avgProbability: number;
    avgOdds: number;
    byRule: {
      corners: number;
      btts: number;
      goals: number;
      local: number;
      away: number;
    };
    byDay: {
      friday: number;
      saturday: number;
      sunday: number;
    };
  };
  generatedAt: string;
}

/**
 * Devuelve la información de desbloqueo y fechas para el ciclo de fin de semana actual o próximo.
 * REGLA: El módulo solo se libera los viernes a las 6:00 AM (hora Ecuador / America/Guayaquil).
 * Permanece liberado durante todo el fin de semana (Viernes, Sábado y Domingo).
 */
export function getWeekendCycleInfo(refDate: Date | number = new Date()): WeekendCycleInfo {
  const d = typeof refDate === 'number' ? new Date(refDate) : refDate;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const weekday = map.weekday; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  let daysToFriday = 0;
  let isWeekendActive = false;

  if (weekday === 'Fri') {
    if (hour >= 6) {
      isWeekendActive = true;
      daysToFriday = 0;
    } else {
      isWeekendActive = false;
      daysToFriday = 0; // Se libera hoy a las 6am
    }
  } else if (weekday === 'Sat') {
    isWeekendActive = true;
    daysToFriday = -1; // El viernes fue ayer
  } else if (weekday === 'Sun') {
    isWeekendActive = true;
    daysToFriday = -2; // El viernes fue hace 2 días
  } else if (weekday === 'Mon') {
    isWeekendActive = false;
    daysToFriday = 4;
  } else if (weekday === 'Tue') {
    isWeekendActive = false;
    daysToFriday = 3;
  } else if (weekday === 'Wed') {
    isWeekendActive = false;
    daysToFriday = 2;
  } else if (weekday === 'Thu') {
    isWeekendActive = false;
    daysToFriday = 1;
  }

  // Generar fechas en formato ISO YYYY-MM-DD sumando días al Date base
  const makeDateString = (offsetDays: number): string => {
    const baseDate = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0));
    const y = baseDate.getUTCFullYear();
    const m = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
    const dt = String(baseDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  const fridayDate = makeDateString(daysToFriday);
  const saturdayDate = makeDateString(daysToFriday + 1);
  const sundayDate = makeDateString(daysToFriday + 2);

  // Momento exacto de desbloqueo (Viernes a las 06:00:00 Ecuador = UTC-5 -> 11:00:00 UTC)
  const [fYear, fMonth, fDay] = fridayDate.split('-').map((v) => parseInt(v, 10));
  const unlockUtcMs = Date.UTC(fYear, fMonth - 1, fDay, 11, 0, 0); // 06:00 Ecuador = 11:00 UTC

  const nowMs = d.getTime();
  let msUntilUnlock = Math.max(0, unlockUtcMs - nowMs);

  if (isWeekendActive) {
    msUntilUnlock = 0;
  }

  const totalSeconds = Math.floor(msUntilUnlock / 1000);
  const cdDays = Math.floor(totalSeconds / 86400);
  const cdHours = Math.floor((totalSeconds % 86400) / 3600);
  const cdMinutes = Math.floor((totalSeconds % 3600) / 60);
  const cdSeconds = totalSeconds % 60;

  const currentEcuadorTime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} (UTC-5)`;

  const statusLabel = isWeekendActive
    ? 'Edición Fin de Semana Liberada (Viernes, Sábado y Domingo)'
    : `Bloqueado hasta el Viernes a las 6:00 AM (${cdDays}d ${cdHours}h ${cdMinutes}m restantes)`;

  return {
    isUnlocked: isWeekendActive,
    fridayDate,
    saturdayDate,
    sundayDate,
    cycleId: `${fridayDate}_to_${sundayDate}`,
    unlockTimeIso: new Date(unlockUtcMs).toISOString(),
    msUntilUnlock,
    countdown: {
      days: cdDays,
      hours: cdHours,
      minutes: cdMinutes,
      seconds: cdSeconds,
    },
    currentEcuadorTime,
    statusLabel,
  };
}

/**
 * Verifica si un pronóstico cumple estrictamente alguna de las 5 reglas de fin de semana
 */
export function getWeekendExclusiveRuleMatch(
  pick: Parameters<typeof getDestacadoRuleMatch>[0]
): DestacadoRuleMatch | null {
  return getDestacadoRuleMatch(pick);
}

export function isWeekendExclusivePick(
  pick: Parameters<typeof isDestacadoPick>[0]
): boolean {
  return isDestacadoPick(pick);
}

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
 * Determina a qué día del fin de semana pertenece un pronóstico
 */
export function getPickDayOfWeek(
  pick: MarketOpportunity,
  fridayDate: string,
  saturdayDate: string,
  sundayDate: string
): { dayOfWeek: 'friday' | 'saturday' | 'sunday'; dayLabel: string } {
  const kickoff = pick.kickoff ? new Date(pick.kickoff) : null;
  const pickDateStr = kickoff ? getEcuadorDateString(kickoff) : fridayDate;

  if (pickDateStr === sundayDate) {
    const dayNum = sundayDate.split('-')[2];
    return { dayOfWeek: 'sunday', dayLabel: `Domingo ${dayNum}` };
  }
  if (pickDateStr === saturdayDate) {
    const dayNum = saturdayDate.split('-')[2];
    return { dayOfWeek: 'saturday', dayLabel: `Sábado ${dayNum}` };
  }
  const dayNum = fridayDate.split('-')[2];
  return { dayOfWeek: 'friday', dayLabel: `Viernes ${dayNum}` };
}

/**
 * Obtiene o compila el conjunto de 15 pronósticos de élite para el fin de semana.
 */
export async function getWeekendExclusiveSlate(options?: {
  refDate?: Date | number;
  forceRefresh?: boolean;
}): Promise<WeekendSlate> {
  const cycle = getWeekendCycleInfo(options?.refDate);
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
