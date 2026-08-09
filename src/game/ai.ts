// Medium-strength bot. Pure: takes a state and returns the next action it
// wants, exactly as a human would dispatch it, so it plays by the same rules
// the reducer enforces — it cannot make an illegal move by construction.

export type AIPreset = 'aggressive' | 'economic' | 'turtle' | null

import type { Resource } from './board'
import {
  PIECE_LIMITS,
  currentPlayerId,
  edgeTargets,
  ratesFor,
  vertexTargets,
  type Action,
  type GameState,
} from './engine'
import {
  COSTS,
  canAfford,
  canAffordDev,
  randomDiscard,
  victoryPoints,
  type DevKind,
  type Player,
  type PlayerId,
} from './players'

const ALL: Resource[] = ['brick', 'lumber', 'wool', 'grain', 'ore']

/** Preset-specific behavioral multipliers. */
interface PresetConfig {
  diversityBonus: number
  hitsLeaderBonus: number
  tradeThreshold: number
  offerAcceptMultiplier: number
  cityPreference: number
}

function getPresetConfig(preset: AIPreset): PresetConfig {
  // Default (null) is the baseline.
  if (preset === 'aggressive') {
    return {
      diversityBonus: 2.5, // Same as default
      hitsLeaderBonus: 16, // Increased from 12, targets leader harder
      tradeThreshold: 1, // Tighter: only trade when strictly needed
      offerAcceptMultiplier: 0.8, // Multiplies gain/loss ratio, making it harder to accept
      cityPreference: 0.5, // Same as default
    }
  }
  if (preset === 'economic') {
    return {
      diversityBonus: 3.5, // Increased, favors varied resources
      hitsLeaderBonus: 12, // Same as default
      tradeThreshold: 0.7, // Looser: trades more readily
      offerAcceptMultiplier: 1.2, // Multiplies gain/loss ratio, easier to accept trades
      cityPreference: 1.2, // Favors city upgrades over settlements
    }
  }
  if (preset === 'turtle') {
    return {
      diversityBonus: 2.5, // Same as default
      hitsLeaderBonus: 6, // Decreased from 12, avoids fights
      tradeThreshold: 1.3, // Much tighter: holds resources
      offerAcceptMultiplier: 0.6, // Very reluctant to trade
      cityPreference: 0.3, // Strongly prefers settlements/roads for longest road
    }
  }
  // Default (no preset)
  return {
    diversityBonus: 2.5,
    hitsLeaderBonus: 12,
    tradeThreshold: 1,
    offerAcceptMultiplier: 1,
    cityPreference: 1,
  }
}

/** Ways to roll each number: 6 and 8 are the best, 2 and 12 the worst. */
function pips(n: number | undefined): number {
  return n === undefined ? 0 : 6 - Math.abs(7 - n)
}

function tilesAt(state: GameState, vertexId: string) {
  return (state.board.vertexTiles[vertexId] ?? []).map(
    (tid) => state.board.tiles.find((t) => t.id === tid)!,
  )
}

/**
 * Corner quality: total pips, plus a bonus for touching resources the player
 * does not already have — variety matters more than raw volume early on.
 */
function vertexScore(state: GameState, vertexId: string, player: Player, preset: AIPreset = null): number {
  const config = getPresetConfig(preset)
  const tiles = tilesAt(state, vertexId)
  const owned = new Set<Resource>()
  for (const v of [...player.settlements, ...player.cities]) {
    for (const t of tilesAt(state, v)) if (t.type !== 'desert') owned.add(t.type as Resource)
  }

  let score = 0
  for (const t of tiles) {
    if (t.type === 'desert') continue
    score += pips(t.number)
    if (!owned.has(t.type as Resource)) score += config.diversityBonus
    // Brick and lumber early: roads and settlements come before ore.
    if (t.type === 'brick' || t.type === 'lumber') score += 0.75
  }
  return score
}

