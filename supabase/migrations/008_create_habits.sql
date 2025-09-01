-- Create habits table for user habit definitions
CREATE TABLE habits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) <= 100),
  target_frequency INTEGER NOT NULL CHECK (target_frequency >= 1 AND target_frequency <= 7),
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE -- for soft delete
);

-- Create habit_entries table for daily status tracking
CREATE TABLE habit_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'NEUTRAL')) DEFAULT 'NEUTRAL',
  week_start DATE NOT NULL, -- for efficient weekly queries
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(habit_id, date)
);

-- Create habit_weekly_summaries table for weekly performance cache
CREATE TABLE habit_weekly_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, -- denormalized for easier queries
  week_start DATE NOT NULL,
  successes INTEGER DEFAULT 0,
  target INTEGER NOT NULL,
  percentage DECIMAL(5,2) DEFAULT 0,
  points_earned DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(habit_id, week_start)
);

-- Create indexes for performance
CREATE INDEX idx_habits_user_id ON habits(user_id) WHERE archived_at IS NULL;
CREATE INDEX idx_habits_position ON habits(position);
CREATE INDEX idx_habit_entries_habit_date ON habit_entries(habit_id, date);
CREATE INDEX idx_habit_entries_week ON habit_entries(habit_id, week_start);
CREATE INDEX idx_habit_weekly_summaries_user_week ON habit_weekly_summaries(user_id, week_start);
CREATE INDEX idx_habit_weekly_summaries_habit_week ON habit_weekly_summaries(habit_id, week_start);

-- Enable RLS on habits table
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

-- RLS policies for habits
CREATE POLICY "Users can view their own habits" ON habits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own habits" ON habits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habits" ON habits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habits" ON habits
  FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on habit_entries table
ALTER TABLE habit_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for habit_entries
CREATE POLICY "Users can view their own habit entries" ON habit_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM habits 
      WHERE habits.id = habit_entries.habit_id 
      AND habits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own habit entries" ON habit_entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM habits 
      WHERE habits.id = habit_entries.habit_id 
      AND habits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own habit entries" ON habit_entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM habits 
      WHERE habits.id = habit_entries.habit_id 
      AND habits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own habit entries" ON habit_entries
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM habits 
      WHERE habits.id = habit_entries.habit_id 
      AND habits.user_id = auth.uid()
    )
  );

-- Enable RLS on habit_weekly_summaries table
ALTER TABLE habit_weekly_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies for habit_weekly_summaries
CREATE POLICY "Users can view their own habit summaries" ON habit_weekly_summaries
  FOR SELECT USING (auth.uid() = user_id);

-- Note: INSERT/UPDATE/DELETE policies intentionally omitted as these should only be done by the system

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_habit_entries_updated_at BEFORE UPDATE ON habit_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_habit_weekly_summaries_updated_at BEFORE UPDATE ON habit_weekly_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();