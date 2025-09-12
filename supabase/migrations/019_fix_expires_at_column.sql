-- Migration to change expires_at from TIMESTAMP to BIGINT for Unix timestamps
-- This fixes token expiry handling issues

-- Step 1: Add a new temporary column for the Unix timestamp
ALTER TABLE strava_connections 
ADD COLUMN expires_at_unix BIGINT;

-- Step 2: Copy existing timestamp data to Unix format
UPDATE strava_connections 
SET expires_at_unix = EXTRACT(EPOCH FROM expires_at)::BIGINT
WHERE expires_at IS NOT NULL;

-- Step 3: Drop the old column
ALTER TABLE strava_connections 
DROP COLUMN expires_at;

-- Step 4: Rename the new column to expires_at
ALTER TABLE strava_connections 
RENAME COLUMN expires_at_unix TO expires_at;

-- Step 5: Add comment explaining the field
COMMENT ON COLUMN strava_connections.expires_at IS 'Unix timestamp (seconds since epoch) when the access token expires';