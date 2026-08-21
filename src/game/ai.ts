// Medium-strength bot. Pure: takes a state and returns the next action it
// wants, exactly as a human would dispatch it, so it plays by the same rules
// the reducer enforces — it cannot make an illegal move by construction.

export type AIPreset = 'aggressive' | 'economic' | 'turtle' | null

/**
 * How far the bot looks ahead, independent of its aggressive/economic/turtle
 * personality. Personality picks a style; difficulty picks a skill level, and
 * is meant to be changed mid-game to tune the challenge up or down.
 *
 * - rookie: exactly the original greedy bot — fixed city-first goal, plays
 *   the first legal dev card, trades one card at a time.
 * - casual: picks its next build (city/settlement) by actual value on the
 *   board instead of a fixed rule, so trades and discards serve a real plan.
 * - sharp: casual, plus it also chases longest road / largest army when
 *   in reach, asks for its full trade deficit, and won't hand cards to
 *   whoever is one or two points from winning.
 * - master: sharp, plus it scores which dev card to play (not just the
 *   first one), pre-empts a robber sitting on its own tile before rolling,
 *   and aims the robber at whoever it hurts most.
 */
export type AIDifficulty = 'rookie' | 'casual' | 'sharp' | 'master'

export const DIFFICULTY_LEVELS: Array<{ value: AIDifficulty; label: string; blurb: string }> = [
  { value: 'rookie', label: 'Rookie', blurb: 'Greedy, no plan. Easiest.' },
  { value: 'casual', label: 'Casual', blurb: 'Picks a real build goal and saves for it.' },
  { value: 'sharp', label: 'Sharp', blurb: 'Chases longest road/largest army, trades smarter.' },
  { value: 'master', label: 'Master', blurb: 'Plays dev cards with judgment, robber hits hardest.' },
]

const DIFFICULTY_ORDER: AIDifficulty[] = ['rookie', 'casual', 'sharp', 'master']
function level(d: AIDifficulty): number {
  return DIFFICULTY_ORDER.indexOf(d)
}

