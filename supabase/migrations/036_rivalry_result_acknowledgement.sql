-- Migration 036: Track when each player has seen the outcome of a matchup.
--
-- Run this in the Supabase SQL editor.
--
-- Adds two nullable timestamp columns on rivalry_matchups so the app can
-- detect which player still needs to see a "you won/lost/tied" celebration
-- modal the first time they open the rivalries page after a period closes.
--
-- Existing completed matchups are left with NULL viewed_at so players won't
-- get retroactively notified about historical results they've long accepted.
-- If you want the celebration to fire for already-closed periods, stamp the
-- rows you want to "forget" with viewed_at = NOW() (or leave them NULL to
-- replay the celebration once).

ALTER TABLE rivalry_matchups
  ADD COLUMN IF NOT EXISTS player1_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS player2_viewed_at TIMESTAMPTZ;

-- Suppress the celebration for every matchup that's already closed, so users
-- don't see a backlog of modals the first time this ships. Remove this block
-- (or scope it to specific periods) if you want the most recent finished
-- period to trigger a celebration on first load.
UPDATE rivalry_matchups
SET
  player1_viewed_at = COALESCE(player1_viewed_at, NOW()),
  player2_viewed_at = COALESCE(player2_viewed_at, NOW())
WHERE player1_score IS NOT NULL;
