'use client'

import { useState } from 'react'

// ─── Accordion Item ───────────────────────────────────────────────────────────

function AccordionItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="glass-card overflow-hidden transition-all duration-200"
      style={open ? { borderColor: 'rgba(251,146,60,0.3)' } : {}}
    >
      <button
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 font-semibold"
        onClick={() => setOpen(o => !o)}
      >
        <span>{question}</span>
        <span className="text-gray-400 shrink-0 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 text-gray-300 text-sm leading-relaxed space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-4 first:mt-0">
      <span className="text-3xl">{icon}</span>
      <h2 className="text-2xl font-black">{title}</h2>
    </div>
  )
}

// ─── Badge Tier Grid ──────────────────────────────────────────────────────────

function BadgeTiers({ bronze, silver, gold, unit }: {
  bronze: string
  silver: string
  gold: string
  unit: string
}) {
  return (
    <div className="grid grid-cols-3 gap-2 my-3">
      {[
        { label: 'Bronze 🥉', value: bronze, color: '#92400e', bg: 'rgba(146,64,14,0.15)' },
        { label: 'Silver 🥈', value: silver, color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
        { label: 'Gold 🥇', value: gold, color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
      ].map(tier => (
        <div key={tier.label} className="rounded-lg p-2 text-center" style={{ backgroundColor: tier.bg }}>
          <div className="text-xs font-bold mb-1" style={{ color: tier.color }}>{tier.label}</div>
          <div className="text-sm font-black">{tier.value}</div>
          <div className="text-xs text-gray-500">{unit}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Rivalry Schedule ─────────────────────────────────────────────────────────

const RIVALRY_SCHEDULE = [
  { period: 1,  label: 'All-Purpose Distance',  dates: 'Feb 23 – Mar 8',  icon: '🗺️' },
  { period: 2,  label: 'All-Purpose Distance',  dates: 'Mar 9 – Mar 22',  icon: '🗺️' },
  { period: 3,  label: 'All-Purpose Distance',  dates: 'Mar 23 – Apr 5',  icon: '🗺️' },
  { period: 4,  label: 'All-Purpose Distance',  dates: 'Apr 6 – Apr 19',  icon: '🗺️' },
  { period: 5,  label: 'Run & Walk Distance',   dates: 'Apr 20 – May 3',  icon: '🏃' },
  { period: 6,  label: 'Strength Sessions',     dates: 'May 4 – May 17',  icon: '💪' },
  { period: 7,  label: 'Hours Exercised',       dates: 'May 18 – May 31', icon: '⏱️' },
  { period: 8,  label: 'Active Days',           dates: 'Jun 1 – Jun 14',  icon: '📅' },
  { period: 9,  label: 'Elevation Climbed',     dates: 'Jun 15 – Jun 28', icon: '⛰️' },
  { period: 10, label: 'Variety Week',          dates: 'Jun 29 – Jul 12', icon: '🎯' },
  { period: 11, label: 'Yoga Week',             dates: 'Jul 13 – Jul 26', icon: '🧘' },
  { period: 12, label: 'Dance Week',            dates: 'Jul 27 – Aug 9',  icon: '💃' },
  { period: 13, label: 'Run & Walk Distance',   dates: 'Aug 10 – Aug 17', icon: '🏃' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FAQContent() {
  return (
    <div className="max-w-2xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-black mb-3">
              <span className="gradient-text">How It Works</span>
            </h1>
            <p className="text-gray-400 text-lg">Everything you need to know about Fitness Fight Club.</p>
          </div>

          {/* ── Points ── */}
          <SectionHeader icon="💰" title="Points" />

          <div className="space-y-3">
            <AccordionItem question="How do I earn exercise points?">
              <p>You earn <strong>1 point per hour of exercise</strong>, capped at <strong>9 hours per week</strong> (9 points max).</p>
              <p>Points are calculated automatically from your Strava activities. Connect your Strava account on the Profile page and your workouts will sync instantly — no manual logging needed.</p>
            </AccordionItem>

            <AccordionItem question="What counts as exercise?">
              <p>Any activity you record on Strava counts: runs, rides, walks, swims, gym sessions, yoga, soccer — all of it. The clock starts when you hit record and stops when you finish.</p>
              <p>The only thing that matters is moving time, not elapsed time. So a 1-hour ride with a 10-minute coffee stop counts as 1 hour, not 1h 10m.</p>
            </AccordionItem>

            <AccordionItem question="How do habit points work?">
              <p>You can set up personal habits (like "meditate daily" or "stretch every morning") on the Habits page.</p>
              <p>Each habit has a <strong>weekly target</strong> (e.g. 3×/week). If you hit your target by Sunday, you earn <strong>0.5 points</strong> for that habit.</p>
              <p>Only your first 5 habits count toward points — so choose wisely!</p>
            </AccordionItem>

            <AccordionItem question="How do badge points work?">
              <p>Earning a badge awards bonus points on top of your exercise and habit points:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>🥉 Bronze — 3 points</li>
                <li>🥈 Silver — 6 points</li>
                <li>🥇 Gold — 15 points</li>
              </ul>
              <p>Badge points are <strong>permanent</strong> — they don't reset at the end of the week.</p>
            </AccordionItem>

            <AccordionItem question="Do points ever reset?">
              <p>No. Points are <strong>cumulative all season</strong>. Every point you earn stacks on top of everything you've earned before. The leaderboard shows your all-time total.</p>
              <p>Exercise points are capped weekly (9 pts/week max), but they count toward your running total once earned.</p>
            </AccordionItem>
          </div>

          {/* ── Leaderboard ── */}
          <SectionHeader icon="🏆" title="Leaderboard" />

          <div className="space-y-3">
            <AccordionItem question="How is the leaderboard ranked?">
              <p>Everyone is on a single leaderboard, ranked by <strong>total cumulative points</strong>. The more you exercise, the more habits you keep, and the more badges you earn — the higher you climb.</p>
              <p>There are no divisions this season. One leaderboard. One competition.</p>
            </AccordionItem>

            <AccordionItem question="What are the 💀 kill marks?">
              <p>Those are <strong>rivalry kill marks</strong> — one 💀 for each bi-weekly rivalry you've won over the course of the season.</p>
              <p>They also boost your score: each kill mark adds 1% to your total points. Win enough and the multiplier starts to matter.</p>
            </AccordionItem>
          </div>

          {/* ── Rivalries ── */}
          <SectionHeader icon="⚔️" title="Rivalries" />

          <div className="space-y-3">
            <AccordionItem question="What are Rivalries?">
              <p>Every two weeks, you're paired with another player near your rank for a head-to-head competition on a <strong>specific metric</strong> — distance, time, elevation, or relative effort.</p>
              <p>Whoever scores higher on that metric over the two-week period wins. The winner earns a 💀 kill mark on their profile. If it's a tie, nobody gets the kill mark.</p>
            </AccordionItem>

            <AccordionItem question="How are rivals chosen?">
              <p>You're paired with someone close to you in the standings. The system avoids rematching you with the same person twice in a row, so you'll face a variety of opponents over the season.</p>
              <p>If there's an odd number of players, the person at the bottom of the standings that period sits it out.</p>
            </AccordionItem>

            <AccordionItem question="What's the rivalry schedule this season?">
              <div className="space-y-2 mt-2">
                {RIVALRY_SCHEDULE.map(p => (
                  <div
                    key={p.period}
                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-xl">{p.icon}</span>
                    <span className="font-semibold text-sm flex-1">{p.label}</span>
                    <span className="text-xs text-gray-500">{p.dates}</span>
                  </div>
                ))}
              </div>
            </AccordionItem>

            <AccordionItem question="Do rivalry wins affect my points total?">
              <p>Yes. Each 💀 kill mark adds <strong>1% to your total score</strong>. Win 5 rivalries and your score is multiplied by 1.05. Win 10 and it's ×1.10. The multiplier applies to your full cumulative score, so it compounds meaningfully over a long season.</p>
            </AccordionItem>
          </div>

          {/* ── Badges ── */}
          <SectionHeader icon="🏅" title="Badges" />

          <div className="space-y-3">
            <AccordionItem question="How do badges work?">
              <p>Badges are earned automatically when you hit certain milestones — no manual claiming needed. Each badge has three tiers: Bronze, Silver, and Gold. Earning a higher tier replaces the lower one, and you always keep the best tier you've reached.</p>
              <p>Badges are calculated whenever a Strava activity syncs or during the weekly Sunday cron. Badge points are <strong>permanent</strong> and stack on top of your exercise and habit points.</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>🥉 Bronze — 3 points</li>
                <li>🥈 Silver — 6 points</li>
                <li>🥇 Gold — 15 points</li>
              </ul>
              <p className="mt-2">There are currently <strong>11 active badges</strong> this season. Details for each one are below.</p>
            </AccordionItem>

            <AccordionItem question="🥵  Tryhard">
              <p>The Tryhard badge rewards <strong>workout intensity</strong>. It's based on Strava's <em>Relative Effort</em> score — a heart-rate-derived measure of how hard you pushed during a workout. Higher intensity and longer duration both contribute to a higher Relative Effort score.</p>
              <p>This is a <strong>weekly badge</strong>: your Relative Effort accumulates from Monday to Sunday, then resets. To qualify for a tier, you must hit the threshold in a single week. The tiers are:</p>
              <BadgeTiers bronze="150" silver="350" gold="600" unit="Relative Effort / week" />
              <p>Note: Relative Effort requires heart rate data from your device. Activities logged without a heart rate monitor won't contribute to this badge. Riding hard, running fast, and HIIT-style workouts tend to generate the highest scores.</p>
            </AccordionItem>

            <AccordionItem question="🏔  Everester">
              <p>The Everester badge is a <strong>cumulative all-time elevation challenge</strong>. Every meter you climb on every Strava activity counts — runs, rides, hikes, ski days, anything. The total accumulates across the entire season, never resets.</p>
              <p>The tiers are named after milestones in the world of climbing:</p>
              <BadgeTiers bronze="600" silver="2,212" gold="4,424" unit="meters elevation (all-time)" />
              <p>If you're a cyclist or hiker, you'll rack this up quickly. Even flat-terrain runners will eventually accumulate enough to hit Bronze. Gold requires serious vertical — roughly equivalent to climbing the height of Mont Blanc twice over.</p>
            </AccordionItem>

            <AccordionItem question="🐂  Iron Calves">
              <p>Iron Calves is a <strong>weekly cycling challenge</strong>. It counts total bike miles across all cycling activity types logged in a single week (Ride, E-Bike Ride, Mountain Bike, Gravel Ride, Virtual Ride).</p>
              <p>This is a <strong>weekly badge</strong>: your bike miles reset every Monday. You need to hit the threshold within a single week to qualify for the tier.</p>
              <BadgeTiers bronze="10" silver="50" gold="90" unit="bike miles / week" />
              <p>Bronze is very achievable with just a couple of casual rides. Silver (~50 miles) is a solid weekly cycling goal. Gold at 90 miles is serious — that's multiple multi-hour rides in a week.</p>
            </AccordionItem>

            <AccordionItem question="🧘  Zen Master">
              <p>Zen Master rewards <strong>dedicated time on the mat</strong>. It counts the total moving time logged in Yoga and Pilates activities during a single week.</p>
              <p>This is a <strong>weekly badge</strong>: your yoga hours reset every Monday. Hit the threshold in any given week to qualify.</p>
              <BadgeTiers bronze="1" silver="4" gold="10" unit="yoga hours / week" />
              <p>Bronze is just one session. Silver requires four hours — roughly four 60-minute classes in a week. Gold at 10 hours is a genuine yoga retreat pace. Log your practices consistently on Strava as "Yoga" or "Pilates" to have them counted.</p>
            </AccordionItem>

            <AccordionItem question="📸  Belfie">
              <p>A "belfie" is a workout selfie — and this badge rewards you for documenting your fitness journey with photos. A week qualifies when at least one of your Strava activities that week has a <strong>photo attached</strong>.</p>
              <p>This badge counts <strong>qualifying weeks</strong> over time. You don't need photos every activity — just one photo on one activity during the week is enough.</p>
              <BadgeTiers bronze="1" silver="6" gold="12" unit="weeks with a photo" />
              <p>To attach a photo, add it to your Strava activity before or after uploading. Gold requires 12 weeks of documented workouts — roughly a quarter of the season. Get your phone out!</p>
            </AccordionItem>

            <AccordionItem question="🪨  Rock Solid">
              <p>Rock Solid is the <strong>habit discipline badge</strong>. It rewards weeks where you achieve <strong>100% completion on all of your first 5 habits</strong>. Every habit must hit its weekly target — not just most of them, all of them.</p>
              <p>This badge counts <strong>qualifying weeks</strong> over the season. Habits are evaluated on Sunday night by the weekly cron.</p>
              <BadgeTiers bronze="1" silver="4" gold="12" unit="perfect habit weeks" />
              <p>If you have fewer than 5 habits set up, all of your habits must be completed. If you have more than 5, only the first 5 (by creation date) count toward this badge. Gold at 12 weeks means staying truly rock solid for a quarter of the season — a serious commitment to your goals.</p>
            </AccordionItem>

            <AccordionItem question="🛑  No Chill">
              <p>No Chill rewards <strong>absolute volume weeks</strong> — logging a massive amount of exercise. A week qualifies when your total moving time across all activities reaches <strong>12 or more hours</strong>.</p>
              <p>Note: the regular exercise cap for points is 9 hours per week, but No Chill counts beyond that. There's no ceiling — if you log it, it counts.</p>
              <BadgeTiers bronze="1" silver="6" gold="12" unit="weeks with 12+ hrs of exercise" />
              <p>Hitting 12 hours in a single week is legitimately hard — that's nearly two hours of exercise every day, or a mix of longer endurance sessions and multiple daily workouts. Bronze is a one-time proof of commitment. Gold means doing this 12 times over the season. Truly no chill.</p>
            </AccordionItem>

            <AccordionItem question="🕺  Rhythm Engine">
              <p>Rhythm Engine is a <strong>cumulative all-time dance challenge</strong>. It counts the total moving time across all "Dance" activities you log on Strava — forever, no weekly reset.</p>
              <BadgeTiers bronze="60" silver="240" gold="600" unit="total dance minutes" />
              <p>That's 1 hour for Bronze, 4 hours for Silver, and 10 hours for Gold. Log your Zumba, dance fitness classes, or freestyle sessions on Strava as "Dance" and every minute counts toward this badge. Gold is a lot of dancing — but if you're a regular, you'll get there.</p>
            </AccordionItem>

            <AccordionItem question="🏅  Decathlon">
              <p>Decathlon rewards <strong>athletic variety</strong> by challenging you to try a specific list of less-common sports. Each sport on the qualifying list counts only once (no matter how many times you do it), and each session must be <strong>at least 15 minutes</strong> long to count.</p>
              <BadgeTiers bronze="2" silver="4" gold="6" unit="distinct qualifying sports" />
              <p className="font-semibold text-gray-200 mt-2">The 17 qualifying sports:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                {[
                  'Basketball', 'Cricket', 'Golf', 'Ice Skate', 'Padel',
                  'Racquetball', 'Rowing', 'Skateboard', 'Surfing', 'Squash',
                  'Tennis', 'Volleyball', 'Mountain Bike Ride', 'Badminton',
                  'Elliptical', 'Inline Skate', 'Pickleball',
                ].map(sport => (
                  <div key={sport} className="text-gray-400">• {sport}</div>
                ))}
              </div>
              <p className="mt-2">Your regular runs and rides don't count here — it's specifically designed to push you outside your comfort zone. Gold requires trying 6 different sports from the list, each for at least 15 minutes.</p>
            </AccordionItem>

            <AccordionItem question="🎨  Renaissance">
              <p>Renaissance rewards <strong>weekly variety across all activity types</strong>. A week qualifies when you log activities in <strong>4 or more distinct categories</strong> during that Monday–Sunday window. Categories are broader buckets — not individual sport types.</p>
              <BadgeTiers bronze="1" silver="4" gold="12" unit="weeks with 4+ categories" />
              <p className="font-semibold text-gray-200 mt-2">The 12 activity categories:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                {[
                  ['Run', 'Run, Trail Run, Virtual Run'],
                  ['Walk / Hike', 'Walk, Hike'],
                  ['Ride', 'Ride, E-Bike, MTB, Gravel, Virtual Ride'],
                  ['Strength', 'Weight Training, Crossfit, Workout, HIIT'],
                  ['Yoga / Flexibility', 'Yoga, Pilates'],
                  ['Water', 'Swim, Row, Kayak, SUP, Surf, Sail…'],
                  ['Winter', 'Alpine/Nordic Ski, Snowboard, Ice Skate…'],
                  ['Racket Sports', 'Tennis, Badminton, Squash, Pickleball, Padel…'],
                  ['Team / Court', 'Soccer, Basketball, Volleyball, Cricket'],
                  ['Dance', 'Dance'],
                  ['Cardio / Machine', 'Elliptical, Stair Stepper, Inline Skate…'],
                  ['Adventure', 'Golf, Rock Climb, Skateboard'],
                ].map(([cat, sports]) => (
                  <div key={cat}>
                    <span className="font-semibold text-gray-200">{cat}:</span>{' '}
                    <span className="text-gray-400">{sports}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2">For example: a week with a run, a yoga session, a strength workout, and a bike ride hits 4 categories and qualifies. Gold requires 12 qualifying weeks — a full season of well-rounded training.</p>
            </AccordionItem>

            <AccordionItem question="🧭  Out of Bounds">
              <p>Out of Bounds rewards <strong>exercising far from home</strong>. It tracks the total hours you spend working out at locations <strong>100 or more miles from your home</strong>. This could be a vacation run, a trail race in another city, a ski trip — any activity recorded via GPS that starts at least 100 miles from your registered home location.</p>
              <p>This is a <strong>cumulative all-time badge</strong> — your away hours accumulate over the whole season, no weekly reset. Distance is calculated using GPS coordinates from your Strava activity's start point.</p>
              <BadgeTiers bronze="3" silver="10" gold="20" unit="hours exercised 100+ mi from home" />
              <p>Your home location is set once by the admin based on your activity history. If you travel regularly for fitness — destination races, ski weekends, beach workouts — this badge will add up. Gold at 20 hours means a serious amount of fitness tourism.</p>
            </AccordionItem>
          </div>

          {/* ── General ── */}
          <SectionHeader icon="❓" title="General" />

          <div className="space-y-3">
            <AccordionItem question="When does the week reset?">
              <p>Weeks run <strong>Monday through Sunday</strong>. The exercise cap resets at midnight Monday in your local timezone (defaulting to Eastern Time if you haven't set your timezone).</p>
            </AccordionItem>

            <AccordionItem question="My activity didn't sync — what do I do?">
              <p>Head to your <strong>Profile</strong> page and hit the <strong>"Sync Now"</strong> button. This pulls your last 30 Strava activities and recalculates your points.</p>
              <p>If activities are still missing, make sure your Strava account is connected and that the activity is public (or followers-only) on Strava.</p>
            </AccordionItem>

            <AccordionItem question="Who built this?">
              <p>FFC was built by Gabriel Beal as a fun way to keep a group of friends accountable and competing. If something's broken, bug him about it.</p>
            </AccordionItem>
          </div>
    </div>
  )
}