function best<T>(items: T[], score: (item: T) => number): T | null {
  let bestItem: T | null = null
  let bestScore = -Infinity
  for (const item of items) {
    const s = score(item)
    if (s > bestScore) {
      bestScore = s
      bestItem = item
    }
  }
  return bestItem
}

function handTotal(p: Player): number {
  return Object.values(p.hand).reduce((a, b) => a + b, 0)
}

/** What the player still needs for a target build, resource by resource. */
function missingFor(
  player: Player,
  kind: 'road' | 'settlement' | 'city',
): Partial<Record<Resource, number>> {
  const gap: Partial<Record<Resource, number>> = {}
  for (const [res, n] of Object.entries(COSTS[kind])) {
    const short = (n ?? 0) - player.hand[res as Resource]
    if (short > 0) gap[res as Resource] = short
  }
  return gap
}

/** Robber goes on the strongest tile of whoever is winning, never our own. */
function robberTarget(state: GameState, seat: number, preset: AIPreset = null): string {
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const mine = new Set([...me.settlements, ...me.cities])
  const leader = best(
    state.players.filter((p) => p.id !== seat),
    (p) => victoryPoints(p) * 10 + handTotal(p),
  )

  const candidates = state.board.tiles.filter((t) => {
    if (t.id === state.robberTile || t.type === 'desert') return false
    return !state.board.tileVertices[t.id].some((v) => mine.has(v))
  })

  const scored = best(candidates, (t) => {
    const corners = state.board.tileVertices[t.id]
    const hitsLeader = leader
      ? corners.some((v) => leader.settlements.includes(v) || leader.cities.includes(v))
      : false
    const anyone = state.players.some(
      (p) => p.id !== seat && corners.some((v) => p.settlements.includes(v) || p.cities.includes(v)),
    )
    return pips(t.number) + (hitsLeader ? config.hitsLeaderBonus : 0) + (anyone ? 4 : 0)
  })

  return scored?.id ?? state.board.tiles.find((t) => t.id !== state.robberTile)!.id
}

/** Peek at what a build mode would offer without committing to it. */
function targetsFor(state: GameState, mode: 'settlement' | 'road'): string[] {
  const probe: GameState = { ...state, mode }
  return mode === 'road' ? [...edgeTargets(probe)] : [...vertexTargets(probe)]
}

function cityTargets(state: GameState): string[] {
  return [...vertexTargets({ ...state, mode: 'city' })]
}

function tradeTowardsGoal(state: GameState, seat: number, preset: AIPreset = null): Action | null {
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const rates = ratesFor(state, seat)
  const goal = me.settlements.length > 0 && me.cities.length < 4 ? 'city' : 'settlement'
  const need = missingFor(me, goal)
  const wanted = (Object.keys(need) as Resource[])[0]
  // If the bank is dry on the wanted resource, no trade can ever succeed —
  // without this the bot would keep proposing the same rejected trade forever.
  if (!wanted || state.bank[wanted] < 1) return null

  // Only trade away a resource we are not short of and hold a surplus of.
  // Threshold controls willingness to trade: lower = more willing. Each
  // resource has its own bank rate (a 2:1 port only discounts that resource),
  // so the check must use that resource's own rate — using a single shared
  // rate let the bot "afford" trades its actual port didn't cover, which
  // the reducer then silently rejected forever (an infinite retry loop).
  for (const give of ALL) {
    if (give === wanted || need[give]) continue
    const threshold = rates[give] * config.tradeThreshold
    if (me.hand[give] >= rates[give] && me.hand[give] >= threshold + 1) {
      return { type: 'bankTrade', give, get: wanted }
    }
  }
  return null
}

/**
 * Which of the revealed cards a bot takes. Scored by what the card is worth to
 * *this* bot right now, not by a fixed ranking: a knight is worth more while
 * the largest army is still winnable, the free-resource cards are worth more
 * when the current build is short, and a victory card is worth most when it
 * would finish the game.
 */
