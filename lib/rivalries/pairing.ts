// ─── Rivalry Pairing Algorithm ────────────────────────────────────────────────
//
// Greedy rank-adjacent pairing with history-aware preference ordering.
//
// Parameters
const K0 = 4                      // initial search window (ranks below current)
const DELTA = 3                   // window expansion increment
const KMAX = 10                   // maximum window size
const RECENT_AVOIDANCE_PERIODS = 2 // avoid rematches within this many periods

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RankedPlayer {
  id: string
  total_points: number
}

export interface HistoricalMatchup {
  player1_id: string
  player2_id: string
  period_number: number
}

export interface PairingResult {
  matchups: Array<{ player1_id: string; player2_id: string }>
  bye_player_id: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable key for any pair of player IDs (order-independent) */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`
}

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Compute bi-weekly rivalry pairings.
 *
 * @param players         All eligible players, sorted by total_points descending.
 * @param history         All past matchups across previous periods.
 * @param currentPeriodNumber  The period_number being generated (used to measure recency).
 */
export function computePairings(
  players: RankedPlayer[],
  history: HistoricalMatchup[],
  currentPeriodNumber: number
): PairingResult {

  // Build history map: pairKey → list of period_numbers in which they faced
  const historyMap = new Map<string, number[]>()
  for (const m of history) {
    const key = pairKey(m.player1_id, m.player2_id)
    const arr = historyMap.get(key) ?? []
    arr.push(m.period_number)
    historyMap.set(key, arr)
  }

  // Odd player count: lowest-ranked gets a bye and is excluded from pairing
  let byePlayerId: string | null = null
  let eligible = [...players]
  if (eligible.length % 2 !== 0) {
    byePlayerId = eligible[eligible.length - 1].id
    eligible = eligible.slice(0, -1)
  }

  // Precompute rank index for O(1) distance lookups
  const rankIndex = new Map<string, number>()
  eligible.forEach((p, i) => rankIndex.set(p.id, i))

  const paired = new Set<string>()
  const matchups: Array<{ player1_id: string; player2_id: string }> = []

  /**
   * Preference level for pairing current player with candidate:
   *   0 = never faced           → best
   *   1 = faced, not recently   → ok
   *   2 = faced recently        → last resort
   */
  function prefLevel(aId: string, bId: string): 0 | 1 | 2 {
    const periods = historyMap.get(pairKey(aId, bId))
    if (!periods || periods.length === 0) return 0
    const ago = currentPeriodNumber - Math.max(...periods)
    return ago > RECENT_AVOIDANCE_PERIODS ? 1 : 2
  }

  /** Periods since last face-off (Infinity if never faced) */
  function periodsAgoLastFaced(aId: string, bId: string): number {
    const periods = historyMap.get(pairKey(aId, bId))
    if (!periods || periods.length === 0) return Infinity
    return currentPeriodNumber - Math.max(...periods)
  }

  for (let i = 0; i < eligible.length; i++) {
    const current = eligible[i]
    if (paired.has(current.id)) continue

    let bestCandidate: RankedPlayer | null = null
    let bestPref = Infinity
    let bestDist = Infinity

    // Expand search window from K0 to KMAX until unpaired candidates are found.
    // The window is one-directional (ranks below current only), since all players
    // above have already been processed.
    let K = K0
    while (K <= KMAX) {
      const windowEnd = Math.min(i + K, eligible.length - 1)
      const candidates = eligible
        .slice(i + 1, windowEnd + 1)
        .filter(p => !paired.has(p.id))

      if (candidates.length > 0) {
        // Pick best by preference level, then closest rank as tiebreaker
        for (const c of candidates) {
          const pref = prefLevel(current.id, c.id)
          const dist = rankIndex.get(c.id)! - i
          if (pref < bestPref || (pref === bestPref && dist < bestDist)) {
            bestCandidate = c
            bestPref = pref
            bestDist = dist
          }
        }
        break // found candidates in window — stop expanding
      }

      if (K >= KMAX) break
      K = Math.min(K + DELTA, KMAX)
    }

    // KMAX fallback: no unpaired player found within KMAX ranks.
    // Search the entire remaining pool and pick least-recently-faced, then closest rank.
    if (bestCandidate === null) {
      const remaining = eligible.filter(p => !paired.has(p.id) && p.id !== current.id)
      let bestAgo = -Infinity
      let bestFallbackDist = Infinity

      for (const c of remaining) {
        const ago = periodsAgoLastFaced(current.id, c.id)
        const dist = rankIndex.get(c.id)! - i
        if (ago > bestAgo || (ago === bestAgo && dist < bestFallbackDist)) {
          bestCandidate = c
          bestAgo = ago
          bestFallbackDist = dist
        }
      }
    }

    if (bestCandidate) {
      matchups.push({ player1_id: current.id, player2_id: bestCandidate.id })
      paired.add(current.id)
      paired.add(bestCandidate.id)
    }
  }

  return { matchups, bye_player_id: byePlayerId }
}
