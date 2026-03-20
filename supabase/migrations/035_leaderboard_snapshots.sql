-- Migration 035: Leaderboard snapshots for weekly rank-change tracking
--
-- Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  rank INTEGER NOT NULL,
  total_points REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_leaderboard_snapshots_week ON leaderboard_snapshots(week_start);
CREATE INDEX idx_leaderboard_snapshots_user ON leaderboard_snapshots(user_id);

-- Public read (same as leaderboard)
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots are viewable by everyone" ON leaderboard_snapshots FOR SELECT USING (true);
CREATE POLICY "Service role can manage snapshots" ON leaderboard_snapshots FOR ALL USING (true);
