// Pure game state + reducer. The host runs this and broadcasts the resulting
// state; guests never execute it, so the randomness here stays authoritative.

import {
  createBoard,
  ringsForPlayers,
  longestRoadLength,
  tradeRates,
  vertexNeighbours,
  type Board,
  type Resource,
} from './board'
import {
  COSTS,
  DEV_COST,
  applyTrade,
  canAfford,
  canAffordDev,
  createDevDeck,
  createPlayers,
  handSize,
  hasCards,
  largestArmyHolder,
  pay,
  victoryPointHalves,
  MERCHANT_LIMIT,
  type BuildKind,
  type DevKind,
  type Player,
  type PlayerId,
  type TradeOffer,
} from './players'

export type Mode = BuildKind | 'robber' | null

/** Standard piece supply per player. */
export const PIECE_LIMITS = { settlements: 5, cities: 4, roads: 15 }

export interface GameSettings {
  /** Show every player's hand instead of hiding opponents' cards. */
  publicHands: boolean
  /** Victory points needed to win. */
  vpTarget: number
  /** Bank resource supply preset: standard (19), scarce (12), or veryScarce (9). */
  bankPreset: 'standard' | 'scarce' | 'veryScarce'
  /** Santa mode: rolling a 7 or playing a Knight grants a free resource instead of placing a robber. */
  santaMode: boolean
  /** Speed mode: opening placements are auto-placed and each turn rolls dice twice. */
  speedMode: boolean
  /** Expanded dev deck: adds Merchant, Trailblazer, Diplomat and Merit, with fewer knights. */
  newDevCards: boolean
  /** Buying a dev card reveals the top few and the buyer picks one. */
  draftDevCards: boolean
  /**
   * Endless mode: the VP target stops being a win condition. The game runs
   * until nobody can build anything further, or until the table votes to stop,
   * and the highest score then wins.
   */
  endless: boolean
}

/** How many cards a draft reveals when the deck can supply that many. */
export const DRAFT_SIZE = 3

export function defaultSettings(): GameSettings {
  return {
    publicHands: false,
    vpTarget: 10,
    bankPreset: 'standard',
    santaMode: false,
    speedMode: false,
    newDevCards: false,
    draftDevCards: false,
    endless: false,
  }
}

/**
 * Map bank preset to resources per type.
 * scripts/bank-simulation.ts models trade frequency at several bank sizes; its
 * ratio-based metric flags every candidate as "exponential" because trade
 * counts near-standard (19) are close to zero, so any increase reads as a huge
 * multiplier — not a reliable signal on its own. These values keep the PRD's
 * original 19/12/9 proposal rather than the script's 19/10/6 suggestion;
 * revisit with real playtest data (per scarce-bank-mode.md's approval
 * condition) if 12/9 turns out too punishing in practice.
 */
export const BANK_PRESET_VALUES: Record<GameSettings['bankPreset'], number> = {
  standard: 19,
  scarce: 12,
  veryScarce: 9,
}

export interface GameState {
  board: Board
  players: Player[]
  bank: Record<Resource, number>
  /** Set once someone reaches the VP target; the game accepts no further moves. */
  winner: number | null
  /** Sticky largest-army/longest-road holders — kept until strictly overtaken. */
  armyHolder: PlayerId | null
  roadHolder: PlayerId | null
  phase: 'setup' | 'play'
  setupIndex: number
  /** During setup a settlement must be followed by a road from that corner. */
  pendingRoadFrom: string | null
  turn: number
  mode: Mode
  dice: [number, number] | null
  hasRolled: boolean
  /** Rolls taken so far this turn — 1 normally, up to 2 in speed mode. */
  rollCount: number
  robberTile: string
  message: string
  offer: TradeOffer | null
  /**
   * Player-to-player offers proposed this turn. A refused offer leaves no
   * trace in the state, so without this a bot would re-propose the same
   * rejected swap on every tick and never end its turn.
   */
  offersMade: number
  /**
   * Signatures (`give:want`) of offers everyone declined this turn. Without
   * this a bot re-proposing after a refusal sees the same hand it started
   * with and puts forward the identical swap again.
   */
  rejectedSwaps: string[]
  deck: DevKind[]
  playedDev: boolean
  /** Free roads owed by a road-building card. */
  freeRoads: number
  /**
   * Serial number for dev-card ids. Two cards bought in the same millisecond
   * at the same deck size used to collide on a `Date.now()`-based id, and
   * `playDev`'s lookup then kept finding the wrong card — a silent no-op the
   * bots retried forever. A counter carried in state stays unique across a
   * save/reload too, which a module-level counter would not.
   */
  cardSeq: number
  picking: 'monopoly' | 'plenty' | 'santaBonus' | 'meritBonus' | null
  /**
   * An open draft: the cards revealed by a purchase, awaiting a pick. The
   * buyer has already paid, so this blocks the turn the same way `picking`
   * does — the cards are off the deck until the pick puts the rest back.
   */
  draft: DevKind[] | null
  plentyLeft: number
  /**
   * An open Merchant play: baskets fill freely across resource types and the
   * swap only commits once both hold the same number of cards, at most
   * MERCHANT_LIMIT each.
   */
  merchant: { give: Partial<Record<Resource, number>>; get: Partial<Record<Resource, number>> } | null
  /** Cards each over-7-card player still owes after a 7 is rolled. */
  discards: Partial<Record<PlayerId, number>>
  /** Random turn order, shuffled once at game start; `turn`/`setupIndex` index into this. */
  order: PlayerId[]
  /**
   * An open "end the game now" vote (endless mode only). Every other player has
   * to accept; one refusal cancels it. Null in every non-endless game, and
   * absent from saves written before endless mode shipped, so read it as
   * `endVote ?? null`.
   */
  endVote: { from: PlayerId; accepted: PlayerId[] } | null
  settings: GameSettings
}