export function chooseDraft(state: GameState, seat: number, preset: AIPreset = null): number {
  const options = state.draft ?? []
  if (options.length === 0) return 0
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const need = { ...missingFor(me, 'settlement'), ...missingFor(me, 'city') }
  const shortBy = Object.values(need).reduce((sum, n) => sum + (n ?? 0), 0)
  const armyLead = Math.max(0, ...state.players.filter((p) => p.id !== seat).map((p) => p.knights))
  const vpNow = victoryPoints(me, null, null)

  const score = (kind: DevKind): number => {
    switch (kind) {
      case 'victory':
        // Worth everything if it wins outright, a slow point otherwise.
        return vpNow + 1 >= state.settings.vpTarget ? 100 : 4
      case 'knight':
        // Chasing the army bonus, or just needing the robber moved off a tile.
        return me.knights >= armyLead ? 5 + config.hitsLeaderBonus / 4 : 3
      case 'merit':
      case 'plenty':
      case 'merchant':
        return 2 + shortBy
      case 'monopoly':
        return 3 + shortBy / 2
      case 'roadBuilding':
      case 'trailblazer':
        return me.roads.length < PIECE_LIMITS.roads ? 3 : 0
      case 'diplomat':
        return 2
    }
  }

  let bestIndex = 0
  for (let i = 1; i < options.length; i++) {
    if (score(options[i]) > score(options[bestIndex])) bestIndex = i
  }
  return bestIndex
}

/** At most this many table offers per turn, so a refused bot never loops. */
const MAX_OFFERS_PER_TURN = 2

/**
 * A 1:1 swap put to the table. Cheaper than any bank rate, so the bot tries
 * this before paying 4:1 — it costs only a pause if everyone refuses.
 */
function proposeSwap(state: GameState, seat: number, preset: AIPreset = null): Action | null {
  if (state.offer || (state.offersMade ?? 0) >= MAX_OFFERS_PER_TURN) return null
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const goal = me.settlements.length > 0 && me.cities.length < 4 ? 'city' : 'settlement'
  const need = missingFor(me, goal)
  const wanted = (Object.keys(need) as Resource[])[0]
  if (!wanted) return null
  // Never ask the table for a card nobody is holding.
  if (!state.players.some((p) => p.id !== seat && p.hand[wanted] > 0)) return null

  // Offer only from a genuine surplus: a resource the current build does not
  // call for, held more than once. A reluctant preset wants a fatter cushion.
  const spare = ALL.filter(
    (res) => res !== wanted && !need[res] && me.hand[res] >= 1 + config.tradeThreshold,
  )
  const give = best(spare, (res) => me.hand[res])
  if (!give) return null

  return {
    type: 'propose',
    offer: {
      from: seat as PlayerId,
      to: 'any',
      give: { [give]: 1 },
      want: { [wanted]: 1 },
      declinedBy: [],
    },
  }
}

/**
 * The bot's move for the current turn. Returns null when it has nothing left
 * to do, which the caller turns into an end of turn.
 */
