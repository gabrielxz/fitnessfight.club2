-- Create divisions table
CREATE TABLE IF NOT EXISTS divisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  level INTEGER NOT NULL UNIQUE CHECK (level >= 1 AND level <= 6),
  min_users INTEGER DEFAULT 4,
  max_users INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed divisions
INSERT INTO divisions (name, level) VALUES
  ('Bronze', 1),
  ('Silver', 2),
  ('Gold', 3),
  ('Platinum', 4),
  ('Diamond', 5),
  ('Champion', 6);

-- Create user_divisions table
CREATE TABLE IF NOT EXISTS user_divisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  division_id UUID REFERENCES divisions(id),
  joined_division_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on user_divisions
ALTER TABLE user_divisions ENABLE ROW LEVEL SECURITY;

-- Create policies for user_divisions
CREATE POLICY "Users can view all division assignments" ON user_divisions
  FOR SELECT USING (true);

CREATE POLICY "Service can manage divisions" ON user_divisions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update divisions" ON user_divisions
  FOR UPDATE USING (true);

CREATE POLICY "Service can delete divisions" ON user_divisions
  FOR DELETE USING (true);

-- Create division_history table
CREATE TABLE IF NOT EXISTS division_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  from_division_id UUID REFERENCES divisions(id),
  to_division_id UUID REFERENCES divisions(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('promotion', 'relegation', 'initial')),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  final_points DECIMAL(10, 2),
  final_position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for division_history
CREATE INDEX idx_division_history_user_id ON division_history(user_id);
CREATE INDEX idx_division_history_week ON division_history(week_end DESC);

-- Create user_points table
CREATE TABLE IF NOT EXISTS user_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_hours DECIMAL(10, 2) DEFAULT 0,
  total_points DECIMAL(10, 2) DEFAULT 0,
  activities_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- Create indexes for user_points
CREATE INDEX idx_user_points_week ON user_points(week_start DESC);
CREATE INDEX idx_user_points_user_week ON user_points(user_id, week_start DESC);

-- Enable RLS on user_points
ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;

-- Create policy for user_points
CREATE POLICY "Users can view all points" ON user_points
  FOR SELECT USING (true);

CREATE POLICY "Service can insert points" ON user_points
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update points" ON user_points
  FOR UPDATE USING (true);

-- Create trigger to update updated_at on user_divisions
CREATE TRIGGER update_user_divisions_updated_at
  BEFORE UPDATE ON user_divisions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to update updated_at on user_points
CREATE TRIGGER update_user_points_updated_at
  BEFORE UPDATE ON user_points
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Assign existing users to Bronze division (initial assignment)
INSERT INTO user_divisions (user_id, division_id)
SELECT 
  u.id,
  (SELECT id FROM divisions WHERE name = 'Bronze')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_divisions WHERE user_id = u.id
);