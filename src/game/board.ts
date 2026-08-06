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

/** Axial coords of the 19 tiles, rows of 3-4-5-4-3. */
const TILE_COORDS: Array<[number, number]> = [
  [0, -2], [1, -2], [2, -2],
  [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1],
  [-2, 2], [-1, 2], [0, 2],
]

/** Standard tile distribution. */
const TILE_TYPES: TileType[] = [
  ...Array<TileType>(4).fill('lumber'),
  ...Array<TileType>(4).fill('wool'),
  ...Array<TileType>(4).fill('grain'),
  ...Array<TileType>(3).fill('brick'),
  ...Array<TileType>(3).fill('ore'),
  'desert',
]

/** Standard number tokens (no 7). Placed on non-desert tiles. */
const NUMBER_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11]

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

  const types = shuffle(PORT_TYPES, rand)
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

export function createBoard(rand: () => number = Math.random): Board {
  const types = shuffle(TILE_TYPES, rand)
  const numbers = NUMBER_TOKENS.slice()
  let numberIndex = 0

  const tiles: Tile[] = TILE_COORDS.map(([q, r], i) => {
    const { cx, cy } = hexCenter(q, r)
    const type = types[i]
    return {
      id: `t${q},${r}`,
      q,
      r,
      type,
      number: type === 'desert' ? undefined : numbers[numberIndex++],
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
  const pad = HEX_SIZE * 1.3
  const xs = vertices.map((v) => v.x)
  const ys = vertices.map((v) => v.y)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const bounds = {
    minX,
    minY,
    width: Math.max(...xs) + pad - minX,
    height: Math.max(...ys) + pad - minY,
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
