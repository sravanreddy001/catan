// Pure game state + reducer. The host runs this and broadcasts the resulting
// state; guests never execute it, so the randomness here stays authoritative.

import { createBoard, tradeRates, vertexNeighbours, type Board, type Resource } from './board'
import {
  DEV_COST,
  applyTrade,
  canAfford,
  canAffordDev,
  createDevDeck,
  createPlayers,
  pay,
  type BuildKind,
  type DevKind,
  type Player,
  type PlayerId,
  type TradeOffer,
} from './players'

export type Mode = BuildKind | 'robber' | null

export interface GameState {
  board: Board
  players: Player[]
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
  | { type: 'declineOffer' }
  | { type: 'endTurn' }

/** Snake order for the opening placements, e.g. 0,1,2,3,3,2,1,0. */
export function setupOrder(count: number): number[] {
  const forward = Array.from({ length: count }, (_, i) => i)
  return [...forward, ...forward.slice().reverse()]
}

export function currentPlayerId(state: GameState): number {
  return state.phase === 'setup'
    ? setupOrder(state.players.length)[state.setupIndex]
    : state.turn
}

export function createGame(playerCount: number, names?: string[]): GameState {
  const board = createBoard()
  const players = createPlayers(playerCount).map((p, i) =>
    names?.[i] ? { ...p, name: names[i] } : p,
  )
  return {
    board,
    players,
    phase: 'setup',
    setupIndex: 0,
    pendingRoadFrom: null,
    turn: 0,
    mode: null,
    dice: null,
    hasRolled: false,
    robberTile: board.tiles.find((t) => t.type === 'desert')?.id ?? board.tiles[0].id,
    message: `${players[0].name}: place your first settlement.`,
    offer: null,
    deck: createDevDeck(),
    playedDev: false,
    freeRoads: 0,
    picking: null,
    plentyLeft: 0,
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

function handSize(p: Player): number {
  return Object.values(p.hand).reduce((a, b) => a + b, 0)
}

/** Flatten a hand into one entry per card, for random steal/discard picks. */
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
    const reachable = new Set<string>()
    for (const eid of current.roads) {
      const e = board.edges.find((x) => x.id === eid)!
      reachable.add(e.a)
      reachable.add(e.b)
    }
    reachable.forEach((v) => distanceOk(v) && targets.add(v))
  } else if (mode === 'city') {
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

  const players = state.players.map((p) => {
    const gain = gains[p.id]
    if (!gain) return p
    const hand = { ...p.hand }
    for (const [res, n] of Object.entries(gain)) hand[res as Resource] += n
    return { ...p, hand }
  })

  const mine = gains[currentPlayerId(state)]
  const summary = mine
    ? Object.entries(mine)
        .map(([res, n]) => `+${n} ${res}`)
        .join(', ')
    : 'nothing for you'
  return { ...state, players, message: `Rolled ${sum} — ${summary}.` }
}

/** Standard rule: on a 7, anyone holding more than 7 cards loses half. */
function discardHalf(players: Player[]): Player[] {
  return players.map((p) => {
    if (handSize(p) <= 7) return p
    const total = handSize(p)
    const hand = { ...p.hand }
    for (let i = 0; i < Math.floor(total / 2); i++) {
      hand[pick(handCards({ ...p, hand }))] -= 1
    }
    return { ...p, hand }
  })
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
  const order = setupOrder(state.players.length)
  const next = state.setupIndex + 1
  if (next >= order.length) {
    return {
      ...state,
      phase: 'play',
      turn: 0,
      setupIndex: next,
      message: `Setup done — ${state.players[0].name} to roll.`,
    }
  }
  return {
    ...state,
    setupIndex: next,
    message: `${state.players[order[next]].name}: place a settlement.`,
  }
}

export function reduce(state: GameState, action: Action): GameState {
  const id = currentPlayerId(state)
  const current = state.players[id]

  switch (action.type) {
    case 'setMode': {
      if (action.mode && action.mode !== 'robber' && !canAfford(current, action.mode)) return state
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
          : []
        return {
          ...state,
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
        return {
          ...rolled,
          players: discardHalf(rolled.players),
          mode: 'robber',
          message: 'Rolled 7 — hands over 7 discarded half. Move the robber.',
        }
      }
      return produce(rolled, a + b)
    }

    case 'bankTrade': {
      const rate = ratesFor(state, id)[action.give]
      if (current.hand[action.give] < rate || action.give === action.get) return state
      return {
        ...state,
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
      const left = state.plentyLeft - 1
      return {
        ...state,
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

    case 'declineOffer':
      return { ...state, offer: null, message: 'Offer declined.' }

    case 'endTurn': {
      if (state.phase !== 'play' || state.mode === 'robber' || state.picking) return state
      const next = (state.turn + 1) % state.players.length
      return {
        ...state,
        turn: next,
        // Cards bought earlier become playable when their owner's turn comes round.
        players: state.players.map((p) =>
          p.id === next ? { ...p, devCards: p.devCards.map((c) => ({ ...c, ready: true })) } : p,
        ),
        playedDev: false,
        freeRoads: 0,
        picking: null,
        mode: null,
        dice: null,
        hasRolled: false,
        offer: null,
        message: `${state.players[next].name} to roll.`,
      }
    }

    default:
      return state
  }
}
