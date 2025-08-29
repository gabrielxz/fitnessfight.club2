import { createClient } from '@supabase/supabase-js'

// This client bypasses RLS and should only be used in server-side code
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }
  
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. This is required for admin operations like complete user deletion.')
  }
  
  // Verify it looks like a service role key (should contain 'service_role' in the JWT)
  try {
    const payload = JSON.parse(Buffer.from(supabaseServiceKey.split('.')[1], 'base64').toString())
    if (payload.role !== 'service_role') {
      throw new Error('The provided key is not a service role key. Please use the service_role key from Supabase dashboard.')
    }
  } catch (e) {
    console.warn('Could not verify service role key format')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}