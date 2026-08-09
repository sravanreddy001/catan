// Board geometry + static setup for a standard 4-player Catan board.
// Pointy-top hexes on axial coordinates. Vertices and edges are derived from
// hex corners and de-duplicated by rounded pixel position, so neighbouring
// tiles share the same vertex/edge ids.

export type Resource = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore'
export type TileType = Resource | 'desert'

export interface Tile {
  id: string
  q: number
  r: number
  type: TileType
  /** Dice number, absent on the desert. */
  number?: number
  cx: number
  cy: number
}

export interface Vertex {
  id: string
  x: number
  y: number
}

export interface Edge {
  id: string
  a: string // vertex id
  b: string // vertex id
  x1: number
  y1: number
  x2: number
  y2: number
}

export const HEX_SIZE = 56
const SQRT3 = Math.sqrt(3)

/**
 * Rings of hexes around the centre. 2 gives the standard 19-tile board (rows
 * of 3-4-5-4-3, the exact layout this file used to hardcode); 3 gives the
 * 37-tile board the 5-8 player game needs. Anything else follows the same
 * rule, so board size is one number rather than a new coordinate table.
 */
export function ringCoords(rings: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let r = -rings; r <= rings; r++) {
    for (let q = Math.max(-rings, -rings - r); q <= Math.min(rings, rings - r); q++) {
      out.push([q, r])
    }
  }
  return out
}

/** Rings for a given player count: 5 or more need the wider board. */
export function ringsForPlayers(playerCount: number): number {
  return playerCount > 4 ? 3 : 2
}

/**
 * The standard 4:4:4:3:3 lumber/wool/grain/brick/ore mix with one desert per
 * 19 tiles, scaled to any tile count. Reproduces the standard board exactly at
 * 19 tiles; larger boards keep the same ratios rather than inventing a mix.
 */
export function tileDistribution(count: number): TileType[] {
  const deserts = Math.max(1, Math.round(count / 19))
  const resourceCount = count - deserts
  const weights: Array<[Resource, number]> = [
    ['lumber', 4],
    ['wool', 4],
    ['grain', 4],
    ['brick', 3],
    ['ore', 3],
  ]
  const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0)

  const out: TileType[] = []
  for (const [res, w] of weights) {
    for (let i = 0; i < Math.floor((resourceCount * w) / totalWeight); i++) out.push(res)
  }
  // Rounding down above can leave a few tiles unassigned; hand those out in
  // weight order so the shortfall lands on the commonest resources first.
  let i = 0
  while (out.length < resourceCount) out.push(weights[i++ % weights.length][0])
  for (let d = 0; d < deserts; d++) out.push('desert')
  return out
}

/** Standard number tokens (no 7), for the 18 numbered tiles of a 19-tile board. */
const NUMBER_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11]

/**
 * Enough tokens for `count` numbered tiles, keeping the standard board's
 * frequency curve: one 2 and one 12 per 18 tiles, two of everything else.
 */
export function numberTokens(count: number): number[] {
  if (count === NUMBER_TOKENS.length) return NUMBER_TOKENS.slice()
  const out: number[] = []
  const middles = [3, 4, 5, 6, 8, 9, 10, 11]
  while (out.length < count) {
    out.push(2)
    for (const n of middles) {
      if (out.length < count) out.push(n)
      if (out.length < count) out.push(n)
    }
    if (out.length < count) out.push(12)
  }
  return out.slice(0, count)
}

/** Axial neighbours of a hex, in the same pointy-top frame as `hexCenter`. */
const HEX_NEIGHBOURS: Array<[number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

/**
 * Deal numbers onto tiles without putting two red numbers (6 or 8) side by
 * side — the constraint the hardcoded token order used to satisfy by hand.
 * Swap-based rather than reshuffle-based so it always terminates: a clash
 * swaps with a random safe tile, and after a bounded number of passes any
 * remaining clash is accepted instead of looping forever.
 */
function placeNumbers(
  coords: Array<[number, number]>,
  types: TileType[],
  rand: () => number,
): Array<number | undefined> {
  const numbered = coords.map((_, i) => i).filter((i) => types[i] !== 'desert')
  const tokens = shuffle(numberTokens(numbered.length), rand)
  const assigned: Array<number | undefined> = coords.map(() => undefined)
  numbered.forEach((tileIndex, n) => (assigned[tileIndex] = tokens[n]))

  const indexOf = new Map(coords.map(([q, r], i) => [`${q},${r}`, i]))
  const isRed = (n: number | undefined) => n === 6 || n === 8
  const neighbours = (i: number) =>
    HEX_NEIGHBOURS.map(([dq, dr]) => indexOf.get(`${coords[i][0] + dq},${coords[i][1] + dr}`)).filter(
      (x): x is number => x !== undefined,
    )

  for (let pass = 0; pass < 12; pass++) {
    let clashes = 0
    for (const i of numbered) {
      if (!isRed(assigned[i])) continue
      if (!neighbours(i).some((j) => isRed(assigned[j]))) continue
      clashes++
      const swappable = numbered.filter(
        (j) => !isRed(assigned[j]) && !neighbours(j).some((k) => isRed(assigned[k])),
      )
      if (swappable.length === 0) break
      const j = swappable[Math.floor(rand() * swappable.length)]
      ;[assigned[i], assigned[j]] = [assigned[j], assigned[i]]
    }
    if (clashes === 0) break
  }
  return assigned
}

export function hexCenter(q: number, r: number): { cx: number; cy: number } {
  return {
    cx: HEX_SIZE * SQRT3 * (q + r / 2),
    cy: HEX_SIZE * 1.5 * r,
  }
}

export function hexCorners(cx: number, cy: number): Array<[number, number]> {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30)
    return [cx + HEX_SIZE * Math.cos(angle), cy + HEX_SIZE * Math.sin(angle)] as [number, number]
  })
}