export function chooseAction(state: GameState, seat: number, preset: AIPreset = null): Action | null {
  if (currentPlayerId(state) !== seat) return null
  const me = state.players[seat]

  // --- forced follow-ups first -------------------------------------------
  // An open draft is already paid for and blocks everything else.
  if (state.draft) return { type: 'draftPick', index: chooseDraft(state, seat, preset) }

  if (state.picking === 'monopoly') {
    const totals = ALL.map((res) => ({
      res,
      n: state.players.reduce((sum, p) => (p.id === seat ? sum : sum + p.hand[res]), 0),
    }))
    return { type: 'monopoly', res: best(totals, (t) => t.n)!.res }
  }

  // Both picks draw straight from the bank, so a resource the bank is dry on
  // is never a valid choice — the reducer silently rejects it, and picking
  // it again next call would loop forever.
  const inStock = ALL.filter((res) => state.bank[res] >= 1)

  if (state.picking === 'plenty') {
    const need = { ...missingFor(me, 'settlement'), ...missingFor(me, 'city') }
    const wanted = (Object.keys(need) as Resource[]).find((res) => inStock.includes(res))
    return { type: 'plenty', res: wanted ?? inStock[0] ?? 'ore' }
  }

  if (state.picking === 'santaBonus') {
    // Pick the resource the bot has least of, preferring needed resources for current goal.
    const need = { ...missingFor(me, 'settlement'), ...missingFor(me, 'city') }
    const needed = (Object.keys(need) as Resource[]).filter((res) => inStock.includes(res))
    if (needed.length > 0) {
      const lacking = best(needed, (res) => -me.hand[res])
      if (lacking) return { type: 'santaBonus', res: lacking }
    }
    // If no specific need, pick whichever in-stock resource we have least of.
    const least = best(inStock, (res) => -me.hand[res])
    return { type: 'santaBonus', res: least ?? inStock[0] ?? 'ore' }
  }

  if (state.picking === 'meritBonus') {
    // Same shape as the Santa bonus: take something the current build needs,
    // otherwise top up whatever is scarcest in hand.
    const need = { ...missingFor(me, 'settlement'), ...missingFor(me, 'city') }
    const needed = (Object.keys(need) as Resource[]).filter((res) => inStock.includes(res))
    const wanted = best(needed, (res) => -me.hand[res]) ?? best(inStock, (res) => -me.hand[res])
    return { type: 'meritBonus', res: wanted ?? inStock[0] ?? 'ore' }
  }

  // An open Merchant swap blocks every other action, so the bot has to finish
  // it: give away surplus one card at a time, take what the next build needs,
  // then confirm. Cancel only when there is genuinely nothing worth swapping.
  if (state.merchant) {
    const given = Object.values(state.merchant.give).reduce((sum, n) => sum + (n ?? 0), 0)
    const taken = Object.values(state.merchant.get).reduce((sum, n) => sum + (n ?? 0), 0)
    const need = { ...missingFor(me, 'settlement'), ...missingFor(me, 'city') }
    const wants = (Object.keys(need) as Resource[]).filter((res) => inStock.includes(res))

    if (given === taken && given > 0) return { type: 'merchantConfirm' }

    if (given <= taken) {
      // Spare cards are ones the current build does not call for; keep at least
      // one of anything needed so the swap cannot undo its own goal.
      const offered = state.merchant.give
      const spare = ALL.filter(
        (res) => me.hand[res] - (offered[res] ?? 0) > 0 && !wants.includes(res),
      )
      const give = best(spare, (res) => me.hand[res])
      if (give) return { type: 'merchantPick', side: 'give', res: give, delta: 1 }
      return given > 0 && given === taken
        ? { type: 'merchantConfirm' }
        : { type: 'merchantCancel' }
    }

    const get = best(wants, (res) => -me.hand[res]) ?? best(inStock, (res) => -me.hand[res])
    if (get) return { type: 'merchantPick', side: 'get', res: get, delta: 1 }
    return { type: 'merchantCancel' }
  }

  if (state.mode === 'robber') return { type: 'tile', id: robberTarget(state, seat, preset) }

  // --- opening placements -------------------------------------------------
  if (state.phase === 'setup') {
    if (state.pendingRoadFrom) {
      const edges = [...edgeTargets(state)]
      if (!edges.length) return null
      // Head towards the better of the road's two ends.
      const pickEdge = best(edges, (id) => {
        const e = state.board.edges.find((x) => x.id === id)!
        const far = e.a === state.pendingRoadFrom ? e.b : e.a
        return vertexScore(state, far, me, preset)
      })
      return { type: 'edge', id: pickEdge! }
    }
    const spots = [...vertexTargets(state)]
    if (!spots.length) return null
    return { type: 'vertex', id: best(spots, (v) => vertexScore(state, v, me, preset))! }
  }

  // --- normal turn --------------------------------------------------------
  if (!state.hasRolled) return { type: 'roll' }

  // Finish a build already committed to.
  if (state.mode === 'city' || state.mode === 'settlement') {
    const target = best([...vertexTargets(state)], (v) => vertexScore(state, v, me, preset))
    return target ? { type: 'vertex', id: target } : { type: 'setMode', mode: null }
  }
  if (state.mode === 'road') {
    const edges = [...edgeTargets(state)]
    if (!edges.length) return { type: 'setMode', mode: null }
    const pickEdge = best(edges, (id) => {
      const e = state.board.edges.find((x) => x.id === id)!
      return Math.max(vertexScore(state, e.a, me, preset), vertexScore(state, e.b, me, preset))
    })
    return { type: 'edge', id: pickEdge! }
  }

  // Knights win the largest army bonus and the robber is worth moving.
  if (!state.playedDev) {
    const playable = me.devCards.find((c) => c.ready && c.kind !== 'victory' && !c.spent)
    if (playable) return { type: 'playDev', cardId: playable.id }
  }

  // Cities first (2 VP and double production), then settlements, then roads.
  // Each checks for a legal spot: without that the bot keeps selecting a build
  // it cannot place and never finishes its turn.
  // Preset's cityPreference multiplier affects the order: high = prefer cities, low = prefer settlements.
  const config = getPresetConfig(preset)
  const hasCitySpots = canAfford(me, 'city') && cityTargets(state).length > 0
  const hasSettlementSpots = canAfford(me, 'settlement') && targetsFor(state, 'settlement').length > 0

  if (config.cityPreference >= 1 && hasCitySpots) {
    // Default and economic (>=1): prioritize cities, matching pre-preset behavior.
    return { type: 'setMode', mode: 'city' }
  }
  if (hasSettlementSpots) {
    // Turtle/aggressive (<1): prefer settlement spread, or fallback if no cities.
    return { type: 'setMode', mode: 'settlement' }
  }
  if (hasCitySpots) {
    // Secondary: city if settlement not available.
    return { type: 'setMode', mode: 'city' }
  }

  if (canAffordDev(me) && state.deck.length > 0 && handTotal(me) >= 4) return { type: 'buyDev' }
  if (canAfford(me, 'road') && me.roads.length < PIECE_LIMITS.roads && targetsFor(state, 'road').length > 0) {
    return { type: 'setMode', mode: 'road' }
  }

  // Ask the table first, fall back to the bank's worse rate.
  const swap = proposeSwap(state, seat, preset)
  if (swap) return swap

  const trade = tradeTowardsGoal(state, seat, preset)
  if (trade) return trade

  return null
}

