import { hexCorners, type Board as BoardData, type TileType } from '../game/board'
import type { Player } from '../game/players'

const TILE_FILL: Record<TileType, string> = {
  lumber: '#2f6b3a',
  brick: '#b0563a',
  wool: '#8dbc5c',
  grain: '#e2ba34',
  ore: '#7a8794',
  desert: '#dcc79a',
}

const TILE_ICON: Record<TileType, string> = {
  lumber: '🌲',
  brick: '🧱',
  wool: '🐑',
  grain: '🌾',
  ore: '⛰️',
  desert: '🏜️',
}

interface Props {
  board: BoardData
  players: Player[]
  robberTile: string
  /** Vertex ids the current action may target. */
  vertexTargets: Set<string>
  /** Edge ids the current action may target. */
  edgeTargets: Set<string>
  tileTargets: boolean
  /** Sum of the last roll — tiles with this number stay lit until the next turn. */
  rolledSum: number | null
  /** Santa mode: no robber piece is drawn. */
  santaMode: boolean
  onVertex: (id: string) => void
  onEdge: (id: string) => void
  onTile: (id: string) => void
}

/** Piece silhouettes, drawn around the vertex at the origin. */
const SETTLEMENT_SHAPE = '-8,7 -8,-2 0,-10 8,-2 8,7'
const CITY_SHAPE = '-13,8 -13,-1 -6,-8 1,-1 1,-5 7,-12 13,-5 13,8'

/** 6 and 8 are the highest-probability numbers and are printed in red. */
function numberColor(n: number): string {
  return n === 6 || n === 8 ? '#b3261e' : '#3b3226'
}

/** Probability pips: one dot per way the number can be rolled (1-5). */
function pipCount(n: number): number {
  return 6 - Math.abs(7 - n)
}

/** The local player is seated under the name "You", so "You's road" needs care. */
function possessive(name: string): string {
  return name === 'You' ? 'Your' : `${name}'s`
}

/** Spoken tile names. The visible label is an emoji, which reads as nothing. */
const TILE_NAME: Record<TileType, string> = {
  lumber: 'Forest',
  brick: 'Hills',
  wool: 'Pasture',
  grain: 'Fields',
  ore: 'Mountains',
  desert: 'Desert',
}

