import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function GET() {
  const supabase = await createClient()
  
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SUPABASE_URL))
  }

  // Get the actual host from the request headers
  const headersList = await headers()
  const host = headersList.get('host') || 'fitnessfight.club'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  
  const clientId = process.env.STRAVA_CLIENT_ID
  const redirectUri = `${protocol}://${host}/api/strava/callback`
  
  // Strava OAuth authorization URL
  const stravaAuthUrl = new URL('https://www.strava.com/oauth/authorize')
  stravaAuthUrl.searchParams.set('client_id', clientId!)
  stravaAuthUrl.searchParams.set('response_type', 'code')
  stravaAuthUrl.searchParams.set('redirect_uri', redirectUri)
  stravaAuthUrl.searchParams.set('approval_prompt', 'auto')
  stravaAuthUrl.searchParams.set('scope', 'read,activity:read_all,profile:read_all')
  stravaAuthUrl.searchParams.set('state', user.id)
  
  return NextResponse.redirect(stravaAuthUrl.toString())
}