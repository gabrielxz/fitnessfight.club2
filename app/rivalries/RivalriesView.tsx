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

interface HistoryEntry {
  matchup_id: string
  period: Period
  you: { user_id: string; name: string; avatar: string | null; score: number }
  opponent: { user_id: string; name: string; avatar: string | null; score: number }
  winner_id: string | null
  outcome: 'win' | 'loss' | 'tie'
  kill_marks_at_close: number
}

interface RivalriesData {
  all_periods: Period[]
  current_period: Period | null
  matchups: Matchup[]
  my_history: HistoryEntry[]
  unacknowledged_result: HistoryEntry | null
  current_user_id: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMetricValue(value: number, metric: string, unit: string): string {
  if (metric === 'moving_time' || metric === 'yoga_time' || metric === 'dance_time') {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }
  if (metric === 'total_distance' || metric === 'run_distance') return `${value.toFixed(1)} ${unit}`
  if (metric === 'elevation_gain') return `${Math.round(value)} ${unit}`
  return `${Math.round(value)} ${unit}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 112, ringColor }: { src: string | null; name: string; size?: number; ringColor?: string }) {
  const [imgError, setImgError] = useState(false)
  const boxShadow = ringColor ? `0 0 0 3px ${ringColor}` : undefined
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size / 3,
        background: 'linear-gradient(135deg, #FF6B35, #F7931E)',
        boxShadow,
      }}
    >
      {src && isAbsoluteUrl(src) && !imgError ? (
        <Image src={src} alt={name} width={size} height={size} className="object-cover w-full h-full" onError={() => setImgError(true)} />
      ) : (
        <span className="text-white">{getInitials(name)}</span>
      )}
    </div>
  )
}

// ─── PlayerFace (current matchup card) ────────────────────────────────────────

function PlayerFace({ player, isCurrentUser, isWinner, isLoser, align }: {
  player: Player
  isCurrentUser: boolean
  isWinner: boolean | null
  isLoser: boolean | null
  align: 'left' | 'right'
}) {
  const [imgError, setImgError] = useState(false)
  const dimmed = isLoser === true

  return (
    <div className={`flex flex-col items-center gap-3 flex-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
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
        {isWinner && <div className="absolute -top-2 -right-2 text-2xl">👑</div>}
      </div>

      <div className={`text-center ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <div className="font-black text-lg leading-tight">
          {isCurrentUser ? 'You' : player.name}
        </div>
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
  const isTie = !inProgress && winner_id === null

  const p1Leading = inProgress && player1.metric_value > player2.metric_value
  const p2Leading = inProgress && player2.metric_value > player1.metric_value

  const p1IsUser = player1.user_id === currentUserId
  const p2IsUser = player2.user_id === currentUserId

  const totalMetric = player1.metric_value + player2.metric_value
  const p1Pct = totalMetric > 0 ? (player1.metric_value / totalMetric) * 100 : 50
  const tugWidth = Math.abs(p1Pct - 50) / 2

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

      <div className="flex items-center gap-4">
        <PlayerFace
          player={player1}
          isCurrentUser={p1IsUser}
          isWinner={inProgress ? null : p1Wins}
          isLoser={inProgress ? null : !p1Wins && !isTie}
          align="left"
        />

        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="font-black text-3xl sm:text-4xl" style={{ color: 'rgba(255,255,255,0.15)', letterSpacing: '0.05em' }}>
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

      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-xs text-gray-400 font-medium">
          <span>{formatMetricValue(player1.metric_value, currentPeriod.metric, currentPeriod.metric_unit)}</span>
          <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {currentPeriod.metric_label}
          </span>
          <span>{formatMetricValue(player2.metric_value, currentPeriod.metric, currentPeriod.metric_unit)}</span>
        </div>

        <div className="h-2.5 rounded-full overflow-hidden relative" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <div className="absolute top-0 bottom-0 w-px" style={{ left: 'calc(50% - 0.5px)', backgroundColor: 'rgba(255,255,255,0.25)' }} />
          {tugWidth > 0 && (
            <div
              className="absolute top-0 h-full transition-all duration-700"
              style={{
                width: `${tugWidth}%`,
                ...(p1Leading || p1Wins
                  ? { right: '50%', borderRadius: '9999px 0 0 9999px', background: 'linear-gradient(90deg, #FF6B35, #F7931E)' }
                  : { left: '50%',  borderRadius: '0 9999px 9999px 0', background: 'linear-gradient(90deg, #F7931E, #FF6B35)' }
                ),
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Season Schedule ──────────────────────────────────────────────────────────

function SeasonSchedule({ periods }: { periods: Period[] }) {
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
                backgroundColor: isActive ? 'rgba(251,146,60,0.1)' : 'rgba(255,255,255,0.03)',
                border: isActive ? '1px solid rgba(251,146,60,0.3)' : '1px solid rgba(255,255,255,0.05)',
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

// ─── History list ─────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: 'win' | 'loss' | 'tie' }) {
  const config = {
    win:  { label: 'WON',  bg: 'rgba(234,179,8,0.15)',  fg: '#FCD34D' },
    loss: { label: 'LOST', bg: 'rgba(148,163,184,0.12)', fg: 'rgba(203,213,225,0.75)' },
    tie:  { label: 'TIE',  bg: 'rgba(251,146,60,0.12)',  fg: 'rgba(251,146,60,0.9)' },
  }[outcome]
  return (
    <span
      className="text-xs font-black tracking-widest px-2 py-1 rounded-full"
      style={{ backgroundColor: config.bg, color: config.fg }}
    >
      {config.label}
    </span>
  )
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const youWon = entry.outcome === 'win'
  const youLost = entry.outcome === 'loss'
  const metricLine = `${formatMetricValue(entry.you.score, entry.period.metric, entry.period.metric_unit)} – ${formatMetricValue(entry.opponent.score, entry.period.metric, entry.period.metric_unit)}`

  return (
    <div
      className="glass-card p-4"
      style={{
        borderColor: youWon ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.06)',
        background: youWon
          ? 'linear-gradient(135deg, rgba(234,179,8,0.05) 0%, rgba(255,255,255,0.02) 100%)'
          : undefined,
        opacity: youLost ? 0.85 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Period {entry.period.period_number}
          </span>
          <span>·</span>
          <span>{entry.period.metric_label}</span>
          <span>·</span>
          <span>{formatDate(entry.period.start_date)} – {formatDate(entry.period.end_date)}</span>
        </div>
        <OutcomeBadge outcome={entry.outcome} />
      </div>

      <div className="flex items-center gap-3 mt-3">
        <Avatar
          src={entry.opponent.avatar}
          name={entry.opponent.name}
          size={44}
          ringColor={youWon ? 'rgba(255,255,255,0.1)' : youLost ? 'rgba(234,179,8,0.6)' : 'rgba(251,146,60,0.5)'}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">vs {entry.opponent.name}</div>
          <div className="text-sm text-gray-400 font-mono">{metricLine}</div>
        </div>
      </div>
    </div>
  )
}

function HistoryList({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-gray-500">
        No completed rivalries yet. Check back after your first period closes!
      </div>
    )
  }

  const wins = history.filter(e => e.outcome === 'win').length
  const losses = history.filter(e => e.outcome === 'loss').length
  const ties = history.filter(e => e.outcome === 'tie').length

  return (
    <div className="space-y-3">
      <div className="glass-card p-4 flex items-center justify-around text-center">
        <div>
          <div className="text-2xl font-black" style={{ color: '#FCD34D' }}>{wins}</div>
          <div className="text-xs uppercase tracking-wider text-gray-400">Wins</div>
        </div>
        <div className="w-px h-10" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        <div>
          <div className="text-2xl font-black" style={{ color: 'rgba(203,213,225,0.9)' }}>{losses}</div>
          <div className="text-xs uppercase tracking-wider text-gray-400">Losses</div>
        </div>
        <div className="w-px h-10" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        <div>
          <div className="text-2xl font-black" style={{ color: 'rgba(251,146,60,0.9)' }}>{ties}</div>
          <div className="text-xs uppercase tracking-wider text-gray-400">Ties</div>
        </div>
      </div>

      {history.map(entry => (
        <HistoryRow key={entry.matchup_id} entry={entry} />
      ))}
    </div>
  )
}

// ─── Celebration Modal (win/loss/tie) + embedded skull-mark animation ────────

function SkullTickUp({ priorCount, finalCount, animate }: { priorCount: number; finalCount: number; animate: boolean }) {
  // Show the "prior" row statically, then pop the newest skull in.
  const [showNew, setShowNew] = useState(!animate)
  useEffect(() => {
    if (!animate) return
    const t = setTimeout(() => setShowNew(true), 900)
    return () => clearTimeout(t)
  }, [animate])

  const displayCap = 10
  const shownPrior = Math.min(priorCount, displayCap)
  const addingNew = animate && finalCount > priorCount

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs uppercase tracking-widest text-gray-400">
        {addingNew ? 'Kill Marks' : 'Total Kill Marks'}
      </div>
      <div className="flex items-center gap-1 text-3xl">
        {Array.from({ length: shownPrior }).map((_, i) => (
          <span key={`prior-${i}`}>💀</span>
        ))}
        {addingNew && (
          <span
            className="inline-block"
            style={{
              transform: showNew ? 'scale(1)' : 'scale(0)',
              opacity: showNew ? 1 : 0,
              transition: 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms ease-out',
              filter: showNew ? 'drop-shadow(0 0 12px rgba(234,179,8,0.8))' : undefined,
            }}
          >
            💀
          </span>
        )}
        {priorCount > displayCap && (
          <span className="text-sm text-gray-400 ml-2">×{finalCount}</span>
        )}
      </div>
      {addingNew && showNew && (
        <div
          className="text-sm font-bold tracking-wide"
          style={{ color: '#FCD34D', animation: 'fadeIn 400ms ease-out' }}
        >
          +1 — {finalCount} total
        </div>
      )}
    </div>
  )
}

function CelebrationModal({ entry, onClose }: { entry: HistoryEntry; onClose: () => void }) {
  const [dismissing, setDismissing] = useState(false)

  const { outcome } = entry
  const youWon = outcome === 'win'
  const youLost = outcome === 'loss'
  const isTie = outcome === 'tie'

  const headline = youWon ? 'VICTORY' : youLost ? 'DEFEAT' : 'DRAW'
  const headlineColor = youWon
    ? '#FCD34D'
    : youLost
      ? 'rgba(203,213,225,0.85)'
      : 'rgba(251,146,60,0.95)'
  const subline = youWon
    ? `You beat ${entry.opponent.name}`
    : youLost
      ? `${entry.opponent.name} beat you`
      : `You and ${entry.opponent.name} tied`
  const closeLabel = youWon ? 'Nice!' : youLost ? 'Dang.' : 'OK'

  const priorKillMarks = youWon ? Math.max(entry.kill_marks_at_close - 1, 0) : entry.kill_marks_at_close

  function handleClose() {
    if (dismissing) return
    setDismissing(true)
    fetch('/api/rivalries/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchup_id: entry.matchup_id }),
    }).catch(() => { /* best-effort; parent will still hide the modal */ })
      .finally(() => onClose())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 200ms ease-out',
      }}
      onClick={handleClose}
    >
      <div
        className="glass-card relative w-full max-w-md p-8"
        onClick={e => e.stopPropagation()}
        style={{
          borderColor: youWon
            ? 'rgba(234,179,8,0.5)'
            : youLost
              ? 'rgba(148,163,184,0.3)'
              : 'rgba(251,146,60,0.4)',
          background: youWon
            ? 'linear-gradient(135deg, rgba(234,179,8,0.08) 0%, rgba(0,0,0,0.4) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.4) 100%)',
          boxShadow: youWon ? '0 0 60px rgba(234,179,8,0.25)' : undefined,
          animation: 'scaleIn 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-1">
            Period {entry.period.period_number} · {entry.period.metric_label}
          </div>
          <div
            className="font-black text-5xl tracking-wider"
            style={{
              color: headlineColor,
              textShadow: youWon ? '0 0 30px rgba(234,179,8,0.6)' : undefined,
            }}
          >
            {headline}
          </div>
          <div className="text-gray-300 mt-2">{subline}</div>
        </div>

        <div className="flex items-center justify-center gap-5 my-6">
          <div className="flex flex-col items-center gap-2">
            <Avatar
              src={entry.you.avatar}
              name={entry.you.name}
              size={80}
              ringColor={youWon ? 'rgba(234,179,8,0.8)' : youLost ? 'rgba(148,163,184,0.35)' : 'rgba(251,146,60,0.6)'}
            />
            <div className="text-xs text-gray-400 font-bold">You</div>
            <div className="text-lg font-black font-mono">
              {formatMetricValue(entry.you.score, entry.period.metric, entry.period.metric_unit)}
            </div>
          </div>

          <div className="text-2xl font-black" style={{ color: 'rgba(255,255,255,0.2)' }}>VS</div>

          <div className="flex flex-col items-center gap-2" style={{ opacity: youWon ? 0.55 : 1 }}>
            <Avatar
              src={entry.opponent.avatar}
              name={entry.opponent.name}
              size={80}
              ringColor={youLost ? 'rgba(234,179,8,0.8)' : 'rgba(255,255,255,0.12)'}
            />
            <div className="text-xs text-gray-400 font-bold truncate max-w-[120px]">
              {entry.opponent.name}
            </div>
            <div className="text-lg font-black font-mono">
              {formatMetricValue(entry.opponent.score, entry.period.metric, entry.period.metric_unit)}
            </div>
          </div>
        </div>

        {!isTie && (priorKillMarks > 0 || youWon) && (
          <div className="border-t pt-5 mb-5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <SkullTickUp
              priorCount={priorKillMarks}
              finalCount={entry.kill_marks_at_close}
              animate={youWon}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleClose}
          disabled={dismissing}
          className="w-full py-3 rounded-xl font-black text-base tracking-wide transition-all disabled:opacity-60"
          style={{
            background: youWon
              ? 'linear-gradient(135deg, #EAB308, #CA8A04)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
            color: youWon ? '#000' : 'rgba(255,255,255,0.9)',
            boxShadow: youWon ? '0 0 24px rgba(234,179,8,0.4)' : undefined,
          }}
        >
          {closeLabel}
        </button>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// ─── Main Client View ─────────────────────────────────────────────────────────

export default function RivalriesView() {
  const [data, setData] = useState<RivalriesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'current' | 'history'>('current')
  const [celebration, setCelebration] = useState<HistoryEntry | null>(null)

  useEffect(() => {
    fetch('/api/rivalries')
      .then(r => r.json())
      .then((d: RivalriesData) => {
        setData(d)
        if (d.unacknowledged_result) setCelebration(d.unacknowledged_result)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const myMatchup = data?.matchups.find(
    m => m.player1.user_id === data.current_user_id || m.player2.user_id === data.current_user_id
  ) ?? null

  const otherMatchups = data?.matchups.filter(m => m !== myMatchup) ?? []
  const historyCount = data?.my_history.length ?? 0

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

      {/* Tabs */}
      {!loading && data && (
        <div className="flex gap-2 p-1 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            onClick={() => setTab('current')}
            className="flex-1 py-2 rounded-lg text-sm font-bold tracking-wide transition-colors"
            style={{
              backgroundColor: tab === 'current' ? 'rgba(251,146,60,0.18)' : 'transparent',
              color: tab === 'current' ? '#F7931E' : 'rgba(255,255,255,0.6)',
            }}
          >
            Current
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className="flex-1 py-2 rounded-lg text-sm font-bold tracking-wide transition-colors"
            style={{
              backgroundColor: tab === 'history' ? 'rgba(251,146,60,0.18)' : 'transparent',
              color: tab === 'history' ? '#F7931E' : 'rgba(255,255,255,0.6)',
            }}
          >
            History {historyCount > 0 && <span className="text-xs opacity-70">({historyCount})</span>}
          </button>
        </div>
      )}

      {loading && (
        <div className="glass-card p-8 text-center animate-pulse">
          <div className="h-6 w-32 bg-white/10 rounded mx-auto mb-4" />
          <div className="h-32 bg-white/10 rounded" />
        </div>
      )}

      {!loading && tab === 'current' && data?.current_period && (
        <>
          {myMatchup && (
            <MatchupCard
              matchup={myMatchup}
              currentPeriod={data.current_period}
              currentUserId={data.current_user_id}
              isHero
            />
          )}

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

      {!loading && tab === 'current' && !data?.current_period && (
        <div className="glass-card p-8 text-center text-gray-500">
          Rivalry periods haven&apos;t started yet. Check back soon!
        </div>
      )}

      {!loading && tab === 'history' && data && (
        <HistoryList history={data.my_history} />
      )}

      {/* Season schedule — always visible below tab content */}
      {!loading && data && data.all_periods.length > 0 && (
        <SeasonSchedule periods={data.all_periods} />
      )}

      {/* Celebration modal for first post-close view */}
      {celebration && (
        <CelebrationModal
          entry={celebration}
          onClose={() => setCelebration(null)}
        />
      )}
    </div>
  )
}
