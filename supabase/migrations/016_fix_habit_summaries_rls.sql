-- Migration: Fix RLS policies for habit_weekly_summaries table
-- Problem: The table has RLS enabled but no INSERT/UPDATE/DELETE policies,
-- causing silent failures when the API tries to update summaries

-- Option 1: Add RLS policies for users to manage their own summaries
-- This maintains security while allowing the system to work

-- Add INSERT policy - users can create summaries for their own habits
CREATE POLICY "Users can insert their own habit summaries" ON habit_weekly_summaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy - users can update their own habit summaries
CREATE POLICY "Users can update their own habit summaries" ON habit_weekly_summaries
  FOR UPDATE USING (auth.uid() = user_id);

-- Add DELETE policy - users can delete their own habit summaries (for cleanup)
CREATE POLICY "Users can delete their own habit summaries" ON habit_weekly_summaries
  FOR DELETE USING (auth.uid() = user_id);

-- Create a function to automatically update habit summaries when entries change
-- This serves as a failsafe to ensure summaries stay in sync
CREATE OR REPLACE FUNCTION update_habit_summary_on_entry_change()
RETURNS TRIGGER AS $$
DECLARE
  v_week_start DATE;
  v_week_end DATE;
  v_success_count INTEGER;
  v_target_frequency INTEGER;
  v_percentage DECIMAL(5,2);
  v_points_earned DECIMAL(10,2);
  v_user_id UUID;
BEGIN
  -- Calculate week boundaries (Monday to Sunday)
  IF TG_OP = 'DELETE' THEN
    v_week_start := OLD.week_start;
  ELSE
    v_week_start := NEW.week_start;
  END IF;
  
  v_week_end := v_week_start + INTERVAL '6 days';
  
  -- Get the habit's target frequency and user_id
  IF TG_OP = 'DELETE' THEN
    SELECT target_frequency, user_id INTO v_target_frequency, v_user_id
    FROM habits WHERE id = OLD.habit_id;
  ELSE
    SELECT target_frequency, user_id INTO v_target_frequency, v_user_id
    FROM habits WHERE id = NEW.habit_id;
  END IF;
  
  -- Count SUCCESS entries for this week
  IF TG_OP = 'DELETE' THEN
    SELECT COUNT(*) INTO v_success_count
    FROM habit_entries
    WHERE habit_id = OLD.habit_id
      AND status = 'SUCCESS'
      AND date >= v_week_start
      AND date <= v_week_end;
  ELSE
    SELECT COUNT(*) INTO v_success_count
    FROM habit_entries
    WHERE habit_id = NEW.habit_id
      AND status = 'SUCCESS'
      AND date >= v_week_start
      AND date <= v_week_end;
  END IF;
  
  -- Calculate percentage and points
  IF v_target_frequency > 0 THEN
    v_percentage := (v_success_count::DECIMAL / v_target_frequency) * 100;
  ELSE
    v_percentage := 0;
  END IF;
  
  -- Award 0.5 points if target is met
  IF v_success_count >= v_target_frequency THEN
    v_points_earned := 0.5;
  ELSE
    v_points_earned := 0;
  END IF;
  
  -- Upsert the summary
  IF TG_OP = 'DELETE' THEN
    INSERT INTO habit_weekly_summaries (
      habit_id, user_id, week_start, successes, target, percentage, points_earned
    ) VALUES (
      OLD.habit_id, v_user_id, v_week_start, v_success_count, v_target_frequency, v_percentage, v_points_earned
    )
    ON CONFLICT (habit_id, week_start)
    DO UPDATE SET
      successes = v_success_count,
      percentage = v_percentage,
      points_earned = v_points_earned,
      updated_at = NOW();
  ELSE
    INSERT INTO habit_weekly_summaries (
      habit_id, user_id, week_start, successes, target, percentage, points_earned
    ) VALUES (
      NEW.habit_id, v_user_id, v_week_start, v_success_count, v_target_frequency, v_percentage, v_points_earned
    )
    ON CONFLICT (habit_id, week_start)
    DO UPDATE SET
      successes = v_success_count,
      percentage = v_percentage,
      points_earned = v_points_earned,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-update summaries when entries change
CREATE TRIGGER update_summary_on_habit_entry_change
AFTER INSERT OR UPDATE OR DELETE ON habit_entries
FOR EACH ROW EXECUTE FUNCTION update_habit_summary_on_entry_change();

-- Add a comment explaining the RLS setup
COMMENT ON TABLE habit_weekly_summaries IS 'Weekly habit performance summaries with RLS policies allowing users to manage their own data. Also has a trigger to auto-update on entry changes as a failsafe.';