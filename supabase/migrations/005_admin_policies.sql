-- Admin RLS policies for user management
-- This migration adds Row Level Security policies that allow the admin user to manage badges and divisions

-- First, let's create a function to check if the current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE email = 'gabrielbeal@gmail.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add admin policies for user_badges table
CREATE POLICY "Admin can insert badges" ON user_badges
  FOR INSERT 
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update badges" ON user_badges
  FOR UPDATE 
  USING (is_admin());

CREATE POLICY "Admin can delete badges" ON user_badges
  FOR DELETE 
  USING (is_admin());

-- Users can still manage their own badges (for the badge calculator)
CREATE POLICY "Users can insert own badges" ON user_badges
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own badges" ON user_badges
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Update user_divisions policies to explicitly allow admin operations
-- Drop existing policies first
DROP POLICY IF EXISTS "Service can manage divisions" ON user_divisions;
DROP POLICY IF EXISTS "Service can update divisions" ON user_divisions;
DROP POLICY IF EXISTS "Service can delete divisions" ON user_divisions;

-- Create new policies that allow both service operations and admin operations
CREATE POLICY "Admin and service can insert divisions" ON user_divisions
  FOR INSERT 
  WITH CHECK (is_admin() OR true); -- Allow both admin and service operations

CREATE POLICY "Admin and service can update divisions" ON user_divisions
  FOR UPDATE 
  USING (is_admin() OR true); -- Allow both admin and service operations

CREATE POLICY "Admin and service can delete divisions" ON user_divisions
  FOR DELETE 
  USING (is_admin() OR true); -- Allow both admin and service operations

-- Add admin policies for division_history table
CREATE POLICY "Admin can insert division history" ON division_history
  FOR INSERT 
  WITH CHECK (is_admin() OR true); -- Allow both admin and service operations

-- Add admin policies for user_points table (in case admin needs to adjust points)
CREATE POLICY "Admin can update user points" ON user_points
  FOR UPDATE 
  USING (is_admin());

CREATE POLICY "Admin can insert user points" ON user_points
  FOR INSERT 
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete user points" ON user_points
  FOR DELETE 
  USING (is_admin());

-- Add admin policies for badge_progress table (for manual badge management)
CREATE POLICY "Admin can view badge progress" ON badge_progress
  FOR SELECT 
  USING (is_admin() OR auth.uid() = user_id);

CREATE POLICY "Admin can insert badge progress" ON badge_progress
  FOR INSERT 
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update badge progress" ON badge_progress
  FOR UPDATE 
  USING (is_admin());

CREATE POLICY "Admin can delete badge progress" ON badge_progress
  FOR DELETE 
  USING (is_admin());

-- Grant execute permission on the is_admin function
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;