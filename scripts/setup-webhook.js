#!/usr/bin/env node

// Script to create or view Strava webhook subscription
// Run with: node scripts/setup-webhook.js

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || '136705'
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || '93e9f9c72afe0b559fa33cd9b0cf75c3d749339a'
const WEBHOOK_VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'fitnessfightclub2024'

// Your callback URL - update this for production
const CALLBACK_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-production-url.vercel.app/api/strava/webhook'
  : 'http://localhost:3000/api/strava/webhook'

async function viewSubscription() {
  const response = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${STRAVA_CLIENT_ID}&client_secret=${STRAVA_CLIENT_SECRET}`
  )
  
  const data = await response.json()
  console.log('Current subscriptions:', data)
  return data
}

async function createSubscription() {
  const response = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      callback_url: CALLBACK_URL,
      verify_token: WEBHOOK_VERIFY_TOKEN,
    }),
  })

  const data = await response.json()
  console.log('Create subscription response:', data)
  return data
}

async function deleteSubscription(id) {
  const response = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions/${id}?client_id=${STRAVA_CLIENT_ID}&client_secret=${STRAVA_CLIENT_SECRET}`,
    { method: 'DELETE' }
  )
  
  console.log('Delete response:', response.status)
}

async function main() {
  const command = process.argv[2]
  
  console.log('🚀 Strava Webhook Manager')
  console.log('------------------------')
  console.log(`Callback URL: ${CALLBACK_URL}`)
  console.log(`Verify Token: ${WEBHOOK_VERIFY_TOKEN}`)
  console.log('')

  switch (command) {
    case 'create':
      console.log('Creating subscription...')
      await createSubscription()
      break
    
    case 'delete':
      const subscriptions = await viewSubscription()
      if (subscriptions.length > 0) {
        console.log(`Deleting subscription ${subscriptions[0].id}...`)
        await deleteSubscription(subscriptions[0].id)
      } else {
        console.log('No subscriptions to delete')
      }
      break
    
    case 'view':
    default:
      await viewSubscription()
      console.log('\nCommands:')
      console.log('  node scripts/setup-webhook.js view    - View current subscriptions')
      console.log('  node scripts/setup-webhook.js create  - Create new subscription')
      console.log('  node scripts/setup-webhook.js delete  - Delete existing subscription')
      break
  }
}

main().catch(console.error)