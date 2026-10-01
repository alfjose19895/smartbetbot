import { SportMetadata, SupportedSport } from './types';

export function getCurrentSportSeason(sport: SupportedSport, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = Jan, 11 = Dec

  switch (sport) {
    case 'nhl': {
      // NHL season runs from October (month 9) to June.
      if (month >= 9) {
        return `${year}-${year + 1}`;
      }
      return `${year - 1}-${year}`;
    }
    case 'nba': {
      // NBA season runs from October (month 9) to June.
      if (month >= 9) {
        return `${year}-${year + 1}`;
      }
      return `${year - 1}-${year}`;
    }
    case 'nfl': {
      // NFL season runs from September (month 8) to February.
      if (month >= 7) {
        return `${year}`;
      }
      return `${year - 1}`;
    }
    case 'ncaaf': {
      // College Football season runs from August (month 7) to January.
      if (month >= 7) {
        return `${year}`;
      }
      return `${year - 1}`;
    }
    case 'football':
    default: {
      // Football European season: starts in July/August
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
    defaultMarkets: ['GANADOR LOCAL', 'GANADOR VISITANTE', 'OVER GOLES', 'UNDER GOLES', 'OVER CORNERS', 'UNDER CORNERS', 'AMBOS EQUIPOS ANOTAN'],
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
