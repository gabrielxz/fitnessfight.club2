-- Rivalry periods: each bi-weekly competition window with a specific metric
CREATE TABLE IF NOT EXISTS rivalry_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_number INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  -- metric must match a real column/aggregation in strava_activities
  metric TEXT NOT NULL CHECK (metric IN ('distance', 'moving_time', 'elevation_gain', 'suffer_score')),
  metric_label TEXT NOT NULL,  -- e.g. "Distance", "Time Exercised", "Elevation"
  metric_unit TEXT NOT NULL,   -- e.g. "km", "hours", "m"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rivalry matchups: one row per paired players per period
-- player1_id/player2_id ordering doesn't matter (lower UUID first by convention)
-- winner_id is NULL while period is in-progress or if the period ended in a tie
CREATE TABLE IF NOT EXISTS rivalry_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES rivalry_periods(id) ON DELETE CASCADE,
  player1_id UUID NOT NULL,
  player2_id UUID NOT NULL,
  winner_id UUID,   -- NULL = tie or still in progress
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Each player can only appear once per period
  UNIQUE(period_id, player1_id),
  UNIQUE(period_id, player2_id)
);

-- RLS: public read, no direct writes (admin-managed via service role)
ALTER TABLE rivalry_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE rivalry_matchups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rivalry_periods_public_read"
  ON rivalry_periods FOR SELECT USING (true);

CREATE POLICY "rivalry_matchups_public_read"
  ON rivalry_matchups FOR SELECT USING (true);

-- Index for fast lookups of active period
CREATE INDEX IF NOT EXISTS idx_rivalry_periods_dates
  ON rivalry_periods (start_date, end_date);

-- Index for kill-mark count queries (wins per user)
CREATE INDEX IF NOT EXISTS idx_rivalry_matchups_winner
  ON rivalry_matchups (winner_id)
  WHERE winner_id IS NOT NULL;

-- Index for matchup lookups by period
CREATE INDEX IF NOT EXISTS idx_rivalry_matchups_period
  ON rivalry_matchups (period_id);