/** A bot always discards a random legal bundle when forced to. */
export function chooseDiscard(state: GameState, seat: number, _preset: AIPreset = null): Partial<Record<Resource, number>> {
  const owed = state.discards[seat as PlayerId]
  if (!owed) return {}
  return randomDiscard(state.players[seat], owed)
}

/**
 * How a bot answers a trade offer aimed at it: accept only when it can cover
 * the request and the incoming cards help more than what it gives up.
 */
export function respondToOffer(state: GameState, seat: number, preset: AIPreset = null): 'accept' | 'decline' {
  const config = getPresetConfig(preset)
  const offer = state.offer
  if (!offer) return 'decline'
  const me = state.players[seat]

  const canCover = Object.entries(offer.want).every(
    ([res, n]) => me.hand[res as Resource] >= (n ?? 0),
  )
  if (!canCover) return 'decline'

  const goal = me.settlements.length > 0 ? 'city' : 'settlement'
  const need = missingFor(me, goal)
  const gain = Object.entries(offer.give).reduce(
    (sum, [res, n]) => sum + (need[res as Resource] ? (n ?? 0) * 2 : (n ?? 0) * 0.5),
    0,
  )
  const loss = Object.entries(offer.want).reduce(
    (sum, [res, n]) => sum + (need[res as Resource] ? (n ?? 0) * 2 : (n ?? 0) * 0.75),
    0,
  )
  // Multiply the gain/loss ratio by preset multiplier to control acceptance threshold
  return gain * config.offerAcceptMultiplier >= loss ? 'accept' : 'decline'
}
