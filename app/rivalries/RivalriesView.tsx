'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

function isAbsoluteUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  user_id: string
  name: string
  avatar: string | null
  kill_marks: number
  metric_value: number
}

interface Matchup {
  id: string
  player1: Player
  player2: Player
  winner_id: string | null
}

interface Period {
  id: string
  period_number: number
  start_date: string
  end_date: string
  metric: string
  metric_label: string
  metric_unit: string
}

interface RivalriesData {
  all_periods: Period[]
  current_period: Period | null
  matchups: Matchup[]
  current_user_id: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMetricValue(value: number, metric: string, unit: string): string {
  if (metric === 'moving_time') {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }
  if (metric === 'distance') return `${value.toFixed(1)} ${unit}`
  if (metric === 'elevation_gain') return `${Math.round(value)} ${unit}`
  return `${value} ${unit}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ─── PlayerFace ───────────────────────────────────────────────────────────────

function PlayerFace({ player, isCurrentUser, isWinner, isLoser, align }: {
  player: Player
  isCurrentUser: boolean
  isWinner: boolean | null   // null = still in progress
  isLoser: boolean | null
  align: 'left' | 'right'
}) {
  const [imgError, setImgError] = useState(false)

  const dimmed = isLoser === true

  return (
    <div className={`flex flex-col items-center gap-3 flex-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      {/* Avatar */}
      <div
        className="relative"
        style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity 0.3s' }}
      >
        <div
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex items-center justify-center font-bold text-3xl"
          style={{
            background: 'linear-gradient(135deg, #FF6B35, #F7931E)',
            boxShadow: isWinner
              ? '0 0 0 4px rgba(234,179,8,0.8), 0 0 32px rgba(234,179,8,0.3)'
              : isCurrentUser
                ? '0 0 0 3px rgba(251,146,60,0.6)'
                : '0 0 0 2px rgba(255,255,255,0.1)',
          }}
        >
          {player.avatar && isAbsoluteUrl(player.avatar) && !imgError ? (
            <Image
              src={player.avatar}
              alt={player.name}
              width={112}
              height={112}
              className="object-cover w-full h-full"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-white">{getInitials(player.name)}</span>
          )}
        </div>
        {isWinner && (
          <div className="absolute -top-2 -right-2 text-2xl">👑</div>
        )}
      </div>

      {/* Name */}
      <div className={`text-center ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <div className="font-black text-lg leading-tight">
          {isCurrentUser ? 'You' : player.name}
        </div>
        {/* Kill marks */}
        {player.kill_marks > 0 && (
          <div className="text-sm mt-0.5" title={`${player.kill_marks} rivalry win${player.kill_marks !== 1 ? 's' : ''}`}>
            {'💀'.repeat(Math.min(player.kill_marks, 8))}
            {player.kill_marks > 8 && <span className="text-xs text-gray-400 ml-1">×{player.kill_marks}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Matchup Card ─────────────────────────────────────────────────────────────

function MatchupCard({ matchup, currentPeriod, currentUserId, isHero }: {
  matchup: Matchup
  currentPeriod: Period
  currentUserId: string | null
  isHero: boolean
}) {
  const { player1, player2, winner_id } = matchup
  const inProgress = winner_id === null

  const p1Wins = !inProgress && winner_id === player1.user_id
  const p2Wins = !inProgress && winner_id === player2.user_id
  const isTie = !inProgress && winner_id === null // shouldn't happen but guard

  const p1Leading = inProgress && player1.metric_value > player2.metric_value
  const p2Leading = inProgress && player2.metric_value > player1.metric_value

  const p1IsUser = player1.user_id === currentUserId
  const p2IsUser = player2.user_id === currentUserId

  const totalMetric = player1.metric_value + player2.metric_value
  const p1Pct = totalMetric > 0 ? (player1.metric_value / totalMetric) * 100 : 50
  const p2Pct = 100 - p1Pct

  return (
    <div
      className={`glass-card overflow-hidden ${isHero ? 'p-6' : 'p-4'}`}
      style={isHero ? {
        borderColor: 'rgba(251,146,60,0.4)',
        background: 'linear-gradient(135deg, rgba(251,146,60,0.08) 0%, rgba(255,255,255,0.02) 100%)',
        boxShadow: '0 0 40px rgba(251,146,60,0.1)',
      } : {}}
    >
      {isHero && (
        <div className="text-center mb-5">
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'rgba(251,146,60,0.8)' }}>
            Your Rivalry
          </span>
        </div>
      )}

      {/* Players + VS */}
      <div className="flex items-center gap-4">
        <PlayerFace
          player={player1}
          isCurrentUser={p1IsUser}
          isWinner={inProgress ? null : p1Wins}
          isLoser={inProgress ? null : !p1Wins && !isTie}
          align="left"
        />

        <div className="flex flex-col items-center gap-2 shrink-0">
          <div
            className="font-black text-3xl sm:text-4xl"
            style={{ color: 'rgba(255,255,255,0.15)', letterSpacing: '0.05em' }}
          >
            VS
          </div>
          {inProgress && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(251,146,60,0.15)', color: 'rgba(251,146,60,0.9)' }}>
              LIVE
            </span>
          )}
        </div>

        <PlayerFace
          player={player2}
          isCurrentUser={p2IsUser}
          isWinner={inProgress ? null : p2Wins}
          isLoser={inProgress ? null : !p2Wins && !isTie}
          align="right"
        />
      </div>

      {/* Live metric bar */}
      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-xs text-gray-400 font-medium">
          <span>{formatMetricValue(player1.metric_value, currentPeriod.metric, currentPeriod.metric_unit)}</span>
          <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {currentPeriod.metric_label}
          </span>
          <span>{formatMetricValue(player2.metric_value, currentPeriod.metric, currentPeriod.metric_unit)}</span>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-l-full transition-all duration-700"
            style={{
              width: `${p1Pct}%`,
              background: p1Leading || p1Wins
                ? 'linear-gradient(90deg, #FF6B35, #F7931E)'
                : 'rgba(255,255,255,0.15)',
            }}
          />
          <div
            className="h-full rounded-r-full transition-all duration-700"
            style={{
              width: `${p2Pct}%`,
              background: p2Leading || p2Wins
                ? 'linear-gradient(90deg, #F7931E, #FF6B35)'
                : 'rgba(255,255,255,0.15)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Season Schedule ──────────────────────────────────────────────────────────

function SeasonSchedule({ periods, currentPeriod }: { periods: Period[]; currentPeriod: Period | null }) {
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="glass-card p-5">
      <h2 className="font-black text-lg mb-4">Season Schedule</h2>
      <div className="space-y-2">
        {periods.map(period => {
          const isActive = period.start_date <= today && period.end_date >= today
          const isPast = period.end_date < today

          return (
            <div
              key={period.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{
                backgroundColor: isActive
                  ? 'rgba(251,146,60,0.1)'
                  : 'rgba(255,255,255,0.03)',
                border: isActive
                  ? '1px solid rgba(251,146,60,0.3)'
                  : '1px solid rgba(255,255,255,0.05)',
                opacity: isPast ? 0.5 : 1,
              }}
            >
              <div className="text-xs font-bold w-6 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {period.period_number}
              </div>
              <div className="flex-1">
                <span className="font-semibold text-sm">{period.metric_label}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {formatDate(period.start_date)} – {formatDate(period.end_date)}
                </span>
              </div>
              {isActive && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(251,146,60,0.2)', color: '#F7931E' }}>
                  NOW
                </span>
              )}
              {isPast && <span className="text-xs text-gray-600">Done</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Client View ─────────────────────────────────────────────────────────

export default function RivalriesView() {
  const [data, setData] = useState<RivalriesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/rivalries')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const myMatchup = data?.matchups.find(
    m => m.player1.user_id === data.current_user_id || m.player2.user_id === data.current_user_id
  ) ?? null

  const otherMatchups = data?.matchups.filter(m => m !== myMatchup) ?? []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="text-center">
        <h1 className="text-4xl lg:text-5xl font-black mb-2">
          <span className="gradient-text">Rivalries</span>
        </h1>
        {data?.current_period ? (
          <p className="text-gray-400">
            Period {data.current_period.period_number} · {data.current_period.metric_label} ·{' '}
            {formatDate(data.current_period.start_date)} – {formatDate(data.current_period.end_date)}
          </p>
        ) : (
          <p className="text-gray-500">No active rivalry period</p>
        )}
      </div>

      {loading && (
        <div className="glass-card p-8 text-center animate-pulse">
          <div className="h-6 w-32 bg-white/10 rounded mx-auto mb-4" />
          <div className="h-32 bg-white/10 rounded" />
        </div>
      )}

      {!loading && data?.current_period && (
        <>
          {/* My matchup hero */}
          {myMatchup && (
            <MatchupCard
              matchup={myMatchup}
              currentPeriod={data.current_period}
              currentUserId={data.current_user_id}
              isHero
            />
          )}

          {/* Other matchups */}
          {otherMatchups.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-gray-400 text-sm uppercase tracking-wider px-1">
                All Matchups
              </h2>
              {otherMatchups.map(m => (
                <MatchupCard
                  key={m.id}
                  matchup={m}
                  currentPeriod={data.current_period!}
                  currentUserId={data.current_user_id}
                  isHero={false}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !data?.current_period && (
        <div className="glass-card p-8 text-center text-gray-500">
          Rivalry periods haven&apos;t started yet. Check back soon!
        </div>
      )}

      {/* Season schedule — always visible */}
      {!loading && data && data.all_periods.length > 0 && (
        <SeasonSchedule periods={data.all_periods} currentPeriod={data.current_period} />
      )}
    </div>
  )
}
