-- 038: Add tie_credit flag to rivalry_matchups.
--
-- Prior behavior: any tie (s1 === s2) closed out with winner_id = NULL and no
-- skull awarded. This conflated two cases — a 0–0 no-show tie and a hard-fought
-- tie at non-zero scores. Now non-zero ties grant both players a kill mark via
-- tie_credit = TRUE; 0–0 ties remain uncredited.
--
-- The cron close-out is the only writer; existing closed rows with winner_id
-- IS NULL stay tie_credit = FALSE (no retroactive crediting).

ALTER TABLE rivalry_matchups
  ADD COLUMN IF NOT EXISTS tie_credit BOOLEAN NOT NULL DEFAULT FALSE;

-- Counted alongside winner_id for kill-mark queries; partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_rivalry_matchups_tie_credit
  ON rivalry_matchups (tie_credit)
  WHERE tie_credit = TRUE;
