import { useMemo, useState } from 'react'
import './styles.css'
import BoardView from './components/Board'
import {
  ActionBar,
  Dice,
  DevBar,
  HandBar,
  OfferComposer,
  OfferResponse,
  PlayerStrip,
  ResourcePicker,
  TradeBar,
} from './components/Hud'
import { createBoard, tradeRates, vertexNeighbours, type Board, type Resource } from './game/board'
import {
  DEV_COST,
  applyTrade,
  canAfford,
  canAffordDev,
  createDevDeck,
  createPlayers,
  largestArmyHolder,
  pay,
  victoryPoints,
  type BuildKind,
  type DevCard,
  type DevKind,
  type Player,
  type PlayerId,
  type TradeOffer,
} from './game/players'

type Mode = BuildKind | 'robber' | null
type Phase = 'lobby' | 'setup' | 'play'

/** Snake order for the opening placements, e.g. 0,1,2,3,3,2,1,0. */
function setupOrder(count: number): number[] {
  const forward = Array.from({ length: count }, (_, i) => i)
  return [...forward, ...forward.slice().reverse()]
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

export default function App() {
  const [board, setBoard] = useState<Board>(() => createBoard())
  const [players, setPlayers] = useState<Player[]>(createPlayers)
  const [phase, setPhase] = useState<Phase>('lobby')
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
  const [composingOffer, setComposingOffer] = useState(false)
  const [offer, setOffer] = useState<TradeOffer | null>(null)
  const [deck, setDeck] = useState<DevKind[]>(createDevDeck)
  const [playedDev, setPlayedDev] = useState(false)
  /** Free roads owed by a road-building card. */
  const [freeRoads, setFreeRoads] = useState(0)
  const [picking, setPicking] = useState<'monopoly' | 'plenty' | null>(null)
  const [plentyLeft, setPlentyLeft] = useState(0)

  const order = useMemo(() => setupOrder(players.length), [players.length])
  const currentId = phase === 'setup' ? order[setupIndex] : turn
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
    if (freeRoads > 0) {
      updateCurrent((p) => ({ ...p, roads: [...p.roads, id] }))
      const left = freeRoads - 1
      setFreeRoads(left)
      setMode(left > 0 ? 'road' : null)
      setMessage(left > 0 ? 'One more free road.' : 'Road building resolved.')
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
    if (next >= order.length) {
      setPhase('play')
      setTurn(0)
      setMessage(`Setup done — ${players[0].name} to roll.`)
    } else {
      setSetupIndex(next)
      setMessage(`${players[order[next]].name}: place a settlement.`)
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

  function buyDev() {
    if (!canAffordDev(current) || deck.length === 0) return
    const [kind, ...rest] = deck
    setDeck(rest)
    updateCurrent((p) => {
      const hand = { ...p.hand }
      for (const [res, n] of Object.entries(DEV_COST)) hand[res as Resource] -= n ?? 0
      return {
        ...p,
        hand,
        devCards: [...p.devCards, { id: `${p.id}-${Date.now()}`, kind, ready: false }],
      }
    })
    setMessage(`Bought a development card (${deck.length - 1} left).`)
  }

  function playDev(card: DevCard) {
    // The card leaves the hand as it resolves; victory cards are never played.
    updateCurrent((p) => ({
      ...p,
      devCards: p.devCards.filter((c) => c.id !== card.id),
      knights: p.knights + (card.kind === 'knight' ? 1 : 0),
    }))
    setPlayedDev(true)

    switch (card.kind) {
      case 'knight':
        setMode('robber')
        setMessage('Knight played — move the robber.')
        break
      case 'roadBuilding':
        setFreeRoads(2)
        setMode('road')
        setMessage('Road building — place 2 free roads.')
        break
      case 'monopoly':
        setPicking('monopoly')
        break
      case 'plenty':
        setPlentyLeft(2)
        setPicking('plenty')
        break
      case 'victory':
        break
    }
  }

  /** Monopoly: every other player hands over their whole stock of one resource. */
  function takeMonopoly(res: Resource) {
    const taken = players.reduce((sum, p) => (p.id === currentId ? sum : sum + p.hand[res]), 0)
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === currentId
          ? { ...p, hand: { ...p.hand, [res]: p.hand[res] + taken } }
          : { ...p, hand: { ...p.hand, [res]: 0 } },
      ),
    )
    setPicking(null)
    setMessage(`Monopoly on ${res} — collected ${taken}.`)
  }

  function takePlenty(res: Resource) {
    updateCurrent((p) => ({ ...p, hand: { ...p.hand, [res]: p.hand[res] + 1 } }))
    const left = plentyLeft - 1
    setPlentyLeft(left)
    if (left === 0) {
      setPicking(null)
      setMessage('Year of plenty resolved.')
    }
  }

  function acceptOffer(responder: PlayerId) {
    if (!offer) return
    setPlayers((prev) => applyTrade(prev, offer.from, responder, offer.give, offer.want))
    const name = players.find((p) => p.id === responder)!.name
    setOffer(null)
    setMessage(`${name} accepted the trade.`)
  }

  function endTurn() {
    const next = (turn + 1) % players.length
    setTurn(next)
    // Cards bought earlier become playable when their owner's turn comes round.
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === next ? { ...p, devCards: p.devCards.map((c) => ({ ...c, ready: true })) } : p,
      ),
    )
    setPlayedDev(false)
    setFreeRoads(0)
    setPicking(null)
    setMode(null)
    setDice(null)
    setHasRolled(false)
    setComposingOffer(false)
    setOffer(null)
    setMessage(`${players[(turn + 1) % players.length].name} to roll.`)
  }

  function startBuild(kind: BuildKind) {
    if (!canAfford(current, kind)) return
    setMode(kind)
    setMessage(`Pick a spot for your ${kind}.`)
  }

  function newGame(count: number) {
    const b = createBoard()
    setBoard(b)
    setPlayers(createPlayers(count))
    setDeck(createDevDeck())
    setPlayedDev(false)
    setFreeRoads(0)
    setPicking(null)
    setComposingOffer(false)
    setOffer(null)
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

  const largestArmy = largestArmyHolder(players)
  const winner = players.find((p) => victoryPoints(p, largestArmy) >= 10)

  return (
    <div className="app" style={{ '--turn-color': current.color } as React.CSSProperties}>
      <header className="topbar">
        <h1 className="topbar__title">Catan</h1>
        <PlayerStrip players={players} current={currentId} largestArmy={largestArmy} />
        <button className="btn btn--ghost" onClick={() => setPhase('lobby')}>
          New game
        </button>
      </header>

      {picking === 'monopoly' && (
        <ResourcePicker
          title="Monopoly — take every card of one type"
          onPick={takeMonopoly}
        />
      )}

      {picking === 'plenty' && (
        <ResourcePicker
          title="Year of plenty"
          hint={`Take ${plentyLeft} more from the bank.`}
          onPick={takePlenty}
        />
      )}

      {composingOffer && (
        <OfferComposer
          player={current}
          players={players}
          onCancel={() => setComposingOffer(false)}
          onPropose={(o) => {
            setComposingOffer(false)
            setOffer(o)
            setMessage('Pass the device — waiting on a response.')
          }}
        />
      )}

      {offer && (
        <OfferResponse
          offer={offer}
          players={players}
          onAccept={acceptOffer}
          onDecline={() => {
            setOffer(null)
            setMessage('Offer declined.')
          }}
        />
      )}

      {phase === 'lobby' && (
        <div className="lobby">
          <div className="lobby__panel">
            <h2 className="lobby__title">How many players?</h2>
            <div className="lobby__counts">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className="lobby__count" onClick={() => newGame(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="lobby__hint">
              Hot-seat: everyone plays on this device, passing it round.
            </p>
          </div>
        </div>
      )}

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
        {phase === 'play' && hasRolled && (
          <DevBar
            player={current}
            deckCount={deck.length}
            busy={mode === 'robber' || freeRoads > 0 || picking !== null}
            playedThisTurn={playedDev}
            onBuy={buyDev}
            onPlay={playDev}
          />
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
            canOffer={players.length > 1}
            onOffer={() => setComposingOffer(true)}
          />
        )}
      </footer>
    </div>
  )
}