import { longestRoadLength, vertexNeighbours, type Resource } from './board'
import {
  PIECE_LIMITS,
  currentPlayerId,
  edgeTargets,
  ratesFor,
  swapSignature,
  vertexTargets,
  type Action,
  type GameState,
} from './engine'
import {
  COSTS,
  DEV_COST,
  canAfford,
  canAffordDev,
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
    hitsLeaderBonus: 16,
    tradeThreshold: 1,
    offerAcceptMultiplier: 0.9,
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

function occupiedVertices(state: GameState): Set<string> {
  const out = new Set<string>()
  for (const p of state.players) {
    p.settlements.forEach((v) => out.add(v))
    p.cities.forEach((v) => out.add(v))
  }
  return out
}

function isSettleable(state: GameState, vertexId: string, occ: Set<string>): boolean {
  return !occ.has(vertexId) && vertexNeighbours(state.board, vertexId).every((n) => !occ.has(n))
}

/**
 * Vertices an opponent could reach in one road from where they already are —
 * racing them for one of these is a coin flip, so it's worth less to us.
 */
function contestedVertices(state: GameState, seat: PlayerId): Set<string> {
  const out = new Set<string>()
  for (const p of state.players) {
    if (p.id === seat) continue
    const ends = new Set<string>([...p.settlements, ...p.cities])
    for (const eid of p.roads) {
      const e = state.board.edges.find((x) => x.id === eid)!
      ends.add(e.a)
      ends.add(e.b)
    }
    ends.forEach((v) => {
      vertexNeighbours(state.board, v).forEach((n) => out.add(n))
    })
  }
  return out
}

/**
 * A road is worth more than its immediate endpoint: walk a few steps further
 * along the vertex graph for the best legal settlement spot reachable from
 * here, discounted by distance so a great spot three roads out doesn't beat a
 * good spot one road away. Spots an opponent could also reach in one road are
 * discounted further — no point racing for a corner they'll likely win.
 */
function roadLookaheadScore(
  state: GameState,
  startVertex: string,
  player: Player,
  preset: AIPreset,
  maxDepth = 3,
): number {
  const occ = occupiedVertices(state)
  const contested = contestedVertices(state, player.id)
  const seen = new Set<string>([startVertex])
  let frontier = [startVertex]
  let bestScore = -Infinity
  for (let depth = 0; depth <= maxDepth; depth++) {
    const next: string[] = []
    for (const v of frontier) {
      if (isSettleable(state, v, occ)) {
        let s = vertexScore(state, v, player, preset) / (1 + depth * 0.5)
        if (contested.has(v)) s *= 0.5
        if (s > bestScore) bestScore = s
      }
      for (const n of vertexNeighbours(state.board, v)) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  return bestScore === -Infinity ? 0 : bestScore
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

/** What the player still needs to afford a development card. */
function missingForDev(player: Player): Partial<Record<Resource, number>> {
  const gap: Partial<Record<Resource, number>> = {}
  for (const [res, n] of Object.entries(DEV_COST)) {
    const short = (n ?? 0) - player.hand[res as Resource]
    if (short > 0) gap[res as Resource] = short
  }
  return gap
}

/** Robber goes on the strongest tile of whoever is winning, never our own. */
function robberTarget(
  state: GameState,
  seat: number,
  preset: AIPreset = null,
  difficulty: AIDifficulty = 'rookie',
): string {
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const mine = new Set([...me.settlements, ...me.cities])
  const leader = best(
    state.players.filter((p) => p.id !== seat),
    (p) => victoryPoints(p, state.armyHolder, state.roadHolder) * 10 + handTotal(p),
  )
  const master = level(difficulty) >= 3

  const candidates = state.board.tiles.filter((t) => {
    if (t.id === state.robberTile || t.type === 'desert') return false
    return !state.board.tileVertices[t.id].some((v) => mine.has(v))
  })

  const scored = best(candidates, (t) => {
    const corners = state.board.tileVertices[t.id]
    const victims = state.players.filter(
      (p) => p.id !== seat && corners.some((v) => p.settlements.includes(v) || p.cities.includes(v)),
    )
    const hitsLeader = leader ? victims.some((v) => v.id === leader.id) : false
    if (!master) {
      return pips(t.number) + (hitsLeader ? config.hitsLeaderBonus : 0) + (victims.length > 0 ? 4 : 0)
    }
    // Master: a tile with exactly one victim guarantees who gets robbed — a
    // shared tile with several settlements means the steal is a coin flip
    // across them, worth less than a sure hit. Also weighs the victim's hand
    // size (nothing to steal from an empty hand) and whether it sits on the
    // leader's most-needed resource right now.
    const singleVictimBonus = victims.length === 1 ? 3 : 0
    const handWeight = victims.reduce((sum, v) => sum + Math.min(handTotal(v), 4), 0)
    const leaderNeed = leader ? { ...missingFor(leader, 'settlement'), ...missingFor(leader, 'city') } : {}
    const deniesLeaderNeed = hitsLeader && t.type !== 'desert' && leaderNeed[t.type as Resource] ? 6 : 0
    return (
      pips(t.number) +
      (hitsLeader ? config.hitsLeaderBonus : 0) +
      (victims.length > 0 ? 2 : 0) +
      singleVictimBonus +
      handWeight +
      deniesLeaderNeed
    )
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

/** kind === null when nothing is worth building right now (e.g. save for a dev card). */
interface BuildTarget {
  kind: 'city' | 'settlement' | 'road' | 'dev' | null
  need: Partial<Record<Resource, number>>
}

const BUILD_COST_SIZE: Record<'road' | 'settlement' | 'city', number> = {
  road: 2,
  settlement: 4,
  city: 5,
}

/** Blocks a road walk at any vertex an *other* player already occupies. */
function opponentVertices(state: GameState, seat: number): Set<string> {
  const out = new Set<string>()
  for (const p of state.players) {
    if (p.id === seat) continue
    p.settlements.forEach((v) => out.add(v))
    p.cities.forEach((v) => out.add(v))
  }
  return out
}

/**
 * What the bot is actually building toward, and what it still needs for it.
 * Rookie keeps the original fixed "always city until 4, then settlement"
 * rule. Casual and up compare every real next VP move — a city, a
 * settlement, a road push for longest road, a dev card push for largest
 * army — by rough value per resource spent, so the goal reflects the board
 * instead of a rule that ignores it. Everything that reads "what do I need"
 * (trading, discarding, the merchant, judging an incoming offer) shares this
 * one answer.
 */
function planTarget(
  state: GameState,
  seat: number,
  preset: AIPreset,
  difficulty: AIDifficulty,
): BuildTarget {
  const me = state.players[seat]
  if (level(difficulty) < 1) {
    const kind = me.settlements.length > 0 && me.cities.length < 4 ? 'city' : 'settlement'
    return { kind, need: missingFor(me, kind) }
  }

  const candidates: Array<{ kind: 'city' | 'settlement' | 'road' | 'dev'; value: number }> = []

  if (me.cities.length < PIECE_LIMITS.cities) {
    const spots = cityTargets(state)
    if (spots.length > 0) {
      const quality = vertexScore(state, best(spots, (v) => vertexScore(state, v, me, preset))!, me, preset)
      candidates.push({ kind: 'city', value: (2 + quality / 20) / BUILD_COST_SIZE.city })
    }
  }
  if (me.settlements.length + me.cities.length < PIECE_LIMITS.settlements) {
    const spots = targetsFor(state, 'settlement')
    if (spots.length > 0) {
      const quality = vertexScore(state, best(spots, (v) => vertexScore(state, v, me, preset))!, me, preset)
      candidates.push({ kind: 'settlement', value: (1 + quality / 20) / BUILD_COST_SIZE.settlement })
    }
  }

  // Sharp+: also weigh the two VP bonuses, but only once actually in reach —
  // a turtle three roads behind chasing longest road just burns brick/lumber
  // it needed for settlements.
  if (level(difficulty) >= 2) {
    if (me.roads.length < PIECE_LIMITS.roads && state.roadHolder !== seat) {
      const blocked = opponentVertices(state, seat)
      const myLen = longestRoadLength(state.board, me.roads, blocked)
      const holderLen = state.roadHolder !== null
        ? longestRoadLength(state.board, state.players[state.roadHolder].roads, opponentVertices(state, state.roadHolder))
        : 4
      const gap = Math.max(holderLen + 1 - myLen, 5 - myLen)
      if (gap <= 2 && edgeTargets(state).size > 0) {
        candidates.push({ kind: 'road', value: (2 / gap) / BUILD_COST_SIZE.road })
      }
    }
    if (state.armyHolder !== seat && state.deck.length > 0) {
      const armyLead = Math.max(0, ...state.players.filter((p) => p.id !== seat).map((p) => p.knights))
      const gap = Math.max(armyLead + 1 - me.knights, 3 - me.knights)
      if (gap <= 2) {
        candidates.push({ kind: 'dev', value: (2 / gap) / 3 })
      }
    }
  }

  const top = best(candidates, (c) => c.value)
  if (!top) return { kind: null, need: {} }
  if (top.kind === 'road') return { kind: 'road', need: missingFor(me, 'road') }
  if (top.kind === 'dev') return { kind: 'dev', need: missingForDev(me) }
  return { kind: top.kind, need: missingFor(me, top.kind) }
}

function tradeTowardsGoal(
  state: GameState,
  seat: number,
  preset: AIPreset = null,
  difficulty: AIDifficulty = 'rookie',
): Action | null {
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const rates = ratesFor(state, seat)
  const need = planTarget(state, seat, preset, difficulty).need
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
 * What a dev card of this kind is worth to this bot right now: a knight is
 * worth more while the largest army is still winnable, the free-resource
 * cards are worth more when the current build is short, and a victory card
 * is worth most when it would finish the game. Shared by drafting (which of
 * the revealed cards to take) and, at master difficulty, by deciding which
 * ready card in hand is worth playing this turn.
 */
function devKindScore(state: GameState, seat: number, preset: AIPreset, kind: DevKind): number {
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const need = { ...missingFor(me, 'settlement'), ...missingFor(me, 'city') }
  const shortBy = Object.values(need).reduce((sum, n) => sum + (n ?? 0), 0)
  const armyLead = Math.max(0, ...state.players.filter((p) => p.id !== seat).map((p) => p.knights))
  const vpNow = victoryPoints(me, state.armyHolder, state.roadHolder)
  const opponentStock = (res: Resource) =>
    state.players.reduce((sum, p) => (p.id === seat ? sum : sum + p.hand[res]), 0)

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
    case 'monopoly': {
      // Only worth naming a resource the table is actually sitting on.
      const best = Math.max(...ALL.map(opponentStock))
      return best >= 3 ? 3 + shortBy / 2 + best : 0
    }
    case 'roadBuilding':
    case 'trailblazer':
      return me.roads.length < PIECE_LIMITS.roads ? 3 : 0
    case 'diplomat':
      return 2
  }
}

/** Which of the revealed cards a bot takes — the highest-scoring one. */
export function chooseDraft(state: GameState, seat: number, preset: AIPreset = null): number {
  const options = state.draft ?? []
  if (options.length === 0) return 0
  let bestIndex = 0
  for (let i = 1; i < options.length; i++) {
    if (devKindScore(state, seat, preset, options[i]) > devKindScore(state, seat, preset, options[bestIndex])) {
      bestIndex = i
    }
  }
  return bestIndex
}

/** At most this many table offers per turn, so a refused bot never loops. */
const MAX_OFFERS_PER_TURN = 2

/**
 * A 1:1 swap put to the table. Cheaper than any bank rate, so the bot tries
 * this before paying 4:1 — it costs only a pause if everyone refuses.
 */
function proposeSwap(
  state: GameState,
  seat: number,
  preset: AIPreset = null,
  difficulty: AIDifficulty = 'rookie',
): Action | null {
  if (state.offer || (state.offersMade ?? 0) >= MAX_OFFERS_PER_TURN) return null
  const config = getPresetConfig(preset)
  const me = state.players[seat]
  const need = planTarget(state, seat, preset, difficulty).need
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

  // Sharp+ asks for the whole deficit in one go instead of always 1-for-1,
  // capped so the ask stays plausible for someone to actually hold.
  const qty = level(difficulty) >= 2 ? Math.min(need[wanted] ?? 1, 2, me.hand[give]) : 1

  const offer = {
    from: seat as PlayerId,
    to: 'any' as const,
    give: { [give]: qty },
    want: { [wanted]: qty },
    declinedBy: [],
  }
  // Nothing changed hands since the table turned this exact swap down —
  // asking again verbatim would just get declined again.
  if ((state.rejectedSwaps ?? []).includes(swapSignature(offer))) return null

  return { type: 'propose', offer }
}

/**
 * The bot's move for the current turn. Returns null when it has nothing left
 * to do, which the caller turns into an end of turn.
 */
export function chooseAction(
  state: GameState,
  seat: number,
  preset: AIPreset = null,
  difficulty: AIDifficulty = 'rookie',
): Action | null {
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

  if (state.mode === 'robber') return { type: 'tile', id: robberTarget(state, seat, preset, difficulty) }

  // --- opening placements -------------------------------------------------
  if (state.phase === 'setup') {
    if (state.pendingRoadFrom) {
      const edges = [...edgeTargets(state)]
      if (!edges.length) return null
      // Head towards the better of the road's two ends, looking a few steps
      // further along that direction rather than just the next corner.
      const pickEdge = best(edges, (id) => {
        const e = state.board.edges.find((x) => x.id === id)!
        const far = e.a === state.pendingRoadFrom ? e.b : e.a
        return roadLookaheadScore(state, far, me, preset)
      })
      return { type: 'edge', id: pickEdge! }
    }
    const spots = [...vertexTargets(state)]
    if (!spots.length) return null
    return { type: 'vertex', id: best(spots, (v) => vertexScore(state, v, me, preset))! }
  }

  // --- normal turn --------------------------------------------------------
  // Master: a robber sitting on one of our own tiles is lost production every
  // roll until moved — playing a knight before rolling clears it a turn
  // earlier than waiting to draw one after.
  if (
    level(difficulty) >= 3 &&
    !state.hasRolled &&
    !state.playedDev &&
    [...me.settlements, ...me.cities].some((v) => (state.board.vertexTiles[v] ?? []).includes(state.robberTile))
  ) {
    const knight = me.devCards.find((c) => c.ready && c.kind === 'knight' && !c.spent)
    if (knight) return { type: 'playDev', cardId: knight.id }
  }

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
      return Math.max(
        roadLookaheadScore(state, e.a, me, preset),
        roadLookaheadScore(state, e.b, me, preset),
      )
    })
    return { type: 'edge', id: pickEdge! }
  }

  // Knights win the largest army bonus and the robber is worth moving.
  if (!state.playedDev) {
    const playable = me.devCards.filter((c) => c.ready && c.kind !== 'victory' && !c.spent)
    if (playable.length > 0) {
      // Master picks whichever ready card is actually worth playing now
      // (e.g. skips a monopoly nobody has cards for); everyone else just
      // plays the first one, as before.
      const card =
        level(difficulty) >= 3
          ? best(playable, (c) => devKindScore(state, seat, preset, c.kind))!
          : playable[0]
      return { type: 'playDev', cardId: card.id }
    }
  }

  const target = planTarget(state, seat, preset, difficulty)
  const hasCitySpots = canAfford(me, 'city') && cityTargets(state).length > 0
  const hasSettlementSpots = canAfford(me, 'settlement') && targetsFor(state, 'settlement').length > 0
  const hasRoadSpots =
    canAfford(me, 'road') && me.roads.length < PIECE_LIMITS.roads && targetsFor(state, 'road').length > 0

  // Casual+: build whatever planTarget actually settled on, when it is
  // affordable right now — the plan is what decided what to save resources
  // for, so it should also decide what to spend them on.
  if (level(difficulty) >= 1) {
    if (target.kind === 'city' && hasCitySpots) return { type: 'setMode', mode: 'city' }
    if (target.kind === 'settlement' && hasSettlementSpots) return { type: 'setMode', mode: 'settlement' }
    if (target.kind === 'road' && hasRoadSpots) return { type: 'setMode', mode: 'road' }
    if (target.kind === 'dev' && canAffordDev(me) && state.deck.length > 0) return { type: 'buyDev' }
  }

  // Cities first (2 VP and double production), then settlements, then roads.
  // Each checks for a legal spot: without that the bot keeps selecting a build
  // it cannot place and never finishes its turn.
  // Preset's cityPreference multiplier affects the order: high = prefer cities, low = prefer settlements.
  const config = getPresetConfig(preset)

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

  if (canAffordDev(me) && state.deck.length > 0 && handTotal(me) >= 3) return { type: 'buyDev' }
  if (hasRoadSpots) {
    return { type: 'setMode', mode: 'road' }
  }

  // Ask the table first, fall back to the bank's worse rate.
  const swap = proposeSwap(state, seat, preset, difficulty)
  if (swap) return swap

  const trade = tradeTowardsGoal(state, seat, preset, difficulty)
  if (trade) return trade

  return null
}

/**
 * Discard from surplus first: whatever the current build goal does not need,
 * ranked by how much of it is held. Falls back to a random legal bundle once
 * every resource is needed, so it can never get stuck short.
 */
export function chooseDiscard(
  state: GameState,
  seat: number,
  preset: AIPreset = null,
  difficulty: AIDifficulty = 'rookie',
): Partial<Record<Resource, number>> {
  const owed = state.discards[seat as PlayerId]
  if (!owed) return {}
  const me = state.players[seat]
  const need = planTarget(state, seat, preset, difficulty).need

  const pool: Resource[] = []
  for (const [res, n] of Object.entries(me.hand)) {
    for (let i = 0; i < n; i++) pool.push(res as Resource)
  }
  pool.sort((a, b) => {
    const aNeeded = need[a] ? 1 : 0
    const bNeeded = need[b] ? 1 : 0
    if (aNeeded !== bNeeded) return aNeeded - bNeeded // unneeded first
    return me.hand[b] - me.hand[a] // then biggest surplus first
  })

  const bundle: Partial<Record<Resource, number>> = {}
  for (let i = 0; i < owed && pool.length > 0; i++) {
    const card = pool.shift()!
    bundle[card] = (bundle[card] ?? 0) + 1
  }
  return bundle
}

/**
 * How a bot answers a trade offer aimed at it: accept only when it can cover
 * the request and the incoming cards help more than what it gives up.
 */
/**
 * Bots always agree to stop. The vote exists so no *person* is forced out of a
 * game they are still enjoying, and a bot has no such stake. Judging it on the
 * bot's own position instead — agreeing only once it had nothing left to build
 * — made the control dead in practice: across 40 simulated games where a stop
 * was proposed at turn 12, not one bot ever agreed, because every bot could
 * still build. A button that never works is worse than no button.
 *
 * Consequence, and it is the intended one: in a solo game against bots, the
 * proposer ends the game immediately. Online, every other human still has to
 * agree.
 */
export function respondToEnd(_state: GameState, _seat: number): boolean {
  return true
}

export function respondToOffer(
  state: GameState,
  seat: number,
  preset: AIPreset = null,
  difficulty: AIDifficulty = 'rookie',
): 'accept' | 'decline' {
  const config = getPresetConfig(preset)
  const offer = state.offer
  if (!offer) return 'decline'
  const me = state.players[seat]

  const canCover = Object.entries(offer.want).every(
    ([res, n]) => me.hand[res as Resource] >= (n ?? 0),
  )
  if (!canCover) return 'decline'

  // Sharp+: never hand cards to whoever is one or two points from winning,
  // no matter how good the price looks — a good player wouldn't either.
  if (level(difficulty) >= 2) {
    const proposer = state.players[offer.from]
    const proposerVp = victoryPoints(proposer, state.armyHolder, state.roadHolder)
    if (proposerVp >= state.settings.vpTarget - 2 && Object.values(offer.give).some((n) => n)) {
      return 'decline'
    }
  }

  const need = planTarget(state, seat, preset, difficulty).need
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
