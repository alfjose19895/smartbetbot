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


/**
 * Normalizes market or selection strings by stripping accents/diacritics and non-alphanumeric characters.
 */
export function normalizeMarketFilterString(str?: string | null): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Robustly matches a selected market filter against a prediction market and selection.
 * Specifically ensures 'Over Córners' / 'Corners' never filters for Goal markets (Over 2.5),
 * and guarantees accurate filtering across both pre-match and historical views.
 */
export function matchesMarketFilter(
  selectedFilter: string,
  itemMarket?: string | null,
  itemSelection?: string | null
): boolean {
  if (!selectedFilter || selectedFilter === 'ALL' || selectedFilter === 'all') return true;

  const normSelected = normalizeMarketFilterString(selectedFilter);
  const normActual = normalizeMarketFilterString(itemMarket);
  const normSel = normalizeMarketFilterString(itemSelection);

  // 1. CORNERS MARKET (Over Córners, Córners, Corners, Corner Lines)
  const isSelectedCorner =
    normSelected.includes('corner') ||
    normSelected.includes('crner');

  if (isSelectedCorner) {
    const isUnderFilter = normSelected.includes('under') || normSelected.includes('menos');
    const isActualCorner =
      normActual.includes('corner') ||
      normActual.includes('crner') ||
      normSel.includes('corner') ||
      normSel.includes('crner');

    if (!isActualCorner) return false;

    if (isUnderFilter) {
      return (
        normActual.includes('under') ||
        normSel.includes('under') ||
        normActual.includes('menos') ||
        normSel.includes('menos')
      );
    }
    // Over Corners: Ensure it does not match Under corner picks
    return (
      !normActual.includes('under') &&
      !normSel.includes('under') &&
      !normActual.includes('menos') &&
      !normSel.includes('menos')
    );
  }

  // 2. BOTH TEAMS TO SCORE (Ambos Equipos Anotan / BTTS)
  const isSelectedBtts =
    normSelected.includes('ambos') ||
    normSelected.includes('btts') ||
    normSelected.includes('anotan');

  if (isSelectedBtts) {
    return (
      normActual.includes('ambos') ||
      normActual.includes('btts') ||
      normActual.includes('anotan') ||
      normSel.includes('ambos') ||
      normSel.includes('btts')
    );
  }

  // 3. OVER GOALS (Over 2.5 Goles, Over 1.5 Goles, Over Goles, Total Goles, Over)
  // Must strictly reject corner picks, American sport points/spreads, etc.
  const isSelectedOverGoals =
    normSelected.includes('overgol') ||
    normSelected.includes('over25') ||
    normSelected.includes('over15') ||
    normSelected.includes('totalgol') ||
    normSelected.includes('altagol') ||
    normSelected.includes('masdegol') ||
    (normSelected.includes('over') &&
      !normSelected.includes('corner') &&
      !normSelected.includes('crner') &&
      !normSelected.includes('point') &&
      !normSelected.includes('total') &&
      !normSelected.includes('kuck') &&
      !normSelected.includes('spread'));

  if (isSelectedOverGoals) {
    // Strictly NOT a corner pick
    if (
      normActual.includes('corner') ||
      normActual.includes('crner') ||
      normSel.includes('corner') ||
      normSel.includes('crner')
    ) {
      return false;
    }

    const isGoalKeyword =
      normActual.includes('gol') ||
      normActual.includes('25') ||
      normActual.includes('15') ||
      normActual.includes('over') ||
      normSel.includes('gol') ||
      normSel.includes('25') ||
      normSel.includes('15') ||
      normSel.includes('over');

    const isUnder =
      normActual.includes('under') ||
      normSel.includes('under') ||
      normActual.includes('menos') ||
      normSel.includes('menos');

    return Boolean(isGoalKeyword && !isUnder);
  }

  // 4. GANADOR LOCAL / MONEYLINE HOME (1)
  const isSelectedLocal =
    normSelected.includes('local') ||
    normSelected === '1' ||
    normSelected.includes('home') ||
    normSelected.includes('ganalocal');

  if (isSelectedLocal) {
    if (normActual.includes('visitante') || normActual.includes('away')) return false;
    return (
      normActual.includes('local') ||
      normActual.includes('home') ||
      normSel === '1' ||
      normSel === 'local' ||
      normSel.includes('home')
    );
  }

  // 5. GANADOR VISITANTE / MONEYLINE AWAY (2)
  const isSelectedAway =
    normSelected.includes('visitante') ||
    normSelected === '2' ||
    normSelected.includes('away') ||
    normSelected.includes('ganavisitante');

  if (isSelectedAway) {
    if (normActual.includes('local') || normActual.includes('home')) return false;
    return (
      normActual.includes('visitante') ||
      normActual.includes('away') ||
      normSel === '2' ||
      normSel === 'visitante' ||
      normSel.includes('away')
    );
  }

  // 6. AMERICAN SPORTS MARKETS
  if (normSelected.includes('puckline')) return normActual.includes('puckline');
  if (normSelected.includes('spread')) return normActual.includes('spread');
  if (normSelected.includes('moneyline')) return normActual.includes('moneyline');
  if (normSelected.includes('totalpoint')) {
    return normActual.includes('totalpoint') || (normActual.includes('total') && normActual.includes('point'));
  }
  if (normSelected.includes('teamtotal')) return normActual.includes('teamtotal');
  if (normSelected.includes('totalgoal')) {
    return (
      (normActual.includes('total') && normActual.includes('goal')) ||
      (normActual.includes('total') && normActual.includes('gol'))
    );
  }

  // 7. DIRECT OR SUBSTRING MATCH FALLBACK
  return normActual.includes(normSelected) || normSelected.includes(normActual);
}
