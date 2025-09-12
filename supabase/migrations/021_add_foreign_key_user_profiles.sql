-- Add foreign key relationship between strava_connections and user_profiles
-- This allows the webhook endpoint to join these tables

-- First check if user_profiles has id as primary key
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_profiles_pkey' 
        AND conrelid = 'user_profiles'::regclass
    ) THEN
        ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- Drop existing foreign key if it exists (might be named differently)
ALTER TABLE strava_connections 
DROP CONSTRAINT IF EXISTS strava_connections_user_id_fkey;

-- Add foreign key from strava_connections.user_id to user_profiles.id
ALTER TABLE strava_connections
ADD CONSTRAINT strava_connections_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES user_profiles(id) 
ON DELETE CASCADE
ON UPDATE CASCADE;

-- IMPORTANT: After running this migration, you must:
-- 1. Go to Supabase Dashboard
-- 2. Click "Database" in the left sidebar
-- 3. Click "Schema Visualizer" or find the "Reload Schema" button
-- 4. This will update the API to recognize the foreign key relationship