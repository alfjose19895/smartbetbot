export function getSportLocalDateString(sport: SupportedSport = 'football', d: Date | number | string = Date.now()): string {
  const timeZone = (sport === 'nhl' || sport === 'nba' || sport === 'nfl' || sport === 'ncaaf')
    ? 'America/New_York'
    : 'America/Guayaquil';
  
  const dateObj = typeof d === 'string' ? new Date(d) : typeof d === 'number' ? new Date(d) : d;
  const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(validDate);
}
import { SportMetadata, SupportedSport } from './types';

export function getCurrentSportSeason(sport: SupportedSport, date: Date = new Date()): string {
  // Use UTC year and UTC month to guarantee identical evaluation across server SSR and client hydration
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0 = Jan, 7 = Aug, 8 = Sep, 9 = Oct, 11 = Dec

  switch (sport) {
    case 'nhl':
    case 'nba': {
      // NHL & NBA seasons span autumn to spring.
      // From August/September (month >= 7) onwards, it is the new campaign: ${year}-${year+1} (e.g. 2026-2027).
      // From January to July (month < 7), it is ${year-1}-${year}.
      if (month >= 7) {
        return `${year}-${year + 1}`;
      }
      return `${year - 1}-${year}`;
    }
    case 'nfl':
    case 'ncaaf': {
      // NFL & College Football: August to February.
      // From July onwards (month >= 6), it is current year ${year} (e.g. 2026).
      // In January/February (month <= 1), it belongs to previous year campaign ${year-1}.
      if (month >= 6) {
        return `${year}`;
      }
      return `${year - 1}`;
    }
    case 'football':
    default: {
      if (month >= 6) {
        return `${year}-${year + 1}`;
      }
      return `${year}`;
    }
  }
}

export const SPORTS_REGISTRY: Record<SupportedSport, SportMetadata> = {
  football: {
    id: 'football',
    name: 'Football',
    displayName: 'Fútbol',
    icon: '⚽',
    accentColor: '#10b981', // Emerald green
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    borderColor: 'border-emerald-500/30',
    description: 'Modelo Poisson Dixon-Coles con xG, Córners y análisis de mercado avanzado.',
    defaultMarkets: ['Over Córners', 'Ambos Equipos Anotan', 'Over 2.5 Goles', 'Ganador Local', 'Ganador Visitante'],
    activeSeason: getCurrentSportSeason('football'),
    isLiveSupported: true
  },
  nba: {
    id: 'nba',
    name: 'NBA',
    displayName: 'NBA',
    icon: '🏀',
    accentColor: '#f97316', // Orange
    badgeBg: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    borderColor: 'border-orange-500/30',
    description: 'Modelo cuantitativo NBA con ritmo (Pace), Offensive/Defensive Ratings y Monte Carlo 20k.',
    defaultMarkets: ['MONEYLINE', 'SPREAD', 'TOTAL POINTS', 'TEAM TOTAL'],
    activeSeason: getCurrentSportSeason('nba'),
    isLiveSupported: false
  },
  nfl: {
    id: 'nfl',
    name: 'NFL',
    displayName: 'NFL',
    icon: '🏈',
    accentColor: '#3b82f6', // Royal Blue
    badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    borderColor: 'border-blue-500/30',
    description: 'Modelo NFL basado en Elo ajustado, yardas por jugada, diferencial de entregas y Monte Carlo.',
    defaultMarkets: ['MONEYLINE', 'SPREAD', 'TOTAL POINTS', 'TEAM TOTAL'],
    activeSeason: getCurrentSportSeason('nfl'),
    isLiveSupported: false
  },
  ncaaf: {
    id: 'ncaaf',
    name: 'NCAAF',
    displayName: 'NCAAF',
    icon: '🏈',
    accentColor: '#eab308', // Gold / Amber
    badgeBg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    borderColor: 'border-yellow-500/30',
    description: 'Modelo College Football con ajuste estricto por fuerza de oponente, conferencias y shrinkage.',
    defaultMarkets: ['MONEYLINE', 'SPREAD', 'TOTAL POINTS', 'TEAM TOTAL'],
    activeSeason: getCurrentSportSeason('ncaaf'),
    isLiveSupported: false
  },
  nhl: {
    id: 'nhl',
    name: 'NHL',
    displayName: 'NHL',
    icon: '🏒',
    accentColor: '#06b6d4', // Cyan / Ice Blue
    badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    borderColor: 'border-cyan-500/30',
    description: 'Modelo de Goles Esperados (xG), Poisson Bivariado, ajuste por Portero Titular y resolución OT/SO.',
    defaultMarkets: ['MONEYLINE', 'PUCK LINE', 'TOTAL GOALS', 'TEAM TOTAL'],
    activeSeason: getCurrentSportSeason('nhl'),
    isLiveSupported: false
  }
};

export function getSportMeta(sport: SupportedSport): SportMetadata {
  const base = SPORTS_REGISTRY[sport] || SPORTS_REGISTRY.football;
  return {
    ...base,
    activeSeason: getCurrentSportSeason(sport)
  };
}

export function getAllSports(): SportMetadata[] {
  return Object.keys(SPORTS_REGISTRY).map((k) => getSportMeta(k as SupportedSport));
}

export function isValidSport(sport: string): sport is SupportedSport {
  return ['football', 'nba', 'nfl', 'ncaaf', 'nhl'].includes(sport);
}
