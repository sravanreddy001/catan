import { useMemo, useState } from 'react'
import './styles.css'
import BoardView from './components/Board'
import { ActionBar, Dice, HandBar, PlayerStrip, TradeBar } from './components/Hud'
import { createBoard, tradeRates, vertexNeighbours, type Board, type Resource } from './game/board'
import {
  canAfford,
  createPlayers,
  pay,
  victoryPoints,
  type BuildKind,
  type Player,
} from './game/players'

type Mode = BuildKind | 'robber' | null
type Phase = 'setup' | 'play'

/** Snake order for the opening placements: 0,1,2,3,3,2,1,0. */
const SETUP_ORDER = [0, 1, 2, 3, 3, 2, 1, 0]

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

export default function App() {
  const [board, setBoard] = useState<Board>(() => createBoard())
  const [players, setPlayers] = useState<Player[]>(createPlayers)
  const [phase, setPhase] = useState<Phase>('setup')
  const [setupIndex, setSetupIndex] = useState(0)
  /** During setup a settlement must be followed by a road from that corner. */
  const [pendingRoadFrom, setPendingRoadFrom] = useState<string | null>(null)
  const [turn, setTurn] = useState(0)
  const [mode, setMode] = useState<Mode>(null)
  const [dice, setDice] = useState<[number, number] | null>(null)
  const [rolling, setRolling] = useState(false)
  const [hasRolled, setHasRolled] = useState(false)
  const [robberTile, setRobberTile] = useState(
    () => board.tiles.find((t) => t.type === 'desert')?.id ?? board.tiles[0].id,
  )
  const [message, setMessage] = useState('Place your first settlement.')

  const currentId = phase === 'setup' ? SETUP_ORDER[setupIndex] : turn
  const current = players[currentId]
  const rates = useMemo(
    () => tradeRates(board, [...current.settlements, ...current.cities]),
    [board, current],
  )

  const vertexTargets = useMemo(() => {
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
  }, [board, players, phase, pendingRoadFrom, mode, current])

  const edgeTargets = useMemo(() => {
    const targets = new Set<string>()
    const used = takenEdges(players)

    if (phase === 'setup') {
      if (!pendingRoadFrom) return targets
      board.edges.forEach((e) => {
        if (!used.has(e.id) && (e.a === pendingRoadFrom || e.b === pendingRoadFrom))
          targets.add(e.id)
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
  }, [board, players, phase, pendingRoadFrom, mode, current])

  function updateCurrent(fn: (p: Player) => Player) {
    setPlayers((prev) => prev.map((p) => (p.id === currentId ? fn(p) : p)))
  }

  function handleVertex(id: string) {
    if (phase === 'setup') {
      // The second settlement each player places pays out its adjacent tiles.
      const secondRound = setupIndex >= players.length
      const starting = secondRound
        ? (board.vertexTiles[id] ?? [])
            .map((tid) => board.tiles.find((t) => t.id === tid)!)
            .filter((t) => t.type !== 'desert')
            .map((t) => t.type as Resource)
        : []
      updateCurrent((p) => {
        const hand = { ...p.hand }
        starting.forEach((res) => (hand[res] += 1))
        return { ...p, hand, settlements: [...p.settlements, id] }
      })
      setPendingRoadFrom(id)
      setMessage('Now place a road touching that settlement.')
      return
    }
    if (mode === 'settlement') {
      updateCurrent((p) => ({ ...pay(p, 'settlement'), settlements: [...p.settlements, id] }))
    } else if (mode === 'city') {
      updateCurrent((p) => ({
        ...pay(p, 'city'),
        settlements: p.settlements.filter((v) => v !== id),
        cities: [...p.cities, id],
      }))
    }
    setMode(null)
  }

  function handleEdge(id: string) {
    if (phase === 'setup') {
      updateCurrent((p) => ({ ...p, roads: [...p.roads, id] }))
      setPendingRoadFrom(null)
      advanceSetup()
      return
    }
    updateCurrent((p) => ({ ...pay(p, 'road'), roads: [...p.roads, id] }))
    setMode(null)
  }

  function handleTile(id: string) {
    if (mode !== 'robber' || id === robberTile) return
    setRobberTile(id)
    setMode(null)
    stealFrom(id)
  }

  function advanceSetup() {
    const next = setupIndex + 1
    if (next >= SETUP_ORDER.length) {
      setPhase('play')
      setTurn(0)
      setMessage('Setup done — Red to roll.')
    } else {
      setSetupIndex(next)
      setMessage(`${players[SETUP_ORDER[next]].name}: place a settlement.`)
    }
  }

  function roll() {
    setRolling(true)
    setMode(null)
    window.setTimeout(() => {
      const a = 1 + Math.floor(Math.random() * 6)
      const b = 1 + Math.floor(Math.random() * 6)
      setDice([a, b])
      setRolling(false)
      setHasRolled(true)
      if (a + b === 7) {
        discardHalf()
        setMode('robber')
        setMessage('Rolled 7 — hands over 7 discarded half. Move the robber.')
      } else {
        produce(a + b)
      }
    }, 450)
  }

  /**
   * Pay every owner of a corner touching a tile with the rolled number.
   * Cities pay double; the robbed tile pays nothing.
   */
  function produce(sum: number) {
    const producing = board.tiles.filter(
      (t) => t.number === sum && t.type !== 'desert' && t.id !== robberTile,
    )
    // Gains are computed up front, not inside the state updater: the updater is
    // deferred (and re-run under StrictMode), so side effects there are unsafe.
    const gains: Record<number, Partial<Record<Resource, number>>> = {}
    for (const p of players) {
      for (const tile of producing) {
        const res = tile.type as Resource
        for (const v of board.tileVertices[tile.id]) {
          const n = p.cities.includes(v) ? 2 : p.settlements.includes(v) ? 1 : 0
          if (!n) continue
          gains[p.id] = { ...gains[p.id], [res]: (gains[p.id]?.[res] ?? 0) + n }
        }
      }
    }

    setPlayers((prev) =>
      prev.map((p) => {
        const gain = gains[p.id]
        if (!gain) return p
        const hand = { ...p.hand }
        for (const [res, n] of Object.entries(gain)) hand[res as Resource] += n
        return { ...p, hand }
      }),
    )

    const mine = gains[currentId]
    const summary = mine
      ? Object.entries(mine)
          .map(([res, n]) => `+${n} ${res}`)
          .join(', ')
      : 'nothing for you'
    setMessage(`Rolled ${sum} — ${summary}.`)
  }

  /** Standard rule: on a 7, anyone holding more than 7 cards loses half. */
  function discardHalf() {
    setPlayers((prev) =>
      prev.map((p) => {
        if (handSize(p) <= 7) return p
        const cards = handCards(p)
        const hand = { ...p.hand }
        for (let i = 0; i < Math.floor(cards.length / 2); i++) {
          const options = handCards({ ...p, hand })
          hand[pick(options)] -= 1
        }
        return { ...p, hand }
      }),
    )
  }

  /** Take one random card from a random opponent on the robbed tile. */
  function stealFrom(tileId: string) {
    const corners = new Set(board.tileVertices[tileId])
    const victims = players.filter(
      (p) =>
        p.id !== currentId &&
        handSize(p) > 0 &&
        [...p.settlements, ...p.cities].some((v) => corners.has(v)),
    )
    if (victims.length === 0) {
      setMessage('Robber moved — nobody to rob.')
      return
    }
    const victim = pick(victims)
    const card = pick(handCards(victim))
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === victim.id) return { ...p, hand: { ...p.hand, [card]: p.hand[card] - 1 } }
        if (p.id === currentId) return { ...p, hand: { ...p.hand, [card]: p.hand[card] + 1 } }
        return p
      }),
    )
    setMessage(`Robber moved — stole 1 ${card} from ${victim.name}.`)
  }

  function bankTrade(give: Resource, get: Resource) {
    const rate = rates[give]
    if (current.hand[give] < rate || give === get) return
    updateCurrent((p) => ({
      ...p,
      hand: { ...p.hand, [give]: p.hand[give] - rate, [get]: p.hand[get] + 1 },
    }))
    setMessage(`Traded ${rate} ${give} for 1 ${get}.`)
  }

  function endTurn() {
    setTurn((t) => (t + 1) % players.length)
    setMode(null)
    setDice(null)
    setHasRolled(false)
    setMessage(`${players[(turn + 1) % players.length].name} to roll.`)
  }

  function startBuild(kind: BuildKind) {
    if (!canAfford(current, kind)) return
    setMode(kind)
    setMessage(`Pick a spot for your ${kind}.`)
  }

  function newGame() {
    const b = createBoard()
    setBoard(b)
    setPlayers(createPlayers())
    setPhase('setup')
    setSetupIndex(0)
    setPendingRoadFrom(null)
    setTurn(0)
    setMode(null)
    setDice(null)
    setHasRolled(false)
    setRobberTile(b.tiles.find((t) => t.type === 'desert')?.id ?? b.tiles[0].id)
    setMessage('Place your first settlement.')
  }

  const winner = players.find((p) => victoryPoints(p) >= 10)

  return (
    <div className="app" style={{ '--turn-color': current.color } as React.CSSProperties}>
      <header className="topbar">
        <h1 className="topbar__title">Catan</h1>
        <PlayerStrip players={players} current={currentId} />
        <button className="btn btn--ghost" onClick={newGame}>
          New game
        </button>
      </header>

      <main className="stage">
        <BoardView
          board={board}
          players={players}
          robberTile={robberTile}
          vertexTargets={vertexTargets}
          edgeTargets={edgeTargets}
          tileTargets={mode === 'robber'}
          onVertex={handleVertex}
          onEdge={handleEdge}
          onTile={handleTile}
        />
      </main>

      <footer className="dock">
        <div className="dock__row dock__row--status">
          <span className="turnpill">{current.name}'s turn</span>
          <span className="status">{winner ? `${winner.name} wins!` : message}</span>
          {phase === 'play' && <Dice dice={dice} rolling={rolling} />}
        </div>
        <HandBar player={current} rates={phase === 'play' ? rates : undefined} />
        {phase === 'play' && hasRolled && mode !== 'robber' && (
          <TradeBar player={current} rates={rates} onTrade={bankTrade} />
        )}
        {phase === 'play' && (
          <ActionBar
            player={current}
            mode={mode}
            hasRolled={hasRolled}
            onBuild={startBuild}
            onRoll={roll}
            onEndTurn={endTurn}
            onCancel={() => setMode(null)}
          />
        )}
      </footer>
    </div>
  )
}
