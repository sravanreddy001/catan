import type { Resource } from './board'

export type PlayerId = 0 | 1 | 2 | 3

export type DevKind = 'knight' | 'victory' | 'roadBuilding' | 'monopoly' | 'plenty'

export interface DevCard {
  id: string
  kind: DevKind
  /** Cards cannot be played on the turn they are bought. */
  ready: boolean
}

export const DEV_LABEL: Record<DevKind, string> = {
  knight: 'Knight',
  victory: 'Victory point',
  roadBuilding: 'Road building',
  monopoly: 'Monopoly',
  plenty: 'Year of plenty',
}

export const DEV_ICON: Record<DevKind, string> = {
  knight: '⚔️',
  victory: '🏆',
  roadBuilding: '🛣️',
  monopoly: '💰',
  plenty: '🎁',
}

export const DEV_COST: Partial<Record<Resource, number>> = { wool: 1, grain: 1, ore: 1 }

export interface Player {
  id: PlayerId
  name: string
  color: string
  /** Darker shade, used for outlines so pieces read on any tile. */
  dark: string
  hand: Record<Resource, number>
  settlements: string[] // vertex ids
  cities: string[] // vertex ids
  roads: string[] // edge ids
  devCards: DevCard[]
  /** Knights played, for largest army. */
  knights: number
}

export const RESOURCES: Resource[] = ['brick', 'lumber', 'wool', 'grain', 'ore']

export const RESOURCE_ICON: Record<Resource, string> = {
  brick: '🧱',
  lumber: '🌲',
  wool: '🐑',
  grain: '🌾',
  ore: '⛰️',
}

export const COSTS = {
  road: { brick: 1, lumber: 1 } as Partial<Record<Resource, number>>,
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 } as Partial<Record<Resource, number>>,
  city: { grain: 2, ore: 3 } as Partial<Record<Resource, number>>,
}

export type BuildKind = keyof typeof COSTS

const PALETTE: Array<{ name: string; color: string; dark: string }> = [
  { name: 'Red', color: '#e2483c', dark: '#8d1f17' },
  { name: 'Blue', color: '#3d7fd6', dark: '#1c4682' },
  { name: 'Orange', color: '#ef8b34', dark: '#96500f' },
  { name: 'White', color: '#f2ede4', dark: '#8d8578' },
]

export function createPlayers(count = 4): Player[] {
  return PALETTE.slice(0, count).map((p, i) => ({
    id: i as PlayerId,
    name: p.name,
    color: p.color,
    dark: p.dark,
    // Starting hand so the build actions are usable while the rules engine
    // (production on dice roll) is still to come.
    hand: { brick: 4, lumber: 4, wool: 3, grain: 3, ore: 2 },
    settlements: [],
    cities: [],
    roads: [],
    devCards: [],
    knights: 0,
  }))
}

/** Standard 25-card development deck, shuffled. */
export function createDevDeck(rand: () => number = Math.random): DevKind[] {
  const deck: DevKind[] = [
    ...Array<DevKind>(14).fill('knight'),
    ...Array<DevKind>(5).fill('victory'),
    ...Array<DevKind>(2).fill('roadBuilding'),
    ...Array<DevKind>(2).fill('monopoly'),
    ...Array<DevKind>(2).fill('plenty'),
  ]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

export function canAffordDev(player: Player): boolean {
  return Object.entries(DEV_COST).every(([res, n]) => player.hand[res as Resource] >= (n ?? 0))
}

/**
 * Largest army: three or more knights and strictly more than anyone else.
 * Returns null while it is tied or unclaimed.
 */
export function largestArmyHolder(players: Player[]): PlayerId | null {
  const best = Math.max(...players.map((p) => p.knights))
  if (best < 3) return null
  const leaders = players.filter((p) => p.knights === best)
  return leaders.length === 1 ? leaders[0].id : null
}

export function canAfford(player: Player, kind: BuildKind): boolean {
  return Object.entries(COSTS[kind]).every(
    ([res, n]) => player.hand[res as Resource] >= (n ?? 0),
  )
}

export function pay(player: Player, kind: BuildKind): Player {
  const hand = { ...player.hand }
  for (const [res, n] of Object.entries(COSTS[kind])) {
    hand[res as Resource] -= n ?? 0
  }
  return { ...player, hand }
}

/** A proposed swap between two players. `to: 'any'` is an open offer. */
export interface TradeOffer {
  from: PlayerId
  to: PlayerId | 'any'
  give: Partial<Record<Resource, number>>
  want: Partial<Record<Resource, number>>
}

export function hasCards(player: Player, cards: Partial<Record<Resource, number>>): boolean {
  return Object.entries(cards).every(([res, n]) => player.hand[res as Resource] >= (n ?? 0))
}

export function isEmptyBundle(cards: Partial<Record<Resource, number>>): boolean {
  return Object.values(cards).every((n) => !n)
}

/** Move a bundle out of one hand and into another. */
export function applyTrade(
  players: Player[],
  from: PlayerId,
  to: PlayerId,
  give: Partial<Record<Resource, number>>,
  want: Partial<Record<Resource, number>>,
): Player[] {
  return players.map((p) => {
    if (p.id !== from && p.id !== to) return p
    const hand = { ...p.hand }
    const [out, incoming] = p.id === from ? [give, want] : [want, give]
    for (const [res, n] of Object.entries(out)) hand[res as Resource] -= n ?? 0
    for (const [res, n] of Object.entries(incoming)) hand[res as Resource] += n ?? 0
    return { ...p, hand }
  })
}

export function victoryPoints(player: Player, largestArmy: PlayerId | null = null): number {
  const cards = player.devCards.filter((c) => c.kind === 'victory').length
  return (
    player.settlements.length +
    player.cities.length * 2 +
    cards +
    (largestArmy === player.id ? 2 : 0)
  )
}
