const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stravaClientId = process.env.STRAVA_CLIENT_ID;
const stravaClientSecret = process.env.STRAVA_CLIENT_SECRET;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixShirinProfile() {
  console.log('Searching for Shirin Modaresi...');

  // First, let's see all users with Strava connections to help find her
  console.log('\n--- Listing all Strava connections ---');
  const { data: allConnections } = await supabase
    .from('strava_connections')
    .select('user_id, strava_firstname, strava_lastname, strava_profile')
    .order('strava_firstname');

  console.log('Total Strava connections:', allConnections?.length);
  allConnections?.forEach(conn => {
    console.log(`- ${conn.strava_firstname} ${conn.strava_lastname}: ${conn.strava_profile ? 'HAS PHOTO' : 'NO PHOTO'}`);
  });
  console.log('---\n');

  // Find Shirin's user
  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .or('full_name.ilike.%shirin%,email.ilike.%modaresi%');

  if (profileError) {
    console.error('Error searching profiles:', profileError);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log('Could not find Shirin Modaresi in user_profiles');
    console.log('Trying to search by name in strava_connections...');

    // Try searching in strava_connections directly
    const { data: stravaConns } = await supabase
      .from('strava_connections')
      .select('*')
      .or('strava_firstname.ilike.%shirin%,strava_lastname.ilike.%modaresi%');

    if (!stravaConns || stravaConns.length === 0) {
      console.log('Could not find Shirin Modaresi anywhere');
      return;
    }

    const userId = stravaConns[0].user_id;
    console.log('Found in strava_connections:', stravaConns[0].strava_firstname, stravaConns[0].strava_lastname, userId);
    await updateProfile(userId, stravaConns[0]);
    return;
  }

  const userId = profiles[0].id;
  console.log('Found user:', profiles[0].full_name || profiles[0].email, userId);

  // Get her Strava connection
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!connection) {
    console.log('No Strava connection found for this user');
    return;
  }

  await updateProfile(userId, connection);
}

async function updateProfile(userId, connection) {
  console.log('Current profile picture:', connection.strava_profile || 'MISSING');

  // Check if token needs refresh
  const now = Math.floor(Date.now() / 1000);
  let accessToken = connection.access_token;

  if (connection.expires_at <= now) {
    console.log('Token expired, refreshing...');
    const refreshResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: stravaClientId,
        client_secret: stravaClientSecret,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token'
      })
    });

    if (!refreshResponse.ok) {
      console.error('Failed to refresh token:', await refreshResponse.text());
      return;
    }

    const refreshData = await refreshResponse.json();
    accessToken = refreshData.access_token;

    // Update tokens
    await supabase
      .from('strava_connections')
      .update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        expires_at: refreshData.expires_at
      })
      .eq('user_id', userId);

    console.log('Token refreshed successfully');
  }

  // Fetch athlete profile from Strava
  console.log('Fetching current profile from Strava...');
  const athleteResponse = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!athleteResponse.ok) {
    console.error('Failed to fetch athlete:', await athleteResponse.text());
    return;
  }

  const athlete = await athleteResponse.json();
  console.log('Fetched athlete:', athlete.firstname, athlete.lastname);
  console.log('Profile picture URL:', athlete.profile_medium || athlete.profile || 'NONE');

  // Update profile picture
  const profileUrl = athlete.profile_medium || athlete.profile;

  if (!profileUrl) {
    console.log('⚠️ No profile picture available from Strava');
    return;
  }

  const { error } = await supabase
    .from('strava_connections')
    .update({
      strava_profile: profileUrl,
      strava_firstname: athlete.firstname,
      strava_lastname: athlete.lastname,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating profile:', error);
  } else {
    console.log('✅ Successfully updated profile picture!');
    console.log('New profile URL:', profileUrl);
  }
}

fixShirinProfile().catch(console.error);