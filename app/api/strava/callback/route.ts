import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface StravaTokenResponse {
  token_type: string
  expires_at: number
  expires_in: number
  refresh_token: string
  access_token: string
  athlete: {
    id: number
    username: string
    resource_state: number
    firstname: string
    lastname: string
    city: string
    state: string
    country: string
    sex: string
    premium: boolean
    summit: boolean
    created_at: string
    updated_at: string
    badge_type_id: number
    profile_medium: string
    profile: string
    friend: null
    follower: null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // user_id
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?error=missing_params', request.url))
  }

  const supabase = await createClient()
  
  // Verify user is authenticated and matches state
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user || user.id !== state) {
    return NextResponse.redirect(new URL('/?error=unauthorized', request.url))
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token')
    }

    const tokenData: StravaTokenResponse = await tokenResponse.json()

    // Store or update Strava connection in database
    const { error: dbError } = await supabase
      .from('strava_connections')
      .upsert({
        user_id: user.id,
        strava_athlete_id: tokenData.athlete.id,
        strava_firstname: tokenData.athlete.firstname,
        strava_lastname: tokenData.athlete.lastname,
        strava_profile: tokenData.athlete.profile_medium || tokenData.athlete.profile,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
        scope: 'read,activity:read_all,profile:read_all',
      }, {
        onConflict: 'user_id',
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.redirect(new URL('/?error=database_error', request.url))
    }

    return NextResponse.redirect(new URL('/?strava=connected', request.url))
  } catch (error) {
    console.error('Strava OAuth error:', error)
    return NextResponse.redirect(new URL('/?error=oauth_error', request.url))
  }
}