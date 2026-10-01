-- ============================================================
-- SMARTBETBOT MULTI-SPORT CORE SCHEMA MIGRATION
-- Supports: Football, NBA, NFL, NCAAF, NHL
-- ============================================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fixtures') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fixtures' AND column_name = 'sport') THEN
      ALTER TABLE fixtures ADD COLUMN sport VARCHAR(32) NOT NULL DEFAULT 'football';
      CREATE INDEX IF NOT EXISTS idx_fixtures_sport ON fixtures(sport);
      CREATE INDEX IF NOT EXISTS idx_fixtures_sport_kickoff ON fixtures(sport, kickoff_time);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'predictions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'predictions' AND column_name = 'sport') THEN
      ALTER TABLE predictions ADD COLUMN sport VARCHAR(32) NOT NULL DEFAULT 'football';
      CREATE INDEX IF NOT EXISTS idx_predictions_sport ON predictions(sport);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signals') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'sport') THEN
      ALTER TABLE signals ADD COLUMN sport VARCHAR(32) NOT NULL DEFAULT 'football';
      CREATE INDEX IF NOT EXISTS idx_signals_sport ON signals(sport);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'odds') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'odds' AND column_name = 'sport') THEN
      ALTER TABLE odds ADD COLUMN sport VARCHAR(32) NOT NULL DEFAULT 'football';
      CREATE INDEX IF NOT EXISTS idx_odds_sport ON odds(sport);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'strategies') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'strategies' AND column_name = 'sport') THEN
      ALTER TABLE strategies ADD COLUMN sport VARCHAR(32) NOT NULL DEFAULT 'football';
      CREATE INDEX IF NOT EXISTS idx_strategies_sport ON strategies(sport);
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sport_strategies (
  id VARCHAR(64) PRIMARY KEY,
  sport VARCHAR(32) NOT NULL,
  market VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  min_probability NUMERIC(5,4) NOT NULL DEFAULT 0.5500,
  min_edge NUMERIC(5,4) NOT NULL DEFAULT 0.0300,
  min_odds NUMERIC(5,2) NOT NULL DEFAULT 1.40,
  max_odds NUMERIC(5,2) NOT NULL DEFAULT 2.50,
  min_data_quality NUMERIC(5,2) NOT NULL DEFAULT 70.00,
  config_json JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sport_strategies_sport ON sport_strategies(sport);

INSERT INTO sport_strategies (id, sport, market, name, description, enabled, min_probability, min_edge, min_odds, max_odds, min_data_quality, config_json)
VALUES
  -- NBA
  ('nba_moneyline', 'nba', 'MONEYLINE', 'NBA Moneyline Value', 'Pre-match Moneyline con ventaja cuantitativa Monte Carlo', true, 0.58, 0.04, 1.40, 2.40, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nba_spread', 'nba', 'SPREAD', 'NBA Spread Advantage', 'Pre-match Spread basado en rating ofensivo/defensivo y posesiones esperadas', true, 0.56, 0.035, 1.80, 2.10, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nba_total', 'nba', 'TOTAL POINTS', 'NBA Totals Over/Under', 'Pre-match Total Points modelado por ritmo de posesiones y varianza', true, 0.56, 0.035, 1.80, 2.10, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nba_team_total', 'nba', 'TEAM TOTAL', 'NBA Team Totals', 'Pre-match Team Total Points por fortaleza ofensiva vs defensiva rival', true, 0.55, 0.03, 1.75, 2.15, 70.0, '{"max_per_game": 1}'::jsonb),

  -- NFL
  ('nfl_moneyline', 'nfl', 'MONEYLINE', 'NFL Moneyline Value', 'Pre-match Moneyline basado en Elo, diferencial de yardas y factor local', true, 0.58, 0.04, 1.40, 2.40, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nfl_spread', 'nfl', 'SPREAD', 'NFL Spread Advantage', 'Pre-match Spread ajustado por yardas por jugada y turnover margin', true, 0.56, 0.035, 1.80, 2.10, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nfl_total', 'nfl', 'TOTAL POINTS', 'NFL Over/Under Total', 'Pre-match Total Points modelado por eficiencia en Red Zone y ritmo', true, 0.56, 0.035, 1.80, 2.10, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nfl_team_total', 'nfl', 'TEAM TOTAL', 'NFL Team Totals', 'Pre-match Team Total evaluado por rating de QB y defensa rival', true, 0.55, 0.03, 1.75, 2.15, 70.0, '{"max_per_game": 1}'::jsonb),

  -- NCAAF
  ('ncaaf_moneyline', 'ncaaf', 'MONEYLINE', 'NCAAF Moneyline Value', 'Pre-match College Football Moneyline con ajuste de oponente y conferencia', true, 0.60, 0.05, 1.35, 2.30, 70.0, '{"max_per_game": 1}'::jsonb),
  ('ncaaf_spread', 'ncaaf', 'SPREAD', 'NCAAF Spread Value', 'Pre-match Spread considerando desbalance de nivel y shrinkage', true, 0.57, 0.04, 1.80, 2.10, 70.0, '{"max_per_game": 1}'::jsonb),
  ('ncaaf_total', 'ncaaf', 'TOTAL POINTS', 'NCAAF Totals Over/Under', 'Pre-match Total Points modelado con varianza alta específica de college', true, 0.57, 0.04, 1.80, 2.10, 70.0, '{"max_per_game": 1}'::jsonb),
  ('ncaaf_team_total', 'ncaaf', 'TEAM TOTAL', 'NCAAF Team Totals', 'Pre-match Team Totals considerando fortaleza de calendario', true, 0.55, 0.035, 1.75, 2.15, 65.0, '{"max_per_game": 1}'::jsonb),

  -- NHL
  ('nhl_moneyline', 'nhl', 'MONEYLINE', 'NHL Moneyline (incl OT/SO)', 'Pre-match Moneyline con Goles Esperados (xG) y ajuste de portero titular', true, 0.57, 0.04, 1.45, 2.35, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nhl_puck_line', 'nhl', 'PUCK LINE', 'NHL Puck Line (-1.5 / +1.5)', 'Pre-match Puck Line Poisson Bivariado con margen de gol vacío', true, 0.56, 0.035, 1.70, 2.40, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nhl_total', 'nhl', 'TOTAL GOALS', 'NHL Total Goals Over/Under', 'Pre-match Total Goals dinámico (5.5, 6.0, 6.5) con xG y PP/PK', true, 0.56, 0.035, 1.75, 2.15, 75.0, '{"max_per_game": 1}'::jsonb),
  ('nhl_team_total', 'nhl', 'TEAM TOTAL', 'NHL Team Goals Total', 'Pre-match Team Total Goals proyectado por tiro y efectividad', true, 0.55, 0.03, 1.70, 2.20, 70.0, '{"max_per_game": 1}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS sport_api_logs (
  id BIGSERIAL PRIMARY KEY,
  sport VARCHAR(32) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  endpoint VARCHAR(256) NOT NULL,
  status_code INT NOT NULL,
  remaining_requests INT,
  error_message TEXT,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sport_api_logs_sport_created ON sport_api_logs(sport, created_at DESC);