export type Action =
  | { type: 'vertex'; id: string }
  | { type: 'edge'; id: string }
  | { type: 'tile'; id: string }
  | { type: 'roll' }
  | { type: 'setMode'; mode: Mode }
  | { type: 'bankTrade'; give: Resource; get: Resource }
  | { type: 'buyDev' }
  /** Take the card at `index` from an open draft; the rest go to the deck's bottom. */
  | { type: 'draftPick'; index: number }
  | { type: 'playDev'; cardId: string }
  | { type: 'monopoly'; res: Resource }
  | { type: 'plenty'; res: Resource }
  | { type: 'santaBonus'; res: Resource }
  | { type: 'meritBonus'; res: Resource }
  /** Step one resource in one of the Merchant baskets; `delta` is +1 or -1. */
  | { type: 'merchantPick'; side: 'give' | 'get'; res: Resource; delta: number }
  | { type: 'merchantConfirm' }
  | { type: 'merchantCancel' }
  | { type: 'propose'; offer: TradeOffer }
  | { type: 'acceptOffer'; responder: PlayerId }
  | { type: 'declineOffer'; responder: PlayerId }
  | { type: 'cancelOffer' }
  | { type: 'discard'; playerId: PlayerId; cards: Partial<Record<Resource, number>> }
  | { type: 'proposeEnd' }
  | { type: 'respondEnd'; responder: PlayerId; accept: boolean }
  | { type: 'endTurn' }

/** Snake order for the opening placements, e.g. 1,3,0,2,2,0,3,1 for order [1,3,0,2]. */
export function setupOrder(order: PlayerId[]): number[] {
  return [...order, ...order.slice().reverse()]
}

export function currentPlayerId(state: GameState): number {
  return state.phase === 'setup'
    ? setupOrder(state.order)[state.setupIndex]
    : state.order[state.turn]
}

