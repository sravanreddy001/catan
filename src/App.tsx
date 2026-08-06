import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import BoardView from './components/Board'
import Lobby, { WaitingRoom } from './components/Lobby'
import {
  ActionBar,
  BuildGuide,
  Dice,
  DevBar,
  DiscardPicker,
  HandBar,
  OfferComposer,
  OfferResponse,
  PlayerStrip,
  ResourcePicker,
  TradeBar,
} from './components/Hud'
import {
  createGame,
  currentPlayerId,
  edgeTargets as edgeTargetsOf,
  longestRoadHolder,
  ratesFor,
  reduce,
  vertexTargets as vertexTargetsOf,
  type Action,
  type GameState,
} from './game/engine'
import { chooseAction, chooseDiscard, respondToOffer } from './game/ai'
import { largestArmyHolder, victoryPoints, type BuildKind, type PlayerId } from './game/players'
import {
  GuestSession,
  HostSession,
  clearSaved,
  codeFromUrl,
  load,
  roomCode,
  save,
  type Lobby as LobbyInfo,
} from './net/session'

type Stage =
  | { kind: 'lobby' }
  | { kind: 'waiting'; isHost: boolean; code: string; names: string[]; status: string }
  | { kind: 'playing' }

export default function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'lobby' })
  const [state, setState] = useState<GameState | null>(null)
  /** null in offline play: whoever's turn it is may act. */
  const [seat, setSeat] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const [composingOffer, setComposingOffer] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  /** Seats played by the AI (offline only). */
  const [botSeats, setBotSeats] = useState<number[]>([])
  /** Bumped after each bot move so a no-op action still re-triggers the loop. */
  const [botTick, setBotTick] = useState(0)

  const host = useRef<HostSession | null>(null)
  const guest = useRef<GuestSession | null>(null)
  const saved = useRef(load())

  /** Host and offline both run the reducer locally; guests send intents up. */
  const dispatch = useCallback((action: Action) => {
    if (guest.current) {
      guest.current.send(action)
      return
    }
    setState((prev) => {
      if (!prev) return prev
      const next = reduce(prev, action)
      host.current?.broadcastState(next)
      return next
    })
  }, [])

  // Mirror every state change into localStorage so a refresh can resume.
  useEffect(() => {
    if (!state) return
    save({
      role: host.current ? 'host' : 'guest',
      code: host.current?.code ?? '',
      seat: seat ?? -1,
      names: state.players.map((p) => p.name),
      state,
    })
  }, [state, seat])

  useEffect(() => {
    return () => {
      host.current?.destroy()
      guest.current?.destroy()
    }
  }, [])

  // Bot turns: one action per tick, paced so a human can follow what happened.
  useEffect(() => {
    if (!state || state.winner !== null || botSeats.length === 0) return
    const active = currentPlayerId(state)
    if (!botSeats.includes(active)) return

    const timer = window.setTimeout(() => {
      const action = chooseAction(state, active)
      dispatch(action ?? { type: 'endTurn' })
      setBotTick((t) => t + 1)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [state, botSeats, botTick, dispatch])

  // A bot discards on its own the moment a 7 leaves it owing cards.
  useEffect(() => {
    if (!state) return
    const owedSeat = botSeats.find((s) => state.discards[s as PlayerId])
    if (owedSeat === undefined) return

    const timer = window.setTimeout(() => {
      dispatch({ type: 'discard', playerId: owedSeat as PlayerId, cards: chooseDiscard(state, owedSeat) })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [state, botSeats, dispatch])

  // A bot answers a trade offer pointed at it.
  useEffect(() => {
    if (!state?.offer || botSeats.length === 0) return
    const offer = state.offer
    const responders = botSeats.filter((s) =>
      offer.to === 'any' ? s !== offer.from : s === offer.to,
    )
    if (responders.length === 0) return

    const timer = window.setTimeout(() => {
      const taker = responders.find((s) => respondToOffer(state, s) === 'accept')
      dispatch(taker !== undefined ? { type: 'acceptOffer', responder: taker as PlayerId } : { type: 'declineOffer' })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [state, botSeats, dispatch])

  /** Offline is you (seat 0) against AI opponents in the remaining seats. */
  function startOffline(opponents: number) {
    const names = ['You', ...Array.from({ length: opponents }, (_, i) => `Bot ${i + 1}`)]
    setSeat(0)
    setBotSeats(names.map((_, i) => i).filter((i) => i > 0))
    setState(createGame(names.length, names))
    setStage({ kind: 'playing' })
  }

  function startHosting(name: string) {
    const code = roomCode()
    setSeat(0)
    host.current = new HostSession(code, name, {
      onLobby: (lobby: LobbyInfo) =>
        setStage({
          kind: 'waiting',
          isHost: true,
          code,
          names: lobby.names,
          status: `${lobby.names.length} of 4 seats filled.`,
        }),
      onAction: (action, fromSeat) =>
        setState((prev) => {
          // Guests may only act on their own turn.
          if (!prev || currentPlayerId(prev) !== fromSeat) return prev
          const next = reduce(prev, action)
          host.current?.broadcastState(next)
          return next
        }),
      onError: (msg) =>
        setStage((s) => (s.kind === 'waiting' ? { ...s, status: msg } : s)),
    })
    setStage({
      kind: 'waiting',
      isHost: true,
      code,
      names: [name],
      status: 'Share the code or link, then start when everyone is in.',
    })
  }

  function startJoining(code: string, name: string) {
    guest.current = new GuestSession(code, name, {
      onLobby: (lobby, mySeat) => {
        setSeat(mySeat)
        setStage({
          kind: 'waiting',
          isHost: false,
          code,
          names: lobby.names,
          status: `Joined as ${name}.`,
        })
      },
      onState: (s) => {
        setState(s)
        setStage({ kind: 'playing' })
      },
      onError: (msg) => setStage((s) => (s.kind === 'waiting' ? { ...s, status: msg } : s)),
    })
    setStage({ kind: 'waiting', isHost: false, code, names: [], status: 'Connecting…' })
  }

  function hostStart() {
    const names = host.current?.playerNames ?? []
    const game = createGame(names.length, names)
    setState(game)
    host.current?.broadcastState(game)
    setStage({ kind: 'playing' })
  }

  function resume() {
    const s = saved.current
    if (!s?.state) return
    setState(s.state)
    setSeat(s.seat >= 0 ? s.seat : 0)
    // Offline games are saved with no room code; their bots are the seats the
    // engine named "Bot n" when the game was created.
    setBotSeats(
      s.code ? [] : s.state.players.map((p, i) => (p.name.startsWith('Bot') ? i : -1)).filter((i) => i >= 0),
    )
    setStage({ kind: 'playing' })
  }

  function leave() {
    host.current?.destroy()
    guest.current?.destroy()
    host.current = null
    guest.current = null
    setState(null)
    setSeat(null)
    setBotSeats([])
    setStage({ kind: 'lobby' })
  }

  const vertexTargets = useMemo(() => (state ? vertexTargetsOf(state) : new Set<string>()), [state])
  const edgeTargets = useMemo(() => (state ? edgeTargetsOf(state) : new Set<string>()), [state])

  if (stage.kind === 'lobby') {
    return (
      <Lobby
        initialCode={codeFromUrl()}
        resumable={!!saved.current?.state}
        onOffline={startOffline}
        onHost={startHosting}
        onJoin={startJoining}
        onResume={resume}
      />
    )
  }

  if (stage.kind === 'waiting') {
    return (
      <WaitingRoom
        code={stage.code}
        names={stage.names}
        isHost={stage.isHost}
        status={stage.status}
        onStart={hostStart}
        onCancel={leave}
      />
    )
  }

  if (!state) return null

  const currentId = currentPlayerId(state)
  const current = state.players[currentId]
  const rates = ratesFor(state, currentId)
  const largestArmy = largestArmyHolder(state.players)
  const longestRoad = longestRoadHolder(state.board, state.players)
  const winner = state.winner !== null ? state.players[state.winner] : null
  /** Offline hot-seat: the device always controls the active player. */
  const myTurn = seat === null || seat === currentId
  const offerResponders = state.offer
    ? state.players
        .map((_, i) => i)
        .filter((i) => (state.offer!.to === 'any' ? i !== state.offer!.from : i === state.offer!.to))
    : []
  const humanCanAnswerOffer = offerResponders.some((s) => !botSeats.includes(s))
  const viewed = seat === null ? current : state.players[seat]
  /** Discard is owed by hand, not by turn — only the local human seat sees it. */
  const myDiscardOwed = seat !== null ? state.discards[seat as PlayerId] : undefined

  function roll() {
    setRolling(true)
    window.setTimeout(() => {
      setRolling(false)
      dispatch({ type: 'roll' })
    }, 450)
  }

  return (
    <div className="app" style={{ '--turn-color': current.color } as React.CSSProperties}>
      <header className="topbar">
        <h1 className="topbar__title">Catan</h1>
        <PlayerStrip
          players={state.players}
          current={currentId}
          largestArmy={largestArmy}
          longestRoad={longestRoad}
        />
        <button className="btn btn--ghost btn--icon-only" onClick={() => setShowGuide(true)} title="What things cost">
          ?
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            clearSaved()
            leave()
          }}
        >
          New game
        </button>
      </header>

      {showGuide && <BuildGuide onClose={() => setShowGuide(false)} />}

      {winner && (
        <div className="modal">
          <div className="modal__panel">
            <h2 className="modal__title">🏆 {winner.name} wins!</h2>
            <ul className="seats">
              {[...state.players]
                .sort(
                  (a, b) =>
                    victoryPoints(b, largestArmy, longestRoad) -
                    victoryPoints(a, largestArmy, longestRoad),
                )
                .map((p) => (
                  <li key={p.id} className="seats__row">
                    {p.name}
                    <small>
                      {victoryPoints(p, largestArmy, longestRoad)} VP · {p.cities.length} cities ·{' '}
                      {p.settlements.length} settlements · {p.knights} knights
                    </small>
                  </li>
                ))}
            </ul>
            <button
              className="btn btn--primary"
              onClick={() => {
                clearSaved()
                leave()
              }}
            >
              New game
            </button>
          </div>
        </div>
      )}

      {!!myDiscardOwed && (
        <DiscardPicker
          player={state.players[seat as number]}
          owed={myDiscardOwed}
          onDiscard={(cards) => dispatch({ type: 'discard', playerId: seat as PlayerId, cards })}
        />
      )}

      {myTurn && state.picking === 'monopoly' && (
        <ResourcePicker
          title="Monopoly — take every card of one type"
          onPick={(res) => dispatch({ type: 'monopoly', res })}
        />
      )}

      {myTurn && state.picking === 'plenty' && (
        <ResourcePicker
          title="Year of plenty"
          hint={`Take ${state.plentyLeft} more from the bank.`}
          onPick={(res) => dispatch({ type: 'plenty', res })}
        />
      )}

      {composingOffer && myTurn && (
        <OfferComposer
          player={current}
          players={state.players}
          onCancel={() => setComposingOffer(false)}
          onPropose={(offer) => {
            setComposingOffer(false)
            dispatch({ type: 'propose', offer })
          }}
        />
      )}

      {/* Only prompt when a human can answer: if every responder is a bot the
          effect above decides, and a popup would flash open and shut. */}
      {state.offer && humanCanAnswerOffer && (
        <OfferResponse
          offer={state.offer}
          players={state.players}
          onAccept={(responder) => dispatch({ type: 'acceptOffer', responder })}
          onDecline={() => dispatch({ type: 'declineOffer' })}
        />
      )}

      <main className="stage">
        <BoardView
          board={state.board}
          players={state.players}
          robberTile={state.robberTile}
          vertexTargets={myTurn ? vertexTargets : new Set()}
          edgeTargets={myTurn ? edgeTargets : new Set()}
          tileTargets={myTurn && state.mode === 'robber'}
          onVertex={(id) => dispatch({ type: 'vertex', id })}
          onEdge={(id) => dispatch({ type: 'edge', id })}
          onTile={(id) => dispatch({ type: 'tile', id })}
        />
      </main>

      <div className="turnbar">
        <span className="turnpill">
          {myTurn && seat !== null ? 'Your turn' : `${current.name}'s turn`}
        </span>
        <span className="status">{winner ? `${winner.name} wins!` : state.message}</span>
        {state.phase === 'play' && <Dice dice={state.dice} rolling={rolling} />}
      </div>

      <footer className="dock">
        <HandBar player={viewed} rates={state.phase === 'play' ? rates : undefined} />

        {myTurn && state.phase === 'play' && state.hasRolled && state.mode !== 'robber' && (
          <TradeBar
            player={current}
            rates={rates}
            onTrade={(give, get) => dispatch({ type: 'bankTrade', give, get })}
          />
        )}

        {myTurn && state.phase === 'play' && state.hasRolled && (
          <DevBar
            player={current}
            deckCount={state.deck.length}
            busy={state.mode === 'robber' || state.freeRoads > 0 || state.picking !== null}
            playedThisTurn={state.playedDev}
            onBuy={() => dispatch({ type: 'buyDev' })}
            onPlay={(card) => dispatch({ type: 'playDev', cardId: card.id })}
          />
        )}

        {myTurn && state.phase === 'play' && (
          <ActionBar
            player={current}
            mode={state.mode}
            hasRolled={state.hasRolled}
            onBuild={(kind: BuildKind) => dispatch({ type: 'setMode', mode: kind })}
            onRoll={roll}
            onEndTurn={() => dispatch({ type: 'endTurn' })}
            onCancel={() => dispatch({ type: 'setMode', mode: null })}
            canOffer={state.players.length > 1}
            onOffer={() => setComposingOffer(true)}
          />
        )}
      </footer>
    </div>
  )
}