function key(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A harbour: 2:1 for one resource, or 3:1 for any ('any'). */
export interface Port {
  id: string
  type: Resource | 'any'
  /** The two coastal vertices that grant access to this port. */
  vertices: [string, string]
  /** Marker position, pushed out to sea from the coast edge. */
  x: number
  y: number
}

export interface Board {
  tiles: Tile[]
  vertices: Vertex[]
  edges: Edge[]
  ports: Port[]
  /** Vertex ids touching each tile. */
  tileVertices: Record<string, string[]>
  /** Tile ids touching each vertex — drives resource production. */
  vertexTiles: Record<string, string[]>
  bounds: { minX: number; minY: number; width: number; height: number }
}

/** Standard harbour mix: four 3:1 and one 2:1 per resource. */
const PORT_TYPES: Array<Resource | 'any'> = [
  'any', 'any', 'any', 'any',
  'brick', 'lumber', 'wool', 'grain', 'ore',
]

/**
 * Coastal edges (those belonging to exactly one tile) form a ring of 30 on the
 * standard board. Harbours are spread evenly right around that ring — fixed
 * skip counts leave a bare stretch wherever they fail to sum to the ring size.
 */
function buildPorts(
  edges: Edge[],
  edgeTileCount: Map<string, number>,
  rand: () => number,
): Port[] {
  const coastal = edges
    .filter((e) => edgeTileCount.get(e.id) === 1)
    .map((e) => ({ e, angle: Math.atan2((e.y1 + e.y2) / 2, (e.x1 + e.x2) / 2) }))
    .sort((a, b) => a.angle - b.angle)
    .map((x) => x.e)

  // One harbour per ~3.3 coastal edges — the standard board's density (9 ports
  // around 30 edges). A wider board repeats the same mix rather than leaving
  // the extra coastline bare, which would make ports a lottery of who spawned
  // near the old ring.
  const wanted = Math.max(PORT_TYPES.length, Math.round(coastal.length / (30 / PORT_TYPES.length)))
  const pool: Array<Resource | 'any'> = []
  while (pool.length < wanted) pool.push(...PORT_TYPES)
  const types = shuffle(pool, rand).slice(0, wanted)
  const step = coastal.length / types.length
  const offset = Math.floor(rand() * coastal.length)

  const ports: Port[] = []
  for (let i = 0; i < types.length; i++) {
    const e = coastal[(offset + Math.round(i * step)) % coastal.length]
    const mx = (e.x1 + e.x2) / 2
    const my = (e.y1 + e.y2) / 2
    const len = Math.hypot(mx, my) || 1
    ports.push({
      id: `p${i}`,
      type: types[i],
      vertices: [e.a, e.b],
      x: mx + (mx / len) * HEX_SIZE * 0.55,
      y: my + (my / len) * HEX_SIZE * 0.55,
    })
  }
  return ports
}

export function createBoard(rand: () => number = Math.random, rings = 2): Board {
  const coords = ringCoords(rings)
  const types = shuffle(tileDistribution(coords.length), rand)
  const numbers = placeNumbers(coords, types, rand)

  const tiles: Tile[] = coords.map(([q, r], i) => {
    const { cx, cy } = hexCenter(q, r)
    return {
      id: `t${q},${r}`,
      q,
      r,
      type: types[i],
      number: numbers[i],
      cx,
      cy,
    }
  })

  const vertexByKey = new Map<string, Vertex>()
  const edgeByKey = new Map<string, Edge>()
  const tileVertices: Record<string, string[]> = {}
  const vertexTiles: Record<string, string[]> = {}
  const edgeTileCount = new Map<string, number>()

  for (const tile of tiles) {
    const corners = hexCorners(tile.cx, tile.cy)
    const ids: string[] = []

    for (const [x, y] of corners) {
      const k = key(x, y)
      if (!vertexByKey.has(k)) vertexByKey.set(k, { id: k, x, y })
      ids.push(k)
      ;(vertexTiles[k] ??= []).push(tile.id)
    }
    tileVertices[tile.id] = ids

    for (let i = 0; i < 6; i++) {
      const a = ids[i]
      const b = ids[(i + 1) % 6]
      const ek = [a, b].sort().join('|')
      edgeTileCount.set(ek, (edgeTileCount.get(ek) ?? 0) + 1)
      if (!edgeByKey.has(ek)) {
        const va = vertexByKey.get(a)!
        const vb = vertexByKey.get(b)!
        edgeByKey.set(ek, { id: ek, a, b, x1: va.x, y1: va.y, x2: vb.x, y2: vb.y })
      }
    }
  }

  const vertices = [...vertexByKey.values()]
  const edges = [...edgeByKey.values()]
  const ports = buildPorts(edges, edgeTileCount, rand)
  /*
   * The frame is measured from what is actually painted, not from a fixed pad
   * around the hexes. A flat pad has to be generous enough for the harbour
   * markers in the worst direction, which leaves dead sea on every other side —
   * and because the board is an SVG with a viewBox, that dead space scales the
   * number tokens down along with it. Ports are the outermost thing drawn: a
   * circle of r=27 with a 3.5-wide stroke straddling its edge.
   */
  const portReach = 27 + 3.5 / 2
  const xs = [
    ...vertices.map((v) => v.x),
    ...ports.flatMap((p) => [p.x - portReach, p.x + portReach]),
  ]
  const ys = [
    ...vertices.map((v) => v.y),
    ...ports.flatMap((p) => [p.y - portReach, p.y + portReach]),
  ]
  const contentW = Math.max(...xs) - Math.min(...xs)
  const contentH = Math.max(...ys) - Math.min(...ys)
  /** A deliberate frame, not padding: reads as sea rather than as waste. */
  const MARGIN = 0.03
  const minX = Math.min(...xs) - contentW * MARGIN
  const minY = Math.min(...ys) - contentH * MARGIN
  const bounds = {
    minX,
    minY,
    width: contentW * (1 + MARGIN * 2),
    height: contentH * (1 + MARGIN * 2),
  }

  return { tiles, vertices, edges, ports, tileVertices, vertexTiles, bounds }
}

/**
 * Best trade rate per resource for a player: 2 with the matching harbour,
 * 3 with a generic harbour, otherwise the bank's 4:1.
 */
export function tradeRates(
  board: Board,
  ownedVertices: string[],
): Record<Resource, number> {
  const rates: Record<Resource, number> = { brick: 4, lumber: 4, wool: 4, grain: 4, ore: 4 }
  const owned = new Set(ownedVertices)
  for (const port of board.ports) {
    if (!port.vertices.some((v) => owned.has(v))) continue
    if (port.type === 'any') {
      for (const r of Object.keys(rates) as Resource[]) rates[r] = Math.min(rates[r], 3)
    } else {
      rates[port.type] = Math.min(rates[port.type], 2)
    }
  }
  return rates
}

/** Vertices are adjacent if an edge joins them — used for the distance rule. */
export function vertexNeighbours(board: Board, vertexId: string): string[] {
  const out: string[] = []
  for (const e of board.edges) {
    if (e.a === vertexId) out.push(e.b)
    else if (e.b === vertexId) out.push(e.a)
  }
  return out
}

/**
 * Longest chain of a player's own roads without reusing an edge. An
 * opponent's settlement/city breaks the road: the path may still touch that
 * vertex, but cannot continue through it into more of the player's edges.
 */
export function longestRoadLength(
  board: Board,
  roadEdgeIds: string[],
  blockedVertices: Set<string>,
): number {
  if (roadEdgeIds.length === 0) return 0
  const owned = new Set(roadEdgeIds)
  const adjacency = new Map<string, Array<{ to: string; edge: string }>>()
  for (const e of board.edges) {
    if (!owned.has(e.id)) continue
    ;(adjacency.get(e.a) ?? adjacency.set(e.a, []).get(e.a)!).push({ to: e.b, edge: e.id })
    ;(adjacency.get(e.b) ?? adjacency.set(e.b, []).get(e.b)!).push({ to: e.a, edge: e.id })
  }

  let best = 0
  const visited = new Set<string>()
  const walk = (vertex: string, length: number) => {
    best = Math.max(best, length)
    if (blockedVertices.has(vertex) && length > 0) return
    for (const { to, edge } of adjacency.get(vertex) ?? []) {
      if (visited.has(edge)) continue
      visited.add(edge)
      walk(to, length + 1)
      visited.delete(edge)
    }
  }
  for (const v of adjacency.keys()) walk(v, 0)
  return best
}
