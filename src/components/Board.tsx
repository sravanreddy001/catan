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
  onVertex: (id: string) => void
  onEdge: (id: string) => void
  onTile: (id: string) => void
}

/** 6 and 8 are the highest-probability numbers and are printed in red. */
function numberColor(n: number): string {
  return n === 6 || n === 8 ? '#b3261e' : '#3b3226'
}

/** Probability pips: one dot per way the number can be rolled (1-5). */
function pipCount(n: number): number {
  return 6 - Math.abs(7 - n)
}

export default function Board({
  board,
  players,
  robberTile,
  vertexTargets,
  edgeTargets,
  tileTargets,
  onVertex,
  onEdge,
  onTile,
}: Props) {
  const { minX, minY, width, height } = board.bounds

  const ownerOfVertex = (id: string) =>
    players.find((p) => p.settlements.includes(id) || p.cities.includes(id))
  const ownerOfEdge = (id: string) => players.find((p) => p.roads.includes(id))

  return (
    <svg
      className="board"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
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
              className={`tile${tileTargets ? ' tile--target' : ''}`}
              onClick={tileTargets ? () => onTile(t.id) : undefined}
            >
              <polygon points={points} fill={TILE_FILL[t.type]} stroke="#0f2a3d" strokeWidth={2} />
              <text className="tile__icon" x={t.cx} y={t.cy - 20} textAnchor="middle">
                {TILE_ICON[t.type]}
              </text>
              {t.number !== undefined && (
                <g>
                  <circle cx={t.cx} cy={t.cy + 12} r={17} fill="#f4ead6" stroke="#0f2a3d" />
                  <text
                    className="tile__number"
                    x={t.cx}
                    y={t.cy + 15}
                    textAnchor="middle"
                    fill={numberColor(t.number)}
                  >
                    {t.number}
                  </text>
                  {/* Drawn as circles rather than text: bullet glyphs got
                      clipped at five pips. */}
                  {Array.from({ length: pipCount(t.number) }, (_, i) => (
                    <circle
                      key={i}
                      cx={t.cx + (i - (pipCount(t.number!) - 1) / 2) * 4.5}
                      cy={t.cy + 24}
                      r={1.6}
                      fill={numberColor(t.number!)}
                    />
                  ))}
                </g>
              )}
              {robberTile === t.id && (
                <text className="tile__robber" x={t.cx} y={t.cy + 4} textAnchor="middle">
                  🕵️
                </text>
              )}
            </g>
          )
        })}
      </g>

      {/* Harbours: marker out at sea, with two lines back to the coastal corners. */}
      <g>
        {board.ports.map((p) => {
          const [va, vb] = p.vertices.map((id) => board.vertices.find((v) => v.id === id)!)
          return (
            <g key={p.id} className="port">
              <line x1={p.x} y1={p.y} x2={va.x} y2={va.y} stroke="#c8a35b" strokeWidth={3} />
              <line x1={p.x} y1={p.y} x2={vb.x} y2={vb.y} stroke="#c8a35b" strokeWidth={3} />
              <circle cx={p.x} cy={p.y} r={20} fill="#0e3350" stroke="#c8a35b" strokeWidth={3} />
              <text className="port__ratio" x={p.x} y={p.y - 3} textAnchor="middle">
                {p.type === 'any' ? '3:1' : '2:1'}
              </text>
              {p.type !== 'any' && (
                <text className="port__icon" x={p.x} y={p.y + 12} textAnchor="middle">
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
            <g key={e.id}>
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
              {/* Invisible fat stroke: a 9px line is far too thin to tap on a phone. */}
              {target && (
                <line
                  className="road__hit"
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke="transparent"
                  strokeWidth={30}
                  strokeLinecap="round"
                  onClick={() => onEdge(e.id)}
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
              <g key={v.id}>
                <circle className="spot spot--target" cx={v.x} cy={v.y} r={11} />
                <circle
                  className="spot__hit"
                  cx={v.x}
                  cy={v.y}
                  r={24}
                  fill="transparent"
                  onClick={() => onVertex(v.id)}
                />
              </g>
            )
          }
          return (
            <g
              key={v.id}
              className={target ? 'piece piece--target' : 'piece'}
              onClick={target ? () => onVertex(v.id) : undefined}
            >
              {isCity ? (
                <rect
                  x={v.x - 13}
                  y={v.y - 11}
                  width={26}
                  height={22}
                  rx={4}
                  fill={owner.color}
                  stroke={owner.dark}
                  strokeWidth={3}
                />
              ) : (
                <circle
                  cx={v.x}
                  cy={v.y}
                  r={11}
                  fill={owner.color}
                  stroke={owner.dark}
                  strokeWidth={3}
                />
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
