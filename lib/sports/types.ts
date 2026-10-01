/**
 * SMARTBETBOT — UNIFIED MULTI-SPORT TYPE SYSTEM
 * Supports: Football, NBA, NFL, NCAAF, NHL
 */

export type SupportedSport = 'football' | 'nba' | 'nfl' | 'ncaaf' | 'nhl';

export type SportClassification = 'TOP PICK' | 'STRONG' | 'QUALIFIED' | 'WATCH' | 'NO BET';

export type SettlementStatus = 'WON' | 'LOST' | 'PUSH' | 'VOID' | 'PENDING';

export interface SportMetadata {
  id: SupportedSport;
  name: string;
  displayName: string;
  icon: string;
  accentColor: string;
  badgeBg: string;
  borderColor: string;
  description: string;
  defaultMarkets: string[];
  activeSeason: string;
  isLiveSupported: boolean;
}

export type SportCapability = 
  | 'injuries'
  | 'odds'
  | 'player_stats'
  | 'team_stats'
  | 'lineups'
  | 'weather'
  | 'h2h'
  | 'schedule';

export interface NormalizedGame {
  id: string;
  sport: SupportedSport;
  provider: string;
  providerGameId: string;
  league: {
    id: string | number;
    name: string;
    season: string | number;
    conference?: string;
    division?: string;
  };
  homeTeam: {
    id: string | number;
    name: string;
    code?: string;
    logo?: string;
  };
  awayTeam: {
    id: string | number;
    name: string;
    code?: string;
    logo?: string;
  };
  startsAt: string; // ISO 8601
  status: 'SCHEDULED' | 'IN_PLAY' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  homeScore?: number | null;
  awayScore?: number | null;
  periodScores?: {
    home: number[];
    away: number[];
  };
  isOvertime?: boolean;
  isShootout?: boolean;
  metadata?: Record<string, unknown>;
}

export interface NormalizedOdds {
  provider: string;
  bookmaker: string;
  sport: SupportedSport;
  gameId: string;
  market: string;
  selection: string;
  line?: number;
  decimalOdds: number;
  impliedProbability: number;
  devigProbability?: number;
  capturedAt: string;
}

export interface SportStrategyConfig {
  id: string;
  sport: SupportedSport;
  market: string;
  name: string;
  description: string;
  enabled: boolean;
  minProbability: number;
  minEdge: number;
  minOdds: number;
  maxOdds: number;
  minDataQuality: number;
  targetEV?: number;
  maxDailySignals?: number;
  configJson?: Record<string, unknown>;
}

export interface MultiSportPrediction {
  id: string;
  sport: SupportedSport;
  gameId: string;
  game: NormalizedGame;
  market: string;
  selection: string;
  line?: number;
  modelVersion: string;
  modelProbability: number;
  decimalOdds: number;
  impliedProbability: number;
  devigProbability?: number;
  smartEdge: number;
  expectedValue: number;
  smartScore: number;
  classification: SportClassification;
  dataQuality: number;
  isSmartPick?: boolean;
  explanation?: string;
  featuresUsed?: Record<string, unknown>;
  createdAt: string;
}

export interface MultiSportSignal {
  id: string;
  sport: SupportedSport;
  gameId: string;
  game: NormalizedGame;
  market: string;
  selection: string;
  line?: number;
  modelProbability: number;
  decimalOdds: number;
  smartEdge: number;
  expectedValue: number;
  smartScore: number;
  classification: SportClassification;
  dataQuality: number;
  isSmartPick: boolean;
  explanation: string;
  createdAt: string;
  settlement?: {
    status: SettlementStatus;
    settledAt?: string;
    homeScore?: number;
    awayScore?: number;
    finalDetail?: string;
  };
}

export interface BacktestResult {
  sport: SupportedSport;
  strategyId: string;
  strategyName: string;
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  avgOdds: number;
  roi: number;
  yield: number;
  netUnits: number;
  brierScore: number;
  logLoss: number;
  calibration: {
    binStart: number;
    binEnd: number;
    predictedAvg: number;
    actualAvg: number;
    count: number;
  }[];
  generatedAt: string;
}

export interface SportsDataProvider {
  readonly sport: SupportedSport;
  readonly name: string;
  supports(capability: SportCapability): boolean;
  getSchedule(date: string): Promise<NormalizedGame[]>;
  getGame(gameId: string): Promise<NormalizedGame | null>;
  getHistoricalGames(season: string, limit?: number): Promise<NormalizedGame[]>;
  getTeamStats(teamId: string | number, season: string): Promise<Record<string, unknown>>;
  getOdds(gameId: string): Promise<NormalizedOdds[]>;
  getResults(date: string): Promise<NormalizedGame[]>;
  getDiagnostics(): Promise<{ status: 'OK' | 'ERROR'; message: string; remainingQuota?: number }>;
}