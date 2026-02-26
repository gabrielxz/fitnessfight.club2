'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Badge {
  emoji: string
  name: string
  tier: 'gold' | 'silver' | 'bronze'
}

interface Rival {
  user_id: string
  name: string
  rank: number | null
}

interface LeaderboardEntry {
  user_id: string
  rank: number
  name: string
  avatar: string | null
  total_points: number
  adjusted_points: number
  exercise_points: number
  habit_points: number
  badge_points: number
  this_week_hours: number
  badges: Badge[]
  kill_marks: number
  rival: Rival | null
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[]
  current_period: {
    metric_label: string
    metric_unit: string
    start_date: string
    end_date: string
  } | null
  current_user_id: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHours(decimal: number): string {
  const totalMinutes = Math.round(decimal * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0 && m === 0) return '0m'
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

/** Returns a subtle background + border tint based on rank position in the non-podium list */
function getZoneStyle(rank: number, total: number): React.CSSProperties {
  if (total <= 3) return {}
  // pct = 0 (just below podium) → 1 (last place)
  const pct = (rank - 4) / Math.max(total - 4, 1)
  if (pct < 0.3) {
    return {
      borderColor: 'rgba(251, 146, 60, 0.25)',
      background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.06) 0%, rgba(255,255,255,0.02) 100%)',
    }
  }
  if (pct > 0.7) {
    return {
      borderColor: 'rgba(99, 179, 237, 0.2)',
      background: 'linear-gradient(135deg, rgba(99, 179, 237, 0.05) 0%, rgba(255,255,255,0.02) 100%)',
    }
  }
  return {}
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function isAbsoluteUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function Avatar({ src, name, size, ringColor }: {
  src: string | null
  name: string
  size: number
  ringColor?: string
}) {
  const [error, setError] = useState(false)
  const validSrc = src && isAbsoluteUrl(src) ? src : null
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    ...(ringColor ? { boxShadow: `0 0 0 3px ${ringColor}` } : {}),
  }

  if (validSrc && !error) {
    return (
      <div style={{ position: 'relative', ...style, overflow: 'hidden' }}>
        <Image
          src={validSrc}
          alt={name}
          fill
          className="object-cover"
          sizes={`${size}px`}
          onError={() => setError(true)}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        ...style,
        background: 'linear-gradient(135deg, #FF6B35, #F7931E)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        color: 'white',
        fontSize: size * 0.35,
      }}
    >
      {getInitials(name)}
    </div>
  )
}

// ─── Kill Marks ───────────────────────────────────────────────────────────────

function KillMarks({ count }: { count: number }) {
  if (count === 0) return null
  // Show up to 8 juiceboxes inline; beyond that show count
  const display = count <= 8 ? '💀'.repeat(count) : `💀×${count}`
  return (
    <span className="text-sm leading-none" title={`${count} rivalry win${count !== 1 ? 's' : ''}`}>
      {display}
    </span>
  )
}

// ─── Badge Drawer ─────────────────────────────────────────────────────────────

