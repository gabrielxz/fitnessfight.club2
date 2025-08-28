#!/usr/bin/env node

// Test script to simulate a Strava webhook event
const WEBHOOK_URL = 'https://fitnessfight-club2.vercel.app/api/strava/webhook'

async function testWebhook() {
  console.log('Testing webhook at:', WEBHOOK_URL)
  
  // Simulate a create event
  const testEvent = {
    aspect_type: 'create',
    event_time: Math.floor(Date.now() / 1000),
    object_id: 12345678901, // Fake activity ID
    object_type: 'activity',
    owner_id: 123456789, // This should be your Strava athlete ID
    subscription_id: 300933,
    updates: {}
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testEvent)
    })

    console.log('Response status:', response.status)
    const data = await response.text()
    console.log('Response:', data)
  } catch (error) {
    console.error('Error:', error)
  }
}

testWebhook()