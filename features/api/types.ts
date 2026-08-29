export type Pagination = { limit: number; offset: number; total: number };
export type Page<T> = { items: T[]; pagination: Pagination };

export type Team = { id: string; name: string; logo_url: string | null };
export type League = { id: string; name: string; country: string | null; logo_url: string | null };

export type Fixture = {
  id: string;
  league: League;
  home_team: Team;
  away_team: Team;
  kickoff_at: string;
  status: string;
  provider_status: string | null;
  match_minute: number | null;
  added_time: number | null;
  home_score: number | null;
  away_score: number | null;
  round: string | null;
  has_events: boolean;
  has_statistics: boolean;
  has_odds: boolean;
  last_synced_at: string | null;
};

export type FixtureStatistics = {
  captured_at: string;
  match_minute: number | null;
  shots: number | null;
  shots_on_target: number | null;
  possession: number | null;
  corners: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  attacks: number | null;
  dangerous_attacks: number | null;
};

export type SignalReference = {
  id: string;
  market: string;
  selection: string;
  line: number | null;
  smart_score: number;
  live_pressure_score: number | null;
  category: string;
  triggered_at: string;
};

export type LiveFixture = Fixture & {
  home_statistics: FixtureStatistics | null;
  away_statistics: FixtureStatistics | null;
  current_signals: SignalReference[];
};

export type PrematchPrediction = {
  id: string;
  model_version_id: string;
  market: string;
  selection: string;
  line: number | null;
  probability: number;
  decimal_odds: number | null;
  fair_market_probability: number | null;
  edge: number | null;
  expected_value: number | null;
  smart_score: number | null;
  category: string | null;
  strategy_name: string | null;
};

export type PrematchFixture = Fixture & { predictions: PrematchPrediction[] };

export type Signal = {
  id: string;
  fixture_id: string;
  strategy_id: string;
  strategy_name: string;
  league: League;
  home_team: Team;
  away_team: Team;
  kickoff_at: string;
  signal_type: "prematch" | "live";
  market: string;
  selection: string;
  line: number | null;
  decimal_odds: number;
  model_probability: number;
  raw_implied_probability: number;
  fair_market_probability: number | null;
  edge: number;
  expected_value: number;
  data_quality_score: number;
  live_pressure_score: number | null;
  smart_score: number;
  category: string;
  status: string;
  triggered_at: string;
  match_minute: number | null;
  critical_event: string | null;
};

export type SignalReason = {
  code: string;
  label: string;
  numeric_value: number | null;
  text_value: string | null;
  unit: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export type SignalDetail = Signal & {
  prediction_id: string | null;
  model_version_id: string | null;
  reasons: SignalReason[];
  result: {
    result_status: string;
    home_score: number | null;
    away_score: number | null;
    settled_at: string | null;
    settlement_odds: number | null;
    stake_units: number;
    profit_loss_units: number | null;
  } | null;
};

export type SignalPage = Page<Signal> & { responsible_use_notice: string };
export type SignalDetailResponse = { signal: SignalDetail; responsible_use_notice: string };

export type Performance = {
  settled_signals: number;
  resolved_signals: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  win_rate: number | null;
  average_odds: number | null;
  stake_units: number;
  profit_loss_units: number;
  roi: number | null;
  yield_rate: number | null;
};

export type PerformanceResponse = { metrics: Performance; responsible_use_notice: string };

export type TrackRecordItem = {
  signal_id: string;
  fixture_id: string;
  kickoff_at: string;
  home_team: string;
  away_team: string;
  league: string;
  market: string;
  selection: string;
  signal_type: "prematch" | "live";
  strategy_name: string;
  decimal_odds: number;
  model_probability: number;
  smart_score: number;
  result_status: "won" | "lost" | "void" | "push";
  settled_at: string;
  stake_units: number;
  profit_loss_units: number | null;
};

export type TrackRecordResponse = Page<TrackRecordItem> & { responsible_use_notice: string };

export type UserPreferences = {
  minimum_smart_score: number;
  minimum_probability: number;
  minimum_edge: number;
  live_enabled: boolean;
  prematch_enabled: boolean;
  markets: string[];
  league_ids: string[];
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  updated_at: string;
};

export type Me = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "user" | "admin" | "premium" | "analyst";
  timezone: string;
  preferences: UserPreferences;
};

export type WorkerRun = {
  id: string;
  worker: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  fixtures_processed: number;
  signals_generated: number;
  errors: number;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
};

export type AdminOverview = {
  database_status: string;
  database_latency_ms: number | null;
  redis_status: string;
  redis_latency_ms: number | null;
  api_requests_24h: number;
  provider_average_latency_ms_24h: number | null;
  provider_errors_24h: number;
  signals_24h: number;
  active_strategies: number;
  current_model: string | null;
  workers: WorkerRun[];
};

export type BacktestMetrics = {
  total_bets: number;
  won: number;
  lost: number;
  void: number;
  push: number;
  win_rate: number | null;
  average_odds: number | null;
  profit_units: number;
  loss_units: number;
  net_units: number;
  roi: number | null;
  yield_rate: number | null;
  maximum_drawdown: number;
  longest_winning_streak: number;
  longest_losing_streak: number;
};

export type BacktestResponse = {
  filters: Record<string, unknown>;
  metrics: BacktestMetrics;
  generated_at: string;
  methodology: string;
  responsible_use_notice: string;
};
