import {
  MarketOpportunity,
  DestacadoRuleMatch,
  getDestacadoRuleMatch,
  isDestacadoPick,
} from './prediction-engine';

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
    won?: number;
    lost?: number;
    pending?: number;
    winRate?: number;
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
 * Helper client-safe para formatear fechas a YYYY-MM-DD en hora de Ecuador
 */
export function formatEcuadorDateString(d: Date | number | string = Date.now()): string {
  if (!d) return formatEcuadorDateString(Date.now());
  const dateObj = typeof d === 'string' ? new Date(d) : typeof d === 'number' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dateObj);
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
 * Determina a qué día del fin de semana pertenece un pronóstico
 */
export function getPickDayOfWeek(
  pick: MarketOpportunity,
  fridayDate: string,
  saturdayDate: string,
  sundayDate: string
): { dayOfWeek: 'friday' | 'saturday' | 'sunday'; dayLabel: string } {
  const kickoff = pick.kickoff ? new Date(pick.kickoff) : null;
  const pickDateStr = kickoff ? formatEcuadorDateString(kickoff) : fridayDate;

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
