// Pure game state + reducer. The host runs this and broadcasts the resulting
// state; guests never execute it, so the randomness here stays authoritative.

import {
  createBoard,
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
  victoryPoints,
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
}

export function defaultSettings(): GameSettings {
  return {
    publicHands: false,
    vpTarget: 10,
    bankPreset: 'standard',
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
  phase: 'setup' | 'play'
  setupIndex: number
  /** During setup a settlement must be followed by a road from that corner. */
  pendingRoadFrom: string | null
  turn: number
  mode: Mode
  dice: [number, number] | null
  hasRolled: boolean
  robberTile: string
  message: string
  offer: TradeOffer | null
  deck: DevKind[]
  playedDev: boolean
  /** Free roads owed by a road-building card. */
  freeRoads: number
  picking: 'monopoly' | 'plenty' | null
  plentyLeft: number
  /** Cards each over-7-card player still owes after a 7 is rolled. */
  discards: Partial<Record<PlayerId, number>>
  /** Random turn order, shuffled once at game start; `turn`/`setupIndex` index into this. */
  order: PlayerId[]
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
  | { type: 'playDev'; cardId: string }
  | { type: 'monopoly'; res: Resource }
  | { type: 'plenty'; res: Resource }
  | { type: 'propose'; offer: TradeOffer }
  | { type: 'acceptOffer'; responder: PlayerId }
  | { type: 'declineOffer'; responder: PlayerId }
  | { type: 'cancelOffer' }
  | { type: 'discard'; playerId: PlayerId; cards: Partial<Record<Resource, number>> }
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
  const board = createBoard()
  const players = createPlayers(playerCount, colors).map((p, i) =>
    names?.[i] ? { ...p, name: names[i] } : p,
  )
  const order = shuffledOrder(playerCount)
  const finalSettings = { ...defaultSettings(), ...settings }
  const bankPerResource = BANK_PRESET_VALUES[finalSettings.bankPreset]
  return {
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
    phase: 'setup',
    setupIndex: 0,
    pendingRoadFrom: null,
    turn: 0,
    mode: null,
    dice: null,
    hasRolled: false,
    robberTile: board.tiles.find((t) => t.type === 'desert')?.id ?? board.tiles[0].id,
    message: `${players[order[0]].name}: place your first settlement.`,
    offer: null,
    deck: createDevDeck(),
    playedDev: false,
    freeRoads: 0,
    picking: null,
    plentyLeft: 0,
    discards: {},
    order,
    settings: finalSettings,
  }
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

/** Longest continuous road, ties or under 5 segments leave nobody holding it. */
export function longestRoadHolder(board: Board, players: Player[]): PlayerId | null {
  const lengths = players.map((p) => {
    const blocked = new Set<string>()
    for (const other of players) {
      if (other.id === p.id) continue
      other.settlements.forEach((v) => blocked.add(v))
      other.cities.forEach((v) => blocked.add(v))
    }
    return { id: p.id, len: longestRoadLength(board, p.roads, blocked) }
  })
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

export function reduce(state: GameState, action: Action): GameState {
  // Once won, the board is frozen: no further moves count.
  if (state.winner !== null) return state
  const next = step(state, action)
  if (next === state) return state
  const largestArmy = largestArmyHolder(next.players)
  const longestRoad = longestRoadHolder(next.board, next.players)
  const champion = next.players.find((p) => victoryPoints(p, largestArmy, longestRoad) >= next.settings.vpTarget)
  return champion
    ? { ...next, winner: champion.id, message: `${champion.name} wins!` }
    : next
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
      if (state.hasRolled || state.phase !== 'play') return state
      const a = 1 + Math.floor(Math.random() * 6)
      const b = 1 + Math.floor(Math.random() * 6)
      const rolled: GameState = { ...state, dice: [a, b], hasRolled: true, mode: null }
      if (a + b === 7) {
        const owed = owedDiscards(rolled.players)
        const pending = Object.keys(owed).length > 0
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
        mode: done ? 'robber' : state.mode,
        message: done ? 'Discards resolved — move the robber.' : state.message,
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
      if (!canAffordDev(current) || state.deck.length === 0) return state
      const [kind, ...rest] = state.deck
      return {
        ...state,
        deck: rest,
        bank: refund(state.bank, DEV_COST),
        players: withCurrent(state, (p) => {
          const hand = { ...p.hand }
          for (const [res, n] of Object.entries(DEV_COST)) hand[res as Resource] -= n ?? 0
          return {
            ...p,
            hand,
            devCards: [
              ...p.devCards,
              { id: `${p.id}-${state.deck.length}-${Date.now()}`, kind, ready: false },
            ],
          }
        }),
        message: `Bought a development card (${rest.length} left).`,
      }
    }

    case 'playDev': {
      const card = current.devCards.find((c) => c.id === action.cardId)
      if (!card || !card.ready || state.playedDev || card.kind === 'victory') return state
      const base: GameState = {
        ...state,
        playedDev: true,
        players: withCurrent(state, (p) => ({
          ...p,
          devCards: p.devCards.filter((c) => c.id !== card.id),
          knights: p.knights + (card.kind === 'knight' ? 1 : 0),
        })),
      }
      switch (card.kind) {
        case 'knight':
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

    case 'propose':
      return { ...state, offer: action.offer, message: 'Trade offered — waiting on a response.' }

    case 'acceptOffer': {
      if (!state.offer) return state
      const name = state.players.find((p) => p.id === action.responder)!.name
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
        ? { ...state, offer: null, message: 'Offer declined.' }
        : { ...state, offer: { ...state.offer, declinedBy: decliners } }
    }

    case 'cancelOffer':
      if (!state.offer) return state
      return { ...state, offer: null, message: 'Offer cancelled.' }

    case 'endTurn': {
      if (state.phase !== 'play' || state.mode === 'robber' || state.picking) return state
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
        mode: null,
        dice: null,
        hasRolled: false,
        offer: null,
        message: `${state.players[nextId].name} to roll.`,
      }
    }

    default:
      return state
  }
}
