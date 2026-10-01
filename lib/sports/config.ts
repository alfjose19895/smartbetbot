import { SupportedSport } from './types';

export interface SportFeatureConfig {
  enabled: boolean;
  liveEnabled: boolean;
  monteCarloSimulations: number;
  apiKey?: string;
  baseUrl?: string;
}

export const SPORTS_CONFIG: Record<SupportedSport, SportFeatureConfig> = {
  football: {
    enabled: true,
    liveEnabled: true,
    monteCarloSimulations: 10000,
    apiKey: process.env.API_FOOTBALL_KEY,
    baseUrl: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io'
  },
  nba: {
    enabled: process.env.NBA_ENABLED !== 'false',
    liveEnabled: process.env.NBA_LIVE_ENABLED === 'true',
    monteCarloSimulations: parseInt(process.env.NBA_MONTE_CARLO_SIMULATIONS || '20000', 10),
    apiKey: process.env.API_NBA_KEY,
    baseUrl: process.env.API_NBA_BASE_URL || 'https://v1.basketball.api-sports.io'
  },
  nfl: {
    enabled: process.env.NFL_ENABLED !== 'false',
    liveEnabled: process.env.NFL_LIVE_ENABLED === 'true',
    monteCarloSimulations: parseInt(process.env.NFL_MONTE_CARLO_SIMULATIONS || '20000', 10),
    apiKey: process.env.API_NFL_KEY,
    baseUrl: process.env.API_NFL_BASE_URL || 'https://v1.american-football.api-sports.io'
  },
  ncaaf: {
    enabled: process.env.NCAAF_ENABLED !== 'false',
    liveEnabled: process.env.NCAAF_LIVE_ENABLED === 'true',
    monteCarloSimulations: parseInt(process.env.NCAAF_MONTE_CARLO_SIMULATIONS || '20000', 10),
    apiKey: process.env.API_NCAAF_KEY,
    baseUrl: process.env.API_NCAAF_BASE_URL || 'https://v1.american-football.api-sports.io'
  },
  nhl: {
    enabled: process.env.NHL_ENABLED !== 'false',
    liveEnabled: process.env.NHL_LIVE_ENABLED === 'true',
    monteCarloSimulations: parseInt(process.env.NHL_MONTE_CARLO_SIMULATIONS || '20000', 10),
    apiKey: process.env.API_NHL_KEY,
    baseUrl: process.env.API_NHL_BASE_URL || 'https://v1.hockey.api-sports.io'
  }
};

export function isSportFeatureEnabled(sport: SupportedSport): boolean {
  return SPORTS_CONFIG[sport]?.enabled ?? false;
}