function BadgeDrawer({ badges }: { badges: Badge[] }) {
  const [open, setOpen] = useState(false)
  if (badges.length === 0) return null

  return (
    <div>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-colors"
        style={{
          backgroundColor: 'rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        🏅 {badges.length}
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {badges.map((badge, i) => (
            <div key={i} className="relative group" title={`${badge.name} (${badge.tier})`}>
              <span className="text-xl transition-transform group-hover:scale-125 inline-block">
                {badge.emoji}
              </span>
              <div className={`
                absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-slate-900
                ${badge.tier === 'gold' ? 'bg-yellow-400' : ''}
                ${badge.tier === 'silver' ? 'bg-gray-400' : ''}
                ${badge.tier === 'bronze' ? 'bg-amber-700' : ''}
              `} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Score Popout ─────────────────────────────────────────────────────────────

function ScorePopout({ entry, size }: { entry: LeaderboardEntry; size: 'lg' | 'sm' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const hasMultiplier = entry.kill_marks > 0
  const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Click to see score breakdown"
        className={`font-black transition-colors ${
          size === 'lg' ? 'text-4xl' : 'text-base'
        }`}
        style={{ color: size === 'lg' ? 'inherit' : undefined }}
      >
        {size === 'lg' ? (
          <span className="text-orange-400">{fmt(entry.adjusted_points)}</span>
        ) : (
          <span className="text-orange-400">
            {fmt(entry.adjusted_points)}
            <span className="text-xs font-normal text-gray-500 ml-0.5">pts</span>
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 p-3 shadow-2xl rounded-xl"
          style={{
            background: 'rgb(15, 18, 35)',
            border: '1px solid rgba(251,146,60,0.4)',
            width: 210,
            bottom: '100%',
            right: size === 'lg' ? 'auto' : 0,
            left: size === 'lg' ? '50%' : 'auto',
            transform: size === 'lg' ? 'translateX(-50%)' : 'none',
            marginBottom: 8,
          }}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-gray-300">Score Breakdown</span>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">🏃 Exercise</span>
              <span className="font-semibold">{fmt(entry.exercise_points)} pts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">✅ Habits</span>
              <span className="font-semibold">{fmt(entry.habit_points)} pts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">🏅 Badges</span>
              <span className="font-semibold">{fmt(entry.badge_points)} pts</span>
            </div>
            <div className="flex justify-between pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
              <span>Subtotal</span>
              <span className="font-semibold">{fmt(entry.total_points)} pts</span>
            </div>
            {hasMultiplier && (
              <div className="flex justify-between" style={{ color: '#eab308' }}>
                <span>💀 {entry.kill_marks} {entry.kill_marks === 1 ? 'kill' : 'kills'}</span>
                <span className="font-semibold">×{(1 + entry.kill_marks * 0.01).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 font-bold text-orange-400" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span>Total</span>
              <span>{fmt(entry.adjusted_points)} pts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Podium Card (top 3) ──────────────────────────────────────────────────────

const PODIUM_CONFIG = {
  1: {
    ringColor: 'rgba(234, 179, 8, 1)',
    borderColor: 'rgba(234, 179, 8, 0.6)',
    background: 'linear-gradient(160deg, rgba(234,179,8,0.18) 0%, rgba(251,146,60,0.10) 60%, rgba(255,255,255,0.02) 100%)',
    stripColor: 'linear-gradient(90deg, #eab308, #f59e0b)',
    rankLabel: '1ST',
    rankColor: '#eab308',
    avatarSize: 96,
    glowShadow: '0 0 0 3px rgba(234,179,8,0.9), 0 0 24px rgba(234,179,8,0.4)',
    outerShadow: '0 0 40px rgba(234,179,8,0.2), 0 8px 32px rgba(0,0,0,0.4)',
  },
  2: {
    ringColor: 'rgba(209, 213, 219, 0.9)',
    borderColor: 'rgba(209, 213, 219, 0.35)',
    background: 'linear-gradient(160deg, rgba(209,213,219,0.10) 0%, rgba(255,255,255,0.02) 100%)',
    stripColor: 'linear-gradient(90deg, #9ca3af, #d1d5db)',
    rankLabel: '2ND',
    rankColor: '#d1d5db',
    avatarSize: 72,
    glowShadow: '0 0 0 3px rgba(209,213,219,0.8)',
    outerShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  3: {
    ringColor: 'rgba(217, 119, 6, 0.9)',
    borderColor: 'rgba(217, 119, 6, 0.35)',
    background: 'linear-gradient(160deg, rgba(217,119,6,0.10) 0%, rgba(255,255,255,0.02) 100%)',
    stripColor: 'linear-gradient(90deg, #b45309, #d97706)',
    rankLabel: '3RD',
    rankColor: '#d97706',
    avatarSize: 72,
    glowShadow: '0 0 0 3px rgba(217,119,6,0.8)',
    outerShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
} as const

function PodiumCard({ entry, isCurrentUser, marginTop }: {
  entry: LeaderboardEntry
  isCurrentUser: boolean
  marginTop?: number
}) {
  const config = PODIUM_CONFIG[entry.rank as 1 | 2 | 3]
  const isFirst = entry.rank === 1

  return (
    <div
      className="glass-card flex flex-col items-center text-center transition-all duration-300 hover:scale-[1.02]"
      style={{
        borderColor: config.borderColor,
        background: config.background,
        boxShadow: isCurrentUser
          ? `${config.outerShadow}, 0 0 0 2px rgba(251,146,60,0.7)`
          : config.outerShadow,
        marginTop: marginTop ?? 0,
      }}
    >
      {/* Content area */}
      <div className={`flex flex-col items-center gap-2 w-full ${isFirst ? 'pt-5 px-4 pb-4' : 'pt-4 px-3 pb-3'}`}>

        {/* Rank badge */}
        <div
          className="font-black tracking-widest text-xs px-2 py-0.5 rounded-full"
          style={{
            color: config.rankColor,
            backgroundColor: `${config.rankColor}22`,
            border: `1px solid ${config.rankColor}55`,
          }}
        >
          {config.rankLabel}
        </div>

        {/* Avatar with pulsing ring for #1 */}
        <div className="relative flex items-center justify-center" style={{ width: config.avatarSize + 16, height: config.avatarSize + 16 }}>
          {isFirst && (
            <div
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: 'rgba(234,179,8,0.15)', animationDuration: '2.5s' }}
            />
          )}
          <Avatar src={entry.avatar} name={entry.name} size={config.avatarSize} ringColor={config.ringColor} />
          {isFirst && (
            <div className="absolute -top-1 -right-1 text-lg">👑</div>
          )}
        </div>

        {/* Name */}
        <div className={`font-black leading-tight ${isFirst ? 'text-lg' : 'text-base'}`}>
          {isCurrentUser ? 'You' : entry.name}
        </div>

        {/* Rival */}
        {entry.rival && (
          <Link
            href="/rivalries"
            className="text-xs flex items-center justify-center gap-1 hover:text-orange-400 transition-colors -mt-1"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            ⚔️ {entry.rival.name}
          </Link>
        )}

        {/* Points — clickable for breakdown */}
        <div style={{ color: config.rankColor }}>
          <ScorePopout entry={entry} size={isFirst ? 'lg' : 'sm'} />
        </div>

        {/* Hours this week */}
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)', marginTop: -6 }}>
          {formatHours(entry.this_week_hours)} this wk
        </div>

        {/* Kill marks + badge drawer */}
        {(entry.kill_marks > 0 || entry.badges.length > 0) && (
          <div className="flex flex-col items-center gap-1.5 w-full pt-1">
            <KillMarks count={entry.kill_marks} />
            <BadgeDrawer badges={entry.badges} />
          </div>
        )}
      </div>

      {/* Colored platform strip at bottom */}
      <div className="w-full h-1.5 mt-auto rounded-b-xl" style={{ background: config.stripColor }} />
    </div>
  )
}

// ─── Athlete Row (rank 4+) ────────────────────────────────────────────────────

function AthleteRow({ entry, isCurrentUser, total }: { entry: LeaderboardEntry; isCurrentUser: boolean; total: number }) {
  const zoneStyle = getZoneStyle(entry.rank, total)

  return (
    <div
      className="glass-card px-4 py-3 flex items-center gap-3 transition-all duration-200 hover:scale-[1.01]"
      style={{
        ...zoneStyle,
        ...(isCurrentUser ? { boxShadow: '0 0 0 2px rgba(251,146,60,0.5)' } : {}),
      }}
    >
      {/* Rank */}
      <div
        className="text-sm font-black w-7 text-right shrink-0"
        style={{ color: 'rgba(255,255,255,0.2)' }}
      >
        #{entry.rank}
      </div>

      {/* Avatar */}
      <Avatar src={entry.avatar} name={entry.name} size={48} />

      {/* Name + rival + kill marks */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">
          {isCurrentUser ? 'You' : entry.name}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {entry.rival && (
            <Link
              href="/rivalries"
              className="text-xs hover:text-orange-400 transition-colors shrink-0"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              ⚔️ {entry.rival.name}
            </Link>
          )}
          <KillMarks count={entry.kill_marks} />
        </div>
      </div>

      {/* Points + hours + badge drawer */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <ScorePopout entry={entry} size="sm" />
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {formatHours(entry.this_week_hours)} this wk
        </div>
        <BadgeDrawer badges={entry.badges} />
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card p-5 flex flex-col items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-full" />
            <div className="w-16 h-16 bg-white/10 rounded-full" />
            <div className="h-4 w-20 bg-white/10 rounded" />
            <div className="h-8 w-12 bg-white/10 rounded" />
          </div>
        ))}
      </div>
      {[4, 5, 6, 7, 8].map(i => (
        <div key={i} className="glass-card px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-4 bg-white/10 rounded" />
          <div className="w-12 h-12 bg-white/10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 bg-white/10 rounded" />
            <div className="h-2 w-16 bg-white/10 rounded" />
          </div>
          <div className="h-5 w-10 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSkeleton />

  if (!data || data.leaderboard.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-gray-400">
        No athletes yet. Connect Strava to join the competition!
      </div>
    )
  }

  const { leaderboard, current_user_id } = data
  const podium = leaderboard.filter(e => e.rank <= 3)
  const rest = leaderboard.filter(e => e.rank > 3)
  const total = leaderboard.length

  return (
    <div className="space-y-3">
      {/* Podium — rendered in 2nd | 1st | 3rd order so #1 sits highest */}
      {podium.length > 0 && (
        <div className="mb-4">
          {podium.length === 3 ? (
            <div className="grid grid-cols-3 gap-2 items-start">
              {[podium[1], podium[0], podium[2]].map(entry => (
                <PodiumCard
                  key={entry.user_id}
                  entry={entry}
                  isCurrentUser={entry.user_id === current_user_id}
                  marginTop={entry.rank === 1 ? 0 : 40}
                />
              ))}
            </div>
          ) : (
            <div className={`grid gap-3 ${podium.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto'}`}>
              {podium.map(entry => (
                <PodiumCard
                  key={entry.user_id}
                  entry={entry}
                  isCurrentUser={entry.user_id === current_user_id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ranked list */}
      {rest.map(entry => (
        <AthleteRow
          key={entry.user_id}
          entry={entry}
          isCurrentUser={entry.user_id === current_user_id}
          total={total}
        />
      ))}
    </div>
  )
}
