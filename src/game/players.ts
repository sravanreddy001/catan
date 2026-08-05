import type { Resource } from './board'

export type PlayerId = 0 | 1 | 2 | 3

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

export function createPlayers(): Player[] {
  return PALETTE.map((p, i) => ({
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
  }))
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

export function victoryPoints(player: Player): number {
  return player.settlements.length + player.cities.length * 2
}