export default function Board({
  board,
  players,
  robberTile,
  vertexTargets,
  edgeTargets,
  tileTargets,
  rolledSum,
  santaMode,
  onVertex,
  onEdge,
  onTile,
}: Props) {
  const { minX, minY, width, height } = board.bounds

  const ownerOfVertex = (id: string) =>
    players.find((p) => p.settlements.includes(id) || p.cities.includes(id))
  const ownerOfEdge = (id: string) => players.find((p) => p.roads.includes(id))

  // role="group", not "img": img collapses every child, which hid all 19
  // tiles, 54 vertices and every road behind the single string "Catan board".
  // Labels below are aria-label rather than <title> so nothing gains a hover
  // tooltip.
  return (
    <svg
      className="board"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="group"
      aria-label="Catan board"
    >
      <g>
        {board.tiles.map((t) => {
          const points = hexCorners(t.cx, t.cy)
            .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
            .join(' ')
          return (
            <g
              key={t.id}
              className={`tile${tileTargets ? ' tile--target' : ''}${
                t.number === rolledSum ? ' tile--rolled' : ''
              }`}
              onClick={tileTargets ? () => onTile(t.id) : undefined}
              role={tileTargets ? 'button' : 'img'}
              aria-label={[
                TILE_NAME[t.type],
                t.number === undefined ? null : `rolls on ${t.number}`,
                t.number === undefined ? null : `${pipCount(t.number)} of 36`,
                t.id === robberTile && !santaMode ? 'blocked by the robber' : null,
                tileTargets ? 'move the robber here' : null,
              ]
                .filter(Boolean)
                .join(', ')}
            >
              <polygon points={points} fill={TILE_FILL[t.type]} stroke="#0f2a3d" strokeWidth={2} />
              <text className="tile__icon" x={t.cx} y={t.cy - 20} textAnchor="middle">
                {santaMode && t.type === 'desert' ? '🏔️' : TILE_ICON[t.type]}
              </text>
              {t.number !== undefined && (
                <g>
                  <circle cx={t.cx} cy={t.cy + 13} r={21} fill="#f4ead6" stroke="#0f2a3d" strokeWidth={2} />
                  {(t.number === 6 || t.number === 8) && (
                    <circle
                      cx={t.cx}
                      cy={t.cy + 13}
                      r={18}
                      fill="none"
                      stroke="#b3261e"
                      strokeWidth={1.5}
                    />
                  )}
                  <text
                    className="tile__number"
                    x={t.cx}
                    y={t.cy + 16}
                    textAnchor="middle"
                    fill={numberColor(t.number)}
                  >
                    {t.number}
                  </text>
                  {/* Probability pips: enlarged and spaced for legibility without relying on color */}
                  {Array.from({ length: pipCount(t.number) }, (_, i) => (
                    <circle
                      key={i}
                      cx={t.cx + (i - (pipCount(t.number!) - 1) / 2) * 8.5}
                      cy={t.cy + 26}
                      r={3.8}
                      fill={numberColor(t.number!)}
                    />
                  ))}
                </g>
              )}
            </g>
          )
        })}
      </g>

      {/* Robber: drawn on its own layer above the tiles so it is never buried
          by a number token, and as a dark token so it reads as a piece.
          Not rendered in Santa mode. */}
      {!santaMode && (() => {
        const tile = board.tiles.find((t) => t.id === robberTile)
        if (!tile) return null
        return (
          /* aria-hidden: the blocked tile already says so in its own label. */
          <g className="robber" pointerEvents="none" aria-hidden="true">
            <circle
              cx={tile.cx - 22}
              cy={tile.cy - 14}
              r={18}
              fill="#1a1a1f"
              stroke="#f4ead6"
              strokeWidth={3}
            />
            <text className="tile__robber" x={tile.cx - 22} y={tile.cy - 6} textAnchor="middle">
              🥷
            </text>
          </g>
        )
      })()}

      {/* Harbours: marker out at sea, with two lines back to the coastal corners. */}
      <g>
        {board.ports.map((p) => {
          const [va, vb] = p.vertices.map((id) => board.vertices.find((v) => v.id === id)!)
          return (
            <g
              key={p.id}
              className="port"
              role="img"
              aria-label={
                p.type === 'any'
                  ? 'Harbour, trade any 3 resources for 1'
                  : `Harbour, trade 2 ${p.type} for any 1`
              }
            >
              <line x1={p.x} y1={p.y} x2={va.x} y2={va.y} stroke="#c8a35b" strokeWidth={3} />
              <line x1={p.x} y1={p.y} x2={vb.x} y2={vb.y} stroke="#c8a35b" strokeWidth={3} />
              <circle cx={p.x} cy={p.y} r={27} fill="#0e3350" stroke="#c8a35b" strokeWidth={3.5} />
              <text className="port__ratio" x={p.x} y={p.y - 4} textAnchor="middle">
                {p.type === 'any' ? '3:1' : '2:1'}
              </text>
              {p.type !== 'any' && (
                <text className="port__icon" x={p.x} y={p.y + 16} textAnchor="middle">
                  {TILE_ICON[p.type]}
                </text>
              )}
            </g>
          )
        })}
      </g>

      {/* Roads sit under settlements so corners stay readable. */}
      <g>
        {board.edges.map((e) => {
          const owner = ownerOfEdge(e.id)
          const target = edgeTargets.has(e.id)
          if (!owner && !target) return null
          return (
            <g key={e.id} role="img" aria-label={owner ? `${possessive(owner.name)} road` : 'Empty road slot'}>
              {/* Dark casing under the colour so roads read against any tile. */}
              {owner && (
                <line
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke="#0c1a24"
                  strokeWidth={17}
                  strokeLinecap="round"
                />
              )}
              <line
                className={owner ? 'road' : 'road road--target'}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={owner ? owner.color : '#ffffff'}
                strokeWidth={owner ? 11 : 9}
                strokeLinecap="round"
              />
              {/* Invisible fat stroke: a generous hit area for effortless tapping on phones and desktop. */}
              {target && (
                <line
                  className="road__hit"
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke="transparent"
                  strokeWidth={38}
                  strokeLinecap="round"
                  onClick={() => onEdge(e.id)}
                  role="button"
                  aria-label="Empty road slot — build here"
                />
              )}
            </g>
          )
        })}
      </g>

      <g>
        {board.vertices.map((v) => {
          const owner = ownerOfVertex(v.id)
          const isCity = owner?.cities.includes(v.id)
          const target = vertexTargets.has(v.id)
          if (!owner && !target) return null
          if (!owner) {
            return (
              <g key={v.id} className="spot-target-group">
                <circle className="spot__hit-ring" cx={v.x} cy={v.y} r={30} />
                <circle className="spot spot--target" cx={v.x} cy={v.y} r={16} />
                <circle
                  className="spot__hit"
                  cx={v.x}
                  cy={v.y}
                  r={30}
                  fill="transparent"
                  onClick={() => onVertex(v.id)}
                  role="button"
                  aria-label="Empty spot — build here"
                />
              </g>
            )
          }
          return (
            <g
              key={v.id}
              className={target ? 'piece piece--target' : 'piece'}
              onClick={target ? () => onVertex(v.id) : undefined}
              role={target ? 'button' : 'img'}
              aria-label={`${possessive(owner.name)} ${isCity ? 'city' : 'settlement'}${
                target ? ' — upgrade to a city' : ''
              }`}
            >
              {/* Upgrade targets get the same gold ring an empty build spot
                  gets, plus a generous transparent hit circle — otherwise
                  picking "City" lit nothing and you had to guess which of your
                  settlements was clickable. */}
              {target && (
                <>
                  <circle className="piece__halo" cx={v.x} cy={v.y} r={24} />
                  <circle className="piece__hit" cx={v.x} cy={v.y} r={30} fill="transparent" />
                </>
              )}
              {/* Settlement reads as a small house, city as a larger house with
                  an adjoining block, so the two differ in silhouette and size
                  rather than colour alone. */}
              <polygon
                points={isCity ? CITY_SHAPE : SETTLEMENT_SHAPE}
                transform={`translate(${v.x} ${v.y})`}
                fill={owner.color}
                stroke={owner.dark}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {isCity && (
                <rect
                  x={v.x - 9}
                  y={v.y + 1}
                  width={5}
                  height={5}
                  fill={owner.dark}
                  opacity={0.6}
                />
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
