import type { Resource } from './board'

/** Seats. 0-3 is the standard game; 4-7 exist only on the wider 5-8 board. */
export type PlayerId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export type DevKind =
  | 'knight'
  | 'victory'
  | 'roadBuilding'
  | 'monopoly'
  | 'plenty'
  // Only dealt when the newDevCards setting is on; see createDevDeck.
  | 'merchant'
  | 'trailblazer'
  | 'diplomat'
  | 'merit'

export interface DevCard {
  id: string
  kind: DevKind
  /** Cards cannot be played on the turn they are bought. */
  ready: boolean
  /**
   * Merit only: its free resource has been taken. The card is kept rather than
   * discarded because its half-point keeps counting once spent — every other
   * kind leaves the hand when played.
   */
  spent?: boolean
}

export const DEV_LABEL: Record<DevKind, string> = {
  knight: 'Knight',
  victory: 'Victory point',
  roadBuilding: 'Road building',
  monopoly: 'Monopoly',
  plenty: 'Year of plenty',
  merchant: 'Merchant',
  trailblazer: 'Trailblazer',
  diplomat: 'Diplomat',
  merit: 'Merit',
}

export const DEV_ICON: Record<DevKind, string> = {
  knight: '⚔️',
  victory: '🏆',
  roadBuilding: '🛣️',
  monopoly: '💰',
  plenty: '🎁',
  merchant: '⚖️',
  trailblazer: '🧭',
  diplomat: '🕊️',
  merit: '🎖️',
}

/**
 * One plain sentence per kind, shown in the play-confirm sheet and the card
 * guide. Nine kinds is too many to keep in a player's head, and the original
 * five never explained themselves either — so every kind gets a rule, not just
 * the new ones.
 */
export const DEV_RULE: Record<DevKind, string> = {
  knight: 'Move the robber and steal a card. Three of these wins Largest Army.',
  victory: 'Worth 1 point. Stays hidden until you win.',
  roadBuilding: 'Build 2 roads free.',
  monopoly: 'Name a resource — every player hands you all of theirs.',
  plenty: 'Take any 2 resources from the bank.',
  merchant: 'Swap up to 3 cards with the bank, 1 for 1. Mix freely.',
  trailblazer: 'Build 1 road free.',
  diplomat: 'Blocks the next attempt to steal from you. Used up when it fires.',
  merit: 'Worth half a point, and take 1 resource from the bank. Two make a full point.',
}

/** Most cards a single Merchant play may swap, in each direction. */
export const MERCHANT_LIMIT = 3

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
  /**
   * A played Diplomat, waiting to absorb the next steal aimed at this player.
   * Checked when the robber resolves rather than when it is placed, so no
   * bot's choice of tile can reveal who is holding one.
   */
  shielded: boolean
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

export const BUILD_LABEL: Record<BuildKind, string> = {
  road: 'Road',
  settlement: 'Settlement',
  city: 'City',
}

export const PALETTE: Array<{ name: string; color: string; dark: string }> = [
  { name: 'Red', color: '#e2483c', dark: '#8d1f17' },
  { name: 'Blue', color: '#3d7fd6', dark: '#1c4682' },
  { name: 'Orange', color: '#ef8b34', dark: '#96500f' },
  { name: 'White', color: '#f2ede4', dark: '#8d8578' },
  // Seats 5-8. Picked to stay apart from the first four and from each other on
  // the board's greens and blues, and to hold up as a small road stroke.
  { name: 'Green', color: '#4aa863', dark: '#1f5e30' },
  { name: 'Purple', color: '#9b6bd6', dark: '#4c2c7e' },
  { name: 'Teal', color: '#3fb3ad', dark: '#155f5b' },
  { name: 'Pink', color: '#e2699f', dark: '#8b2f5c' },
]

/** `colorIndices[i]` picks player i's swatch from PALETTE; defaults to palette order. */
export function createPlayers(count = 4, colorIndices?: number[]): Player[] {
  return Array.from({ length: count }, (_, i) => {
    const swatch = PALETTE[colorIndices?.[i] ?? i]
    return {
      id: i as PlayerId,
      name: swatch.name,
      color: swatch.color,
      dark: swatch.dark,
      // Empty: the standard opening pays out from each player's second
      // settlement, so nothing is dealt up front.
      hand: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 },
      settlements: [],
      cities: [],
      roads: [],
      devCards: [],
      knights: 0,
      shielded: false,
    }
  })
}

/**
 * Development deck, shuffled. 25 cards at four players or fewer.
 *
 * `extraKinds` swaps the standard 14/5/2/2/2 for the expanded composition:
 * knights drop to 7 so Largest Army stays reachable but becomes a race, and
 * the four new kinds take 9 of the 25 slots — Merit carries 4 of those, enough
 * that a game actually sees one. `noRobber` (Santa mode) drops Diplomat — it
 * shields against a steal that mode has removed — and gives its slot back to
 * the knights.
 *
 * `playerCount` above four scales the whole composition by `playerCount / 4`,
 * the same rule the bank uses. A fixed 25-card deck shared by eight players is
 * a scarce deck by accident: it empties around the midgame and spreads the same
 * few victory cards over twice as many people. Scaling every kind by one factor
 * holds *per-player* availability constant, so an eight-player game draws at the
 * rate a four-player game does. The physical 5-6 player extension scales victory
 * cards more gently than this (5 to 6, not 5 to 8), but it also fixes the target
 * at 10; ours goes to 12, and those points have to come from somewhere.
 */
