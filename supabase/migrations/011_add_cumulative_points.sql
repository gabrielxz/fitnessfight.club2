-- Add cumulative_points to user_profiles for lifetime point tracking
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS cumulative_points DECIMAL(10,2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.cumulative_points IS 'Lifetime cumulative points that never reset (exercise + habits + badges)';

-- Add points_awarded to user_badges to track badge tier points
ALTER TABLE public.user_badges
ADD COLUMN IF NOT EXISTS points_awarded DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.user_badges.points_awarded IS 'Points awarded for this badge tier (3 for bronze, 6 for silver, 10 for gold)';

-- Create index for efficient sorting by points
CREATE INDEX IF NOT EXISTS idx_user_profiles_cumulative_points 
ON public.user_profiles(cumulative_points DESC);

-- Populate cumulative_points from historical data
-- This sums up all weekly points from user_points table
UPDATE public.user_profiles p
SET cumulative_points = COALESCE((
  SELECT SUM(total_points)
  FROM public.user_points up
  WHERE up.user_id = p.id
), 0)
WHERE EXISTS (
  SELECT 1 FROM public.user_points WHERE user_id = p.id
);

-- Note: Historical habit points and badge points will need to be added via a migration script
-- since they weren't previously tracked properly