function shuffledOrder(count: number): PlayerId[] {
  const order = Array.from({ length: count }, (_, i) => i as PlayerId)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function createGame(playerCount: number, names?: string[], colors?: number[], settings?: Partial<GameSettings>): GameState {
  // 5+ players get the wider board; anything else is the standard 19 tiles.
  const board = createBoard(Math.random, ringsForPlayers(playerCount))
  const players = createPlayers(playerCount, colors).map((p, i) =>
    names?.[i] ? { ...p, name: names[i] } : p,
  )
  const order = shuffledOrder(playerCount)
  const finalSettings = { ...defaultSettings(), ...settings }
  // The bank is a shared pool, so a bigger table drains it faster for reasons
  // that have nothing to do with the scarce-bank setting. Above four players it
  // scales with the seat count so "standard" still means standard.
  const bankPerResource = Math.round(
    BANK_PRESET_VALUES[finalSettings.bankPreset] * (playerCount > 4 ? playerCount / 4 : 1),
  )
  const state: GameState = {
    board,
    players,
    bank: {
      brick: bankPerResource,
      lumber: bankPerResource,
      wool: bankPerResource,
      grain: bankPerResource,
      ore: bankPerResource,
    },
    winner: null,
    armyHolder: null,
    roadHolder: null,
    phase: 'setup',
    setupIndex: 0,
    pendingRoadFrom: null,
    turn: 0,
    mode: null,
    dice: null,
    hasRolled: false,
    rollCount: 0,
    robberTile: board.tiles.find((t) => t.type === 'desert')?.id ?? board.tiles[0].id,
    message: `${players[order[0]].name}: place your first settlement.`,
    offer: null,
    offersMade: 0,
    rejectedSwaps: [],
    endVote: null,
    deck: createDevDeck(
      Math.random,
      finalSettings.newDevCards,
      finalSettings.santaMode,
      playerCount,
    ),
    playedDev: false,
    freeRoads: 0,
    picking: null,
    draft: null,
    cardSeq: 0,
    plentyLeft: 0,
    merchant: null,
    discards: {},
    order,
    settings: finalSettings,
  }
  return finalSettings.speedMode ? autoSetup(state) : state
}

/** Ways to roll each number: 6 and 8 are the best, 2 and 12 the worst. */
function pipsFor(n: number | undefined): number {
  return n === undefined ? 0 : 6 - Math.abs(7 - n)
}

/**
 * Corner quality for automated speed-mode placement: total pips, plus a bonus
 * for touching resources the player doesn't already have. A trimmed copy of
 * ai.ts's vertexScore — kept local rather than imported to avoid a cycle
 * (ai.ts already imports from this module).
 */
function autoVertexScore(state: GameState, vertexId: string, player: Player): number {
  const tileIds = state.board.vertexTiles[vertexId] ?? []
  const tiles = tileIds.map((tid) => state.board.tiles.find((t) => t.id === tid)!)
  const owned = new Set<Resource>()
  for (const v of [...player.settlements, ...player.cities]) {
    for (const tid of state.board.vertexTiles[v] ?? []) {
      const t = state.board.tiles.find((x) => x.id === tid)!
      if (t.type !== 'desert') owned.add(t.type as Resource)
    }
  }
  let score = 0
  for (const t of tiles) {
    if (t.type === 'desert') continue
    score += pipsFor(t.number)
    if (!owned.has(t.type as Resource)) score += 2.5
    if (t.type === 'brick' || t.type === 'lumber') score += 0.75
  }
  return score
}

function bestOf<T>(items: T[], score: (item: T) => number): T {
  let bestItem = items[0]
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

/** Speed mode: run the entire setup phase automatically, snake order preserved. */
function autoSetup(state: GameState): GameState {
  let s = state
  while (s.phase === 'setup') {
    const current = s.players[currentPlayerId(s)]
    if (s.pendingRoadFrom) {
      const edges = [...edgeTargets(s)]
      const pickEdge = bestOf(edges, (eid) => {
        const e = s.board.edges.find((x) => x.id === eid)!
        const far = e.a === s.pendingRoadFrom ? e.b : e.a
        return autoVertexScore(s, far, current)
      })
      s = reduce(s, { type: 'edge', id: pickEdge })
    } else {
      const spots = [...vertexTargets(s)]
      const pickVertex = bestOf(spots, (v) => autoVertexScore(s, v, current))
      s = reduce(s, { type: 'vertex', id: pickVertex })
    }
  }
  return s
}

function occupiedVertices(players: Player[]): Set<string> {
  const s = new Set<string>()
  for (const p of players) {
    p.settlements.forEach((v) => s.add(v))
    p.cities.forEach((v) => s.add(v))
  }
  return s
}

function takenEdges(players: Player[]): Set<string> {
  const s = new Set<string>()
  for (const p of players) p.roads.forEach((e) => s.add(e))
  return s
}

/** Flatten a hand into one entry per card, for a random steal pick. */
function handCards(p: Player): Resource[] {
  const out: Resource[] = []
  for (const [res, n] of Object.entries(p.hand)) {
    for (let i = 0; i < n; i++) out.push(res as Resource)
  }
  return out
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function vertexTargets(state: GameState): Set<string> {
  const { board, players, phase, pendingRoadFrom, mode } = state
  const current = players[currentPlayerId(state)]
  const targets = new Set<string>()
  const occupied = occupiedVertices(players)

  const distanceOk = (v: string) =>
    !occupied.has(v) && vertexNeighbours(board, v).every((n) => !occupied.has(n))

  if (phase === 'setup') {
    if (pendingRoadFrom) return targets
    board.vertices.forEach((v) => distanceOk(v.id) && targets.add(v.id))
    return targets
  }

  if (mode === 'settlement') {
    if (current.settlements.length >= PIECE_LIMITS.settlements) return targets
    const reachable = new Set<string>()
    for (const eid of current.roads) {
      const e = board.edges.find((x) => x.id === eid)!
      reachable.add(e.a)
      reachable.add(e.b)
    }
    reachable.forEach((v) => distanceOk(v) && targets.add(v))
  } else if (mode === 'city') {
    if (current.cities.length >= PIECE_LIMITS.cities) return targets
    current.settlements.forEach((v) => targets.add(v))
  }
  return targets
}

export function edgeTargets(state: GameState): Set<string> {
  const { board, players, phase, pendingRoadFrom, mode } = state
  const current = players[currentPlayerId(state)]
  const targets = new Set<string>()
  const used = takenEdges(players)

  if (phase === 'setup') {
    if (!pendingRoadFrom) return targets
    board.edges.forEach((e) => {
      if (!used.has(e.id) && (e.a === pendingRoadFrom || e.b === pendingRoadFrom)) targets.add(e.id)
    })
    return targets
  }

  if (mode !== 'road') return targets
  if (current.roads.length >= PIECE_LIMITS.roads) return targets
  const mine = new Set<string>()
  for (const eid of current.roads) {
    const e = board.edges.find((x) => x.id === eid)!
    mine.add(e.a)
    mine.add(e.b)
  }
  current.settlements.forEach((v) => mine.add(v))
  current.cities.forEach((v) => mine.add(v))
  board.edges.forEach((e) => {
    if (!used.has(e.id) && (mine.has(e.a) || mine.has(e.b))) targets.add(e.id)
  })
  return targets
}

export function ratesFor(state: GameState, playerId: number): Record<Resource, number> {
  const p = state.players[playerId]
  return tradeRates(state.board, [...p.settlements, ...p.cities])
}

function withCurrent(state: GameState, fn: (p: Player) => Player): Player[] {
  const id = currentPlayerId(state)
  return state.players.map((p) => (p.id === id ? fn(p) : p))
}

/**
 * Pay every owner of a corner touching a tile with the rolled number.
 * Cities pay double; the robbed tile pays nothing.
 */
function produce(state: GameState, sum: number): GameState {
  const producing = state.board.tiles.filter(
    (t) => t.number === sum && t.type !== 'desert' && t.id !== state.robberTile,
  )
  const gains: Record<number, Partial<Record<Resource, number>>> = {}
  for (const p of state.players) {
    for (const tile of producing) {
      const res = tile.type as Resource
      for (const v of state.board.tileVertices[tile.id]) {
        const n = p.cities.includes(v) ? 2 : p.settlements.includes(v) ? 1 : 0
        if (!n) continue
        gains[p.id] = { ...gains[p.id], [res]: (gains[p.id]?.[res] ?? 0) + n }
      }
    }
  }

  // Bank limit: if the supply cannot cover everyone owed a resource, nobody
  // gets it — unless exactly one player is owed, who takes what is left.
  const bank = { ...state.bank }
  for (const res of Object.keys(bank) as Resource[]) {
    const claimants = Object.entries(gains).filter(([, g]) => g[res])
    const demand = claimants.reduce((sum, [, g]) => sum + (g[res] ?? 0), 0)
    if (demand === 0) continue
    if (demand > bank[res]) {
      if (claimants.length === 1) {
        const [pid, g] = claimants[0]
        g[res] = bank[res]
        gains[Number(pid)] = g
        bank[res] = 0
      } else {
        for (const [pid, g] of claimants) {
          delete g[res]
          gains[Number(pid)] = g
        }
      }
    } else {
      bank[res] -= demand
    }
  }

  const players = state.players.map((p) => {
    const gain = gains[p.id]
    if (!gain) return p
    const hand = { ...p.hand }
    for (const [res, n] of Object.entries(gain)) hand[res as Resource] += n
    return { ...p, hand }
  })

  const active = state.players[currentPlayerId(state)]
  const mine = gains[active.id]
  const summary = mine
    ? `${active.name} got ${Object.entries(mine)
        .map(([res, n]) => `+${n} ${res}`)
        .join(', ')}`
    : `nothing for ${active.name}`
  return { ...state, players, bank, message: `Rolled ${sum} — ${summary}.` }
}

/** Standard rule: on a 7, anyone holding more than 7 cards must discard half. */
function owedDiscards(players: Player[]): Partial<Record<PlayerId, number>> {
  const owed: Partial<Record<PlayerId, number>> = {}
  for (const p of players) {
    const total = handSize(p)
    if (total > 7) owed[p.id] = Math.floor(total / 2)
  }
  return owed
}

/**
 * Longest road: first player to reach 5+ segments holds it, and keeps it
 * until another player strictly exceeds their length — a later tie does
 * not take it away.
 */
export function longestRoadHolder(
  board: Board,
  players: Player[],
  prevHolder: PlayerId | null = null,
): PlayerId | null {
  const lengths = players.map((p) => {
    const blocked = new Set<string>()
    for (const other of players) {
      if (other.id === p.id) continue
      other.settlements.forEach((v) => blocked.add(v))
      other.cities.forEach((v) => blocked.add(v))
    }
    return { id: p.id, len: longestRoadLength(board, p.roads, blocked) }
  })
  const prev = prevHolder !== null ? lengths.find((l) => l.id === prevHolder) : undefined
  if (prev) {
    const better = lengths.filter((l) => l.id !== prev.id && l.len > prev.len)
    if (better.length === 0) return prev.id
    const best = Math.max(...better.map((l) => l.len))
    const leaders = better.filter((l) => l.len === best)
    return leaders.length === 1 ? leaders[0].id : prev.id
  }
  const best = Math.max(...lengths.map((l) => l.len))
  if (best < 5) return null
  const leaders = lengths.filter((l) => l.len === best)
  return leaders.length === 1 ? leaders[0].id : null
}

/** Take one random card from a random opponent on the robbed tile. */
function stealFrom(state: GameState, tileId: string): GameState {
  const id = currentPlayerId(state)
  const corners = new Set(state.board.tileVertices[tileId])
  const victims = state.players.filter(
    (p) =>
      p.id !== id && handSize(p) > 0 && [...p.settlements, ...p.cities].some((v) => corners.has(v)),
  )
  if (victims.length === 0) return { ...state, message: 'Robber moved — nobody to rob.' }

  const victim = pick(victims)

  // A Diplomat absorbs the steal here, at resolution — not by making the tile
  // illegal to target. Placement stays legal for everyone, so a bot's choice of
  // tile never reveals who is shielded.
  if (victim.shielded) {
    return {
      ...state,
      players: state.players.map((p) => (p.id === victim.id ? { ...p, shielded: false } : p)),
      message: `${victim.name}'s Diplomat blocked the steal.`,
    }
  }

  const card = pick(handCards(victim))
  const players = state.players.map((p) => {
    if (p.id === victim.id) return { ...p, hand: { ...p.hand, [card]: p.hand[card] - 1 } }
    if (p.id === id) return { ...p, hand: { ...p.hand, [card]: p.hand[card] + 1 } }
    return p
  })
  return { ...state, players, message: `Robber moved — stole 1 ${card} from ${victim.name}.` }
}

function advanceSetup(state: GameState): GameState {
  const order = setupOrder(state.order)
  const next = state.setupIndex + 1
  if (next >= order.length) {
    return {
      ...state,
      phase: 'play',
      turn: 0,
      setupIndex: next,
      message: `Setup done — ${state.players[state.order[0]].name} to roll.`,
    }
  }
  return {
    ...state,
    setupIndex: next,
    message: `${state.players[order[next]].name}: place a settlement.`,
  }
}

/** Spent cards go back to the bank. */
function refund(
  bank: Record<Resource, number>,
  cost: Partial<Record<Resource, number>>,
): Record<Resource, number> {
  const next = { ...bank }
  for (const [res, n] of Object.entries(cost)) next[res as Resource] += n ?? 0
  return next
}

/**
 * Could this player still place a piece, given an unlimited supply of
 * resources? Deliberately ignores what they can currently afford: production
 * keeps arriving, so "cannot afford it right now" is not the end of anything.
 * What does end the game is running out of pieces or out of legal places.
 */
export function canStillBuild(state: GameState, player: Player): boolean {
  const { board, players } = state
  const occupied = occupiedVertices(players)
  const used = takenEdges(players)

  // A city needs a settlement of their own to upgrade, and a city piece left.
  if (player.cities.length < PIECE_LIMITS.cities && player.settlements.length > 0) return true

  const endpoints = new Set<string>()
  for (const eid of player.roads) {
    const e = board.edges.find((x) => x.id === eid)
    if (!e) continue
    endpoints.add(e.a)
    endpoints.add(e.b)
  }

  if (player.settlements.length < PIECE_LIMITS.settlements) {
    for (const v of endpoints) {
      if (!occupied.has(v) && vertexNeighbours(board, v).every((n) => !occupied.has(n))) return true
    }
  }

  if (player.roads.length < PIECE_LIMITS.roads) {
    for (const e of board.edges) {
      if (!used.has(e.id) && (endpoints.has(e.a) || endpoints.has(e.b))) return true
    }
  }

  return false
}

/**
 * Endless mode's natural stopping point: nobody can place another piece and
 * the deck is spent, so no further points can be scored by anyone.
 */
function nothingLeftToDo(state: GameState): boolean {
  if (state.deck.length > 0) return false
  return state.players.every((p) => !canStillBuild(state, p))
}

/** Highest score wins; ties go to longest road, then largest army, then seat order. */
function leaderByScore(state: GameState): Player {
  const largestArmy = state.armyHolder
  const longestRoad = state.roadHolder
  return [...state.players].sort((a, b) => {
    const diff =
      victoryPointHalves(b, largestArmy, longestRoad) -
      victoryPointHalves(a, largestArmy, longestRoad)
    if (diff !== 0) return diff
    if (a.id === longestRoad) return -1
    if (b.id === longestRoad) return 1
    if (a.id === largestArmy) return -1
    if (b.id === largestArmy) return 1
    return a.id - b.id
  })[0]
}

export function reduce(state: GameState, action: Action): GameState {
  // Once won, the board is frozen: no further moves count.
  if (state.winner !== null) return state
  let next = step(state, action)
  if (next === state) return state

  const largestArmy = largestArmyHolder(next.players, next.armyHolder)
  const longestRoad = longestRoadHolder(next.board, next.players, next.roadHolder)
  if (largestArmy !== next.armyHolder || longestRoad !== next.roadHolder) {
    next = { ...next, armyHolder: largestArmy, roadHolder: longestRoad }
  }

  // Endless mode: the target never fires. The game ends when the board is
  // played out, or when the table has voted to stop (handled in `step`).
  if (next.settings.endless) {
    if (!nothingLeftToDo(next)) return next
    const leader = leaderByScore(next)
    return { ...next, winner: leader.id, message: `Nothing left to build — ${leader.name} wins on points.` }
  }

  // Compared in halves so a Merit's half-point can never round a player over
  // the line: 9.5 does not win a game played to 10.
  const champion = next.players.find(
    (p) => victoryPointHalves(p, largestArmy, longestRoad) >= next.settings.vpTarget * 2,
  )
  return champion
    ? { ...next, winner: champion.id, message: `${champion.name} wins!` }
    : next
}

/** Identifies a give/want swap regardless of who proposed it, for dedup purposes. */
export function swapSignature(offer: TradeOffer): string {
  const part = (bundle: TradeOffer['give']) =>
    Object.entries(bundle)
      .filter(([, n]) => n)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([res, n]) => `${res}${n}`)
      .join(',')
  return `${part(offer.give)}:${part(offer.want)}`
}

function step(state: GameState, action: Action): GameState {
  const id = currentPlayerId(state)
  const current = state.players[id]

  // A 7 forces every over-7-card hand to discard before anything else happens.
  if (Object.keys(state.discards).length > 0 && action.type !== 'discard') return state

  switch (action.type) {
    case 'setMode': {
      if (action.mode && action.mode !== 'robber') {
        if (!canAfford(current, action.mode)) return state
        // Refuse a build mode with nowhere legal to build (piece cap reached or
        // no reachable spot) — otherwise the UI, and a bot, can get stuck in it.
        const probe: GameState = { ...state, mode: action.mode }
        const available =
          action.mode === 'road' ? edgeTargets(probe).size : vertexTargets(probe).size
        if (available === 0) return state
      }
      return {
        ...state,
        mode: action.mode,
        message: action.mode ? `Pick a spot for your ${action.mode}.` : state.message,
      }
    }

    case 'vertex': {
      if (!vertexTargets(state).has(action.id)) return state
      if (state.phase === 'setup') {
        // The second settlement each player places pays out its adjacent tiles.
        const secondRound = state.setupIndex >= state.players.length
        const starting = secondRound
          ? (state.board.vertexTiles[action.id] ?? [])
              .map((tid) => state.board.tiles.find((t) => t.id === tid)!)
              .filter((t) => t.type !== 'desert')
              .map((t) => t.type as Resource)
              .filter((res) => state.bank[res] > 0)
          : []
        const openingBank = { ...state.bank }
        starting.forEach((res) => (openingBank[res] -= 1))
        return {
          ...state,
          bank: openingBank,
          players: withCurrent(state, (p) => {
            const hand = { ...p.hand }
            starting.forEach((res) => (hand[res] += 1))
            return { ...p, hand, settlements: [...p.settlements, action.id] }
          }),
          pendingRoadFrom: action.id,
          message: 'Now place a road touching that settlement.',
        }
      }
      if (state.mode === 'settlement') {
        return {
          ...state,
          players: withCurrent(state, (p) => ({
            ...pay(p, 'settlement'),
            settlements: [...p.settlements, action.id],
          })),
          bank: refund(state.bank, COSTS.settlement),
          mode: null,
          message: `${current.name} built a settlement.`,
        }
      }
      if (state.mode === 'city') {
        return {
          ...state,
          players: withCurrent(state, (p) => ({
            ...pay(p, 'city'),
            settlements: p.settlements.filter((v) => v !== action.id),
            cities: [...p.cities, action.id],
          })),
          bank: refund(state.bank, COSTS.city),
          mode: null,
          message: `${current.name} built a city.`,
        }
      }
      return state
    }

    case 'edge': {
      if (!edgeTargets(state).has(action.id)) return state
      if (state.phase === 'setup') {
        return advanceSetup({
          ...state,
          players: withCurrent(state, (p) => ({ ...p, roads: [...p.roads, action.id] })),
          pendingRoadFrom: null,
        })
      }
      if (state.freeRoads > 0) {
        const left = state.freeRoads - 1
        return {
          ...state,
          players: withCurrent(state, (p) => ({ ...p, roads: [...p.roads, action.id] })),
          freeRoads: left,
          mode: left > 0 ? 'road' : null,
          message: left > 0 ? 'One more free road.' : 'Road building resolved.',
        }
      }
      return {
        ...state,
        players: withCurrent(state, (p) => ({ ...pay(p, 'road'), roads: [...p.roads, action.id] })),
        bank: refund(state.bank, COSTS.road),
        mode: null,
        message: `${current.name} built a road.`,
      }
    }

    case 'tile': {
      if (state.mode !== 'robber' || action.id === state.robberTile) return state
      return stealFrom({ ...state, robberTile: action.id, mode: null }, action.id)
    }

    case 'roll': {
      if (
        state.hasRolled ||
        state.phase !== 'play' ||
        state.mode === 'robber' ||
        state.picking !== null ||
        state.draft ||
        state.merchant
      ) {
        return state
      }
      const rollsNeeded = state.settings.speedMode ? 2 : 1
      const rollCount = (state.rollCount ?? 0) + 1
      const finished = rollCount >= rollsNeeded
      const a = 1 + Math.floor(Math.random() * 6)
      const b = 1 + Math.floor(Math.random() * 6)
      const rolled: GameState = { ...state, dice: [a, b], rollCount, hasRolled: finished, mode: null }
      if (a + b === 7) {
        const owed = owedDiscards(rolled.players)
        const pending = Object.keys(owed).length > 0
        if (state.settings.santaMode) {
          return {
            ...rolled,
            discards: owed,
            picking: pending ? null : 'santaBonus',
            message: pending
              ? 'Rolled 7 — hands over 7 must discard half.'
              : 'Rolled 7 — pick a free resource.',
          }
        }
        return {
          ...rolled,
          discards: owed,
          mode: pending ? null : 'robber',
          message: pending
            ? 'Rolled 7 — hands over 7 must discard half.'
            : 'Rolled 7 — move the robber.',
        }
      }
      return produce(rolled, a + b)
    }

    case 'discard': {
      const owed = state.discards[action.playerId]
      if (!owed) return state
      const total = Object.values(action.cards).reduce((sum, n) => sum + (n ?? 0), 0)
      if (total !== owed) return state
      const player = state.players.find((p) => p.id === action.playerId)!
      if (!hasCards(player, action.cards)) return state
      const discards = { ...state.discards }
      delete discards[action.playerId]
      const done = Object.keys(discards).length === 0
      return {
        ...state,
        discards,
        bank: refund(state.bank, action.cards),
        players: state.players.map((p) => {
          if (p.id !== action.playerId) return p
          const hand = { ...p.hand }
          for (const [res, n] of Object.entries(action.cards)) hand[res as Resource] -= n ?? 0
          return { ...p, hand }
        }),
        mode: done && !state.settings.santaMode ? 'robber' : state.mode,
        picking: done && state.settings.santaMode ? 'santaBonus' : state.picking,
        message: done
          ? state.settings.santaMode
            ? 'Discards resolved — pick a free resource.'
            : 'Discards resolved — move the robber.'
          : state.message,
      }
    }

    case 'bankTrade': {
      const rate = ratesFor(state, id)[action.give]
      if (current.hand[action.give] < rate || action.give === action.get) return state
      if (state.bank[action.get] < 1) return state
      return {
        ...state,
        bank: {
          ...state.bank,
          [action.give]: state.bank[action.give] + rate,
          [action.get]: state.bank[action.get] - 1,
        },
        players: withCurrent(state, (p) => ({
          ...p,
          hand: {
            ...p.hand,
            [action.give]: p.hand[action.give] - rate,
            [action.get]: p.hand[action.get] + 1,
          },
        })),
        message: `Traded ${rate} ${action.give} for 1 ${action.get}.`,
      }
    }

    case 'buyDev': {
      if (!canAffordDev(current) || state.deck.length === 0 || state.draft) return state

      // Drafting pays now and hands over the choice: the revealed cards leave
      // the deck so nobody can draw them mid-decision, and `draftPick` puts
      // the ones not taken back at the bottom.
      if (state.settings.draftDevCards) {
        const revealed = state.deck.slice(0, DRAFT_SIZE)
        return {
          ...state,
          deck: state.deck.slice(revealed.length),
          draft: revealed,
          bank: refund(state.bank, DEV_COST),
          players: withCurrent(state, (p) => {
            const hand = { ...p.hand }
            for (const [res, n] of Object.entries(DEV_COST)) hand[res as Resource] -= n ?? 0
            return { ...p, hand }
          }),
          message:
            revealed.length === 1
              ? 'One card left in the deck — take it.'
              : `Pick one of ${revealed.length} cards.`,
        }
      }

      const [kind, ...rest] = state.deck
      return {
        ...state,
        deck: rest,
        cardSeq: (state.cardSeq ?? 0) + 1,
        bank: refund(state.bank, DEV_COST),
        players: withCurrent(state, (p) => {
          const hand = { ...p.hand }
          for (const [res, n] of Object.entries(DEV_COST)) hand[res as Resource] -= n ?? 0
          return {
            ...p,
            hand,
            devCards: [
              ...p.devCards,
              { id: `${p.id}-${state.cardSeq ?? 0}`, kind, ready: false },
            ],
          }
        }),
        message: `Bought a development card (${rest.length} left).`,
      }
    }

    case 'draftPick': {
      if (!state.draft) return state
      const kind = state.draft[action.index]
      if (!kind) return state
      // The rest go to the bottom in the order they were revealed: delayed,
      // never denied — a draft cannot remove a card kind from the game.
      const rest = state.draft.filter((_, i) => i !== action.index)
      return {
        ...state,
        deck: [...state.deck, ...rest],
        draft: null,
        cardSeq: (state.cardSeq ?? 0) + 1,
        players: withCurrent(state, (p) => ({
          ...p,
          devCards: [
            ...p.devCards,
            { id: `${p.id}-${state.cardSeq ?? 0}`, kind, ready: false },
          ],
        })),
        message: `Drafted a development card (${state.deck.length + rest.length} left).`,
      }
    }

    case 'playDev': {
      const card = current.devCards.find((c) => c.id === action.cardId)
      if (!card || !card.ready || state.playedDev || card.kind === 'victory') return state
      if (card.spent) return state
      // Merit keeps scoring after its resource is claimed, so it is marked
      // spent instead of being discarded like every other kind.
      const keeps = card.kind === 'merit'
      const base: GameState = {
        ...state,
        playedDev: true,
        players: withCurrent(state, (p) => ({
          ...p,
          devCards: keeps
            ? p.devCards.map((c) => (c.id === card.id ? { ...c, spent: true } : c))
            : p.devCards.filter((c) => c.id !== card.id),
          knights: p.knights + (card.kind === 'knight' ? 1 : 0),
          shielded: p.shielded || card.kind === 'diplomat',
        })),
      }
      switch (card.kind) {
        case 'knight':
          if (state.settings.santaMode) {
            return { ...base, picking: 'santaBonus', message: 'Knight played — pick a free resource.' }
          }
          return { ...base, mode: 'robber', message: 'Knight played — move the robber.' }
        case 'roadBuilding':
          return {
            ...base,
            freeRoads: 2,
            mode: 'road',
            message: 'Road building — place 2 free roads.',
          }
        case 'monopoly':
          return { ...base, picking: 'monopoly' }
        case 'plenty':
          return { ...base, picking: 'plenty', plentyLeft: 2 }
        case 'trailblazer':
          return { ...base, freeRoads: 1, mode: 'road', message: 'Trailblazer — place 1 free road.' }
        case 'merchant':
          return { ...base, merchant: { give: {}, get: {} }, message: 'Merchant — swap up to 3 cards.' }
        case 'diplomat':
          return { ...base, message: 'Diplomat played — the next steal against you is blocked.' }
        case 'merit':
          return { ...base, picking: 'meritBonus', message: 'Merit — pick a free resource.' }
        default:
          return base
      }
    }

    /** Monopoly: every other player hands over their whole stock of one resource. */
    case 'monopoly': {
      if (state.picking !== 'monopoly') return state
      const taken = state.players.reduce(
        (sum, p) => (p.id === id ? sum : sum + p.hand[action.res]),
        0,
      )
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === id
            ? { ...p, hand: { ...p.hand, [action.res]: p.hand[action.res] + taken } }
            : { ...p, hand: { ...p.hand, [action.res]: 0 } },
        ),
        picking: null,
        message: `Monopoly on ${action.res} — collected ${taken}.`,
      }
    }

    case 'plenty': {
      if (state.picking !== 'plenty') return state
      if (state.bank[action.res] < 1) return state
      const left = state.plentyLeft - 1
      return {
        ...state,
        bank: { ...state.bank, [action.res]: state.bank[action.res] - 1 },
        players: withCurrent(state, (p) => ({
          ...p,
          hand: { ...p.hand, [action.res]: p.hand[action.res] + 1 },
        })),
        plentyLeft: left,
        picking: left === 0 ? null : 'plenty',
        message: left === 0 ? 'Year of plenty resolved.' : state.message,
      }
    }

    case 'santaBonus': {
      if (state.picking !== 'santaBonus') return state
      if (state.bank[action.res] < 1) return state
      return {
        ...state,
        bank: { ...state.bank, [action.res]: state.bank[action.res] - 1 },
        players: withCurrent(state, (p) => ({
          ...p,
          hand: { ...p.hand, [action.res]: p.hand[action.res] + 1 },
        })),
        picking: null,
        message: `Got +1 ${action.res} from Santa.`,
      }
    }

    case 'meritBonus': {
      if (state.picking !== 'meritBonus') return state
      if (state.bank[action.res] < 1) return state
      return {
        ...state,
        bank: { ...state.bank, [action.res]: state.bank[action.res] - 1 },
        players: withCurrent(state, (p) => ({
          ...p,
          hand: { ...p.hand, [action.res]: p.hand[action.res] + 1 },
        })),
        picking: null,
        message: `Merit — took 1 ${action.res}.`,
      }
    }

    case 'merchantPick': {
      if (!state.merchant) return state
      const basket = { ...state.merchant[action.side] }
      const next = (basket[action.res] ?? 0) + action.delta
      if (next < 0) return state
      // Cap each basket at 3, never offer cards you do not hold, and never ask
      // the bank for a resource it has run out of.
      const others = Object.entries(basket)
        .filter(([res]) => res !== action.res)
        .reduce((sum, [, n]) => sum + (n ?? 0), 0)
      if (others + next > MERCHANT_LIMIT) return state
      if (action.side === 'give' && next > current.hand[action.res]) return state
      if (action.side === 'get' && next > state.bank[action.res]) return state
      if (next === 0) delete basket[action.res]
      else basket[action.res] = next
      return { ...state, merchant: { ...state.merchant, [action.side]: basket } }
    }

    case 'merchantConfirm': {
      if (!state.merchant) return state
      const total = (basket: Partial<Record<Resource, number>>) =>
        Object.values(basket).reduce((sum, n) => sum + (n ?? 0), 0)
      const out = total(state.merchant.give)
      // 1:1 means the two baskets must match; an empty swap is not a play.
      if (out === 0 || out !== total(state.merchant.get)) return state
      const { give, get } = state.merchant
      const bank = { ...state.bank }
      for (const [res, n] of Object.entries(give)) bank[res as Resource] += n ?? 0
      for (const [res, n] of Object.entries(get)) bank[res as Resource] -= n ?? 0
      return {
        ...state,
        bank,
        players: withCurrent(state, (p) => {
          const hand = { ...p.hand }
          for (const [res, n] of Object.entries(give)) hand[res as Resource] -= n ?? 0
          for (const [res, n] of Object.entries(get)) hand[res as Resource] += n ?? 0
          return { ...p, hand }
        }),
        merchant: null,
        message: `Merchant — swapped ${out} card${out === 1 ? '' : 's'} with the bank.`,
      }
    }

    // Backing out leaves the card spent: it was played, the swap was declined.
    case 'merchantCancel':
      return state.merchant ? { ...state, merchant: null, message: 'Merchant swap cancelled.' } : state

    case 'propose': {
      const offer = action.offer
      const eligibleResponders = state.players
        .map((p) => p.id)
        .filter((id) => (offer.to === 'any' ? id !== offer.from : id === offer.to))

      const autoDeclined = eligibleResponders.filter(
        (id) => !hasCards(state.players[id], offer.want),
      )

      if (autoDeclined.length > 0) {
        const declinedBy = [...new Set([...offer.declinedBy, ...autoDeclined])]
        const allDeclined = eligibleResponders.every((id) => declinedBy.includes(id))
        if (allDeclined) {
          return {
            ...state,
            offer: null,
            offersMade: (state.offersMade ?? 0) + 1,
            rejectedSwaps: [...(state.rejectedSwaps ?? []), swapSignature(offer)],
            message: 'Offer declined — requested cards unavailable.',
          }
        }
        return {
          ...state,
          offer: { ...offer, declinedBy },
          offersMade: (state.offersMade ?? 0) + 1,
          message: 'Trade offered — waiting on a response.',
        }
      }

      return {
        ...state,
        offer,
        offersMade: (state.offersMade ?? 0) + 1,
        message: 'Trade offered — waiting on a response.',
      }
    }

    case 'acceptOffer': {
      if (!state.offer) return state
      const responderPlayer = state.players.find((p) => p.id === action.responder)
      if (!responderPlayer || !hasCards(responderPlayer, state.offer.want)) return state
      const name = responderPlayer.name
      return {
        ...state,
        players: applyTrade(
          state.players,
          state.offer.from,
          action.responder,
          state.offer.give,
          state.offer.want,
        ),
        offer: null,
        message: `${name} accepted the trade.`,
      }
    }

    case 'declineOffer': {
      if (!state.offer) return state
      // A targeted offer dies the moment its one possible responder says no.
      if (state.offer.to !== 'any') {
        return { ...state, offer: null, message: 'Offer declined.' }
      }
      const decliners = [...new Set([...state.offer.declinedBy, action.responder])]
      const others = state.players.filter((p) => p.id !== state.offer!.from).map((p) => p.id)
      const allDeclined = others.every((id) => decliners.includes(id))
      return allDeclined
        ? {
            ...state,
            offer: null,
            rejectedSwaps: [...(state.rejectedSwaps ?? []), swapSignature(state.offer)],
            message: 'Offer declined.',
          }
        : { ...state, offer: { ...state.offer, declinedBy: decliners } }
    }

    case 'cancelOffer':
      if (!state.offer) return state
      return { ...state, offer: null, message: 'Offer cancelled.' }

    case 'proposeEnd': {
      // Endless has no target to reach, so the table needs a way to agree it
      // is finished. One refusal is enough to keep playing.
      if (!state.settings.endless || state.phase !== 'play' || state.endVote) return state
      const from = currentPlayerId(state) as PlayerId
      return {
        ...state,
        endVote: { from, accepted: [] },
        message: `${state.players[from].name} wants to end the game — everyone must agree.`,
      }
    }

    case 'respondEnd': {
      const vote = state.endVote
      if (!vote || action.responder === vote.from || vote.accepted.includes(action.responder)) return state
      if (!action.accept) {
        return {
          ...state,
          endVote: null,
          message: `${state.players[action.responder].name} wants to keep playing.`,
        }
      }
      const accepted = [...vote.accepted, action.responder]
      if (accepted.length < state.players.length - 1) {
        const waiting = state.players.length - 1 - accepted.length
        return { ...state, endVote: { ...vote, accepted }, message: `${waiting} more to agree to end the game.` }
      }
      const leader = leaderByScore(state)
      return {
        ...state,
        endVote: null,
        winner: leader.id,
        message: `The table agreed to stop — ${leader.name} wins on points.`,
      }
    }

    case 'endTurn': {
      if (state.phase !== 'play' || state.mode === 'robber' || state.picking || state.draft || state.merchant) return state
      const next = (state.turn + 1) % state.players.length
      const nextId = state.order[next]
      return {
        ...state,
        turn: next,
        // Cards bought earlier become playable when their owner's turn comes round.
        players: state.players.map((p) =>
          p.id === nextId ? { ...p, devCards: p.devCards.map((c) => ({ ...c, ready: true })) } : p,
        ),
        playedDev: false,
        freeRoads: 0,
        picking: null,
        draft: null,
        mode: null,
        dice: null,
        hasRolled: false,
        rollCount: 0,
        offer: null,
        offersMade: 0,
        rejectedSwaps: [],
        // An unresolved vote does not carry into someone else's turn.
        endVote: null,
        message: `${state.players[nextId].name} to roll.`,
      }
    }

    default:
      return state
  }
}