export function createDevDeck(
  rand: () => number = Math.random,
  extraKinds = false,
  noRobber = false,
  playerCount = 4,
): DevKind[] {
  const composition: Array<[DevKind, number]> = extraKinds
    ? [
        ['knight', noRobber ? 8 : 7],
        ['victory', 3],
        ['roadBuilding', 2],
        ['monopoly', 2],
        ['plenty', 2],
        ['merchant', 2],
        ['trailblazer', 2],
        ['diplomat', noRobber ? 0 : 1],
        ['merit', 4],
      ]
    : [
        ['knight', 14],
        ['victory', 5],
        ['roadBuilding', 2],
        ['monopoly', 2],
        ['plenty', 2],
      ]

  const scale = playerCount > 4 ? playerCount / 4 : 1
  const deck: DevKind[] = []
  for (const [kind, count] of composition) {
    // A kind that is deliberately absent stays absent; one that exists never
    // rounds away to nothing.
    const scaled = count === 0 ? 0 : Math.max(1, Math.round(count * scale))
    for (let i = 0; i < scaled; i++) deck.push(kind)
  }
  return shuffle(deck, rand)
}

function shuffle(deck: DevKind[], rand: () => number): DevKind[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

export function canAffordDev(player: Player): boolean {
  return Object.entries(DEV_COST).every(([res, n]) => player.hand[res as Resource] >= (n ?? 0))
}

export function handSize(player: Player): number {
  return Object.values(player.hand).reduce((a, b) => a + b, 0)
}

/** Random legal bundle of `owed` cards from a hand, for forced/bot discards. */
export function randomDiscard(player: Player, owed: number): Partial<Record<Resource, number>> {
  const pool: Resource[] = []
  for (const [res, n] of Object.entries(player.hand)) {
    for (let i = 0; i < n; i++) pool.push(res as Resource)
  }
  const bundle: Partial<Record<Resource, number>> = {}
  for (let i = 0; i < owed && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    const [card] = pool.splice(idx, 1)
    bundle[card] = (bundle[card] ?? 0) + 1
  }
  return bundle
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
  /** Who has already turned this down — for an 'any' offer, it stays open for the rest. */
  declinedBy: PlayerId[]
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

/**
 * Victory points counted in halves, so Merit's half-point stays an integer.
 * Everything else is worth an even number of halves; only Merit is odd.
 *
 * This is the single source of truth for scoring — `victoryPoints` divides it
 * for display, and the win check compares it against `vpTarget * 2`. Keep the
 * comparison in one place (engine's `reduce`) rather than inlining it.
 */
export function victoryPointHalves(
  player: Player,
  largestArmy: PlayerId | null = null,
  longestRoad: PlayerId | null = null,
): number {
  const cards = player.devCards.filter((c) => c.kind === 'victory').length
  const merits = player.devCards.filter((c) => c.kind === 'merit').length
  return (
    player.settlements.length * 2 +
    player.cities.length * 4 +
    cards * 2 +
    merits +
    (largestArmy === player.id ? 4 : 0) +
    (longestRoad === player.id ? 4 : 0)
  )
}

/** Points as shown to players — a whole number, or a `.5` when Merit is held. */
export function victoryPoints(
  player: Player,
  largestArmy: PlayerId | null = null,
  longestRoad: PlayerId | null = null,
): number {
  return victoryPointHalves(player, largestArmy, longestRoad) / 2
}

/** Scores render as "7" or "7.5" — never "7.0". */
export function formatVP(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}

export interface ScoreBreakdown {
  settlements: number
  settlementPoints: number
  cities: number
  cityPoints: number
  devCardPoints: number
  /** Merit cards held; each is worth half a point, so this line can read "1.5". */
  meritCards: number
  meritPoints: number
  largestArmy: boolean
  longestRoad: boolean
  total: number
}

/** Per-player point-by-point tally, for the end-game "how did we get here" view. */
export function scoreBreakdown(
  player: Player,
  largestArmy: PlayerId | null = null,
  longestRoad: PlayerId | null = null,
): ScoreBreakdown {
  const devCardPoints = player.devCards.filter((c) => c.kind === 'victory').length
  const meritCards = player.devCards.filter((c) => c.kind === 'merit').length
  const hasLargestArmy = largestArmy === player.id
  const hasLongestRoad = longestRoad === player.id
  return {
    settlements: player.settlements.length,
    settlementPoints: player.settlements.length,
    cities: player.cities.length,
    cityPoints: player.cities.length * 2,
    devCardPoints,
    meritCards,
    meritPoints: meritCards / 2,
    largestArmy: hasLargestArmy,
    longestRoad: hasLongestRoad,
    total: victoryPoints(player, largestArmy, longestRoad),
  }
}
