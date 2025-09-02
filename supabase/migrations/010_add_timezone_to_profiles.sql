-- Add timezone field to user_profiles table
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.timezone IS 'User''s preferred timezone in IANA format (e.g., America/New_York)';