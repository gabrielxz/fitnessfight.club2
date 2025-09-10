
-- Creates a function to safely increment badge points for a specific week.
-- This function will create a user_points record if one doesn't exist for the week.
CREATE OR REPLACE FUNCTION increment_badge_points(p_user_id UUID, p_week_start TEXT, p_points_to_add REAL)
RETURNS VOID AS $$
DECLARE
  v_week_start_date DATE := p_week_start::DATE;
  v_week_end_date DATE := v_week_start_date + INTERVAL '6 days';
BEGIN
  -- First, ensure a user_points record exists for this user and week.
  INSERT INTO public.user_points (user_id, week_start, week_end)
  VALUES (p_user_id, v_week_start_date, v_week_end_date)
  ON CONFLICT (user_id, week_start) DO NOTHING;

  -- Now, increment the badge_points for that week.
  UPDATE public.user_points
  SET badge_points = badge_points + p_points_to_add
  WHERE user_id = p_user_id AND week_start = v_week_start_date;
END;
$$ LANGUAGE plpgsql;
