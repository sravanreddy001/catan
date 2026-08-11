import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import BoardView from './components/Board'
import Lobby, { WaitingRoom } from './components/Lobby'
import {
  ActionBar,
  BuildGuide,
  DevBar,
  DevCardGuide,
  DevCardSheet,
  MerchantPanel,
  Dice,
  DiscardPicker,
  HandBar,
  OfferComposer,
  EndVote,
  OfferResponse,
  PendingOffer,
  PlayerStrip,
  DraftPicker,
  ResourcePicker,
  SettingsChip,
  TradeBar,
} from './components/Hud'
import {
  createGame,
  currentPlayerId,
  defaultSettings,
  edgeTargets as edgeTargetsOf,
  longestRoadHolder,
  ratesFor,
  reduce,
  vertexTargets as vertexTargetsOf,
  type Action,
  type GameSettings,
  type GameState,
} from './game/engine'
import { chooseAction, chooseDiscard, respondToEnd, respondToOffer, type AIPreset } from './game/ai'
import {
  PALETTE,
  canAffordDev,
  hasCards,
  largestArmyHolder,
  scoreBreakdown,
  victoryPoints,
  type BuildKind,
  type DevCard,
  type PlayerId,
} from './game/players'
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
  | { kind: 'waiting'; isHost: boolean; code: string; names: string[]; colors: number[]; status: string; settings: GameSettings }
  | { kind: 'playing' }

/**
 * Host-side authorization for a guest-sent action. Most actions only make
 * sense from the current player, but a few name their own actor and are
 * legitimately sent off-turn (discarding on a 7, responding to a trade
 * offer aimed at you, cancelling your own pending offer) — those are
 * checked against that actor field instead, so a guest can act as itself
 * without needing to be the seat currently taking a turn.
 */
function actorMayDispatch(state: GameState, action: Action, fromSeat: number): boolean {
  switch (action.type) {
    case 'discard':
      return action.playerId === fromSeat
    case 'acceptOffer':
    case 'declineOffer':
      return action.responder === fromSeat
    case 'cancelOffer':
      return state.offer?.from === fromSeat
    default:
      return currentPlayerId(state) === fromSeat
  }
}

/** How long a human gets to answer a bot's trade offer before it passes. */
const OFFER_ANSWER_SECONDS = 7

export default function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'lobby' })
  const [state, setState] = useState<GameState | null>(null)
  /** null in offline play: whoever's turn it is may act. */
  const [seat, setSeat] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const [composingOffer, setComposingOffer] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showCardGuide, setShowCardGuide] = useState(false)
  // A card is never spent by a stray tap: tapping opens a sheet stating what
  // the card does, and only the sheet's Play button dispatches.
  const [confirmCard, setConfirmCard] = useState<DevCard | null>(null)
  const [endView, setEndView] = useState<'scores' | 'map'>('scores')
  const [showBreakdown, setShowBreakdown] = useState(false)
  /** AI preset assigned to each bot seat (offline only). Seat -> preset mapping. */
  const [botPresets, setBotPresets] = useState<Record<number, AIPreset>>({})
  /** Bumped after each bot move so a no-op action still re-triggers the loop. */
  const [botTick, setBotTick] = useState(0)
  /** Seconds left to answer a bot's offer; null when no clock is running. */
  const [offerClock, setOfferClock] = useState<number | null>(null)

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
    if (!state || state.winner !== null || Object.keys(botPresets).length === 0) return
    const active = currentPlayerId(state)
    if (!(active in botPresets)) return
    // Its own offer is on the table: wait for the answer instead of playing on.
    if (state.offer) return

    const timer = window.setTimeout(() => {
      const action = chooseAction(state, active, botPresets[active])
      dispatch(action ?? { type: 'endTurn' })
      setBotTick((t) => t + 1)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [state, botPresets, botTick, dispatch])

  // A bot discards on its own the moment a 7 leaves it owing cards.
  useEffect(() => {
    if (!state) return
    const owedSeat = Object.keys(botPresets).find((s) => state.discards[Number(s) as PlayerId])
    if (owedSeat === undefined) return
    const seat = Number(owedSeat)

    const timer = window.setTimeout(() => {
      dispatch({ type: 'discard', playerId: seat as PlayerId, cards: chooseDiscard(state, seat, botPresets[seat]) })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [state, botPresets, dispatch])

  // A bot answers a trade offer pointed at it — one at a time, so an offer to
  // 'any' survives a bot's rejection as long as another responder is pending.
  useEffect(() => {
    if (!state?.offer || Object.keys(botPresets).length === 0) return
    const offer = state.offer
    const responders = Object.keys(botPresets)
      .map(Number)
      .filter(
        (s) =>
          (offer.to === 'any' ? s !== offer.from : s === offer.to) &&
          !offer.declinedBy.includes(s as PlayerId),
      )
    if (responders.length === 0) return

    const timer = window.setTimeout(() => {
      const taker = responders.find((s) => respondToOffer(state, s, botPresets[s]) === 'accept')
      dispatch(
        taker !== undefined
          ? { type: 'acceptOffer', responder: taker as PlayerId }
          : { type: 'declineOffer', responder: responders[0] as PlayerId },
      )
    }, 900)
    return () => window.clearTimeout(timer)
  }, [state, botPresets, dispatch])

  // Bots answer an open end-of-game vote themselves, one per tick, so a vote
  // never sits waiting on a seat nobody is playing.
  useEffect(() => {
    const vote = state?.endVote
    if (!state || !vote) return
    const pending = Object.keys(botPresets)
      .map(Number)
      .filter((s) => s !== vote.from && !vote.accepted.includes(s as PlayerId))
    if (pending.length === 0) return

    const timer = window.setTimeout(() => {
      const seat = pending[0]
      dispatch({ type: 'respondEnd', responder: seat as PlayerId, accept: respondToEnd(state, seat) })
    }, 600)
    return () => window.clearTimeout(timer)
  }, [state, botPresets, dispatch])

  // A bot's offer waits on the human, but not forever: the clock below gives a
  // real chance to read it and answer, then passes so play cannot stall on an
  // unattended tab. Only bot-proposed offers run on a clock — an offer a human
  // made waits as long as its responders need.
  useEffect(() => {
    const offer = state?.offer
    if (!state || !offer || !(offer.from in botPresets)) {
      setOfferClock(null)
      return
    }
    const mySeat = (seat ?? currentPlayerId(state)) as PlayerId
    const mine =
      (offer.to === 'any' ? mySeat !== offer.from : offer.to === mySeat) &&
      !offer.declinedBy.includes(mySeat) &&
      !(mySeat in botPresets)
    if (!mine) {
      setOfferClock(null)
      return
    }

    const deadline = Date.now() + OFFER_ANSWER_SECONDS * 1000
    setOfferClock(OFFER_ANSWER_SECONDS)
    const tick = window.setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000)
      setOfferClock(Math.max(0, left))
      if (left <= 0) {
        window.clearInterval(tick)
        dispatch({ type: 'declineOffer', responder: mySeat })
      }
    }, 250)
    return () => window.clearInterval(tick)
  }, [state, seat, botPresets, dispatch])

  /** Offline is you (seat 0) against AI opponents in the remaining seats. */
  function startOffline(opponents: number, color: number, settings?: Partial<GameSettings>, presets?: Record<number, AIPreset>) {
    const names = ['You', ...Array.from({ length: opponents }, (_, i) => `Bot ${i + 1}`)]
    // Bots take the remaining palette colors, in order, skipping your pick.
    const remaining = PALETTE.map((_, i) => i).filter((i) => i !== color)
    const colors = [color, ...remaining.slice(0, opponents)]
    setSeat(0)
    // Build bot presets: use provided presets or random if not specified
    const botSeats = names.map((_, i) => i).filter((i) => i > 0)
    const assignedPresets = presets || {}
    for (const seat of botSeats) {
      if (!(seat in assignedPresets)) {
        const presetOptions: AIPreset[] = ['aggressive', 'economic', 'turtle', null]
        assignedPresets[seat] = presetOptions[Math.floor(Math.random() * presetOptions.length)]!
      }
    }
    setBotPresets(assignedPresets)
    setState(createGame(names.length, names, colors, settings))
    setStage({ kind: 'playing' })
  }

  function startHosting(name: string, color: number, settings?: Partial<GameSettings>) {
    const code = roomCode()
    // What the host picked in the lobby seeds the room; the waiting room can
    // still change it before the game starts.
    const seeded: GameSettings = { ...defaultSettings(), ...settings }
    setSeat(0)
    host.current = new HostSession(code, name, color, {
      onLobby: (lobby: LobbyInfo) =>
        setStage((s) => (s.kind === 'waiting' ? {
          ...s,
          names: lobby.names,
          colors: lobby.colors,
          status: `${lobby.names.length} of 4 seats filled.`,
        } : {
          kind: 'waiting',
          isHost: true,
          code,
          names: lobby.names,
          colors: lobby.colors,
          status: `${lobby.names.length} of 4 seats filled.`,
          settings: seeded,
        })),
      onAction: (action, fromSeat) =>
        setState((prev) => {
          if (!prev || !actorMayDispatch(prev, action, fromSeat)) return prev
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
      colors: [color],
      status: 'Share the code or link, then start when everyone is in.',
      settings: seeded,
    })
  }

  function startJoining(code: string, name: string, color: number) {
    guest.current = new GuestSession(code, name, color, {
      onLobby: (lobby, mySeat) => {
        setSeat(mySeat)
        setStage({
          kind: 'waiting',
          isHost: false,
          code,
          names: lobby.names,
          colors: lobby.colors,
          status: `Joined as ${name}.`,
          settings: defaultSettings(),
        })
      },
      onState: (s) => {
        setState(s)
        setStage({ kind: 'playing' })
      },
      onError: (msg) => setStage((s) => (s.kind === 'waiting' ? { ...s, status: msg } : s)),
    })
    setStage({ kind: 'waiting', isHost: false, code, names: [], colors: [], status: 'Connecting…', settings: defaultSettings() })
  }

  function hostStart(settings?: Partial<GameSettings>) {
    const names = host.current?.playerNames ?? []
    const colors = host.current?.playerColors ?? []
    const game = createGame(names.length, names, colors, settings)
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
    // engine named "Bot n" when the game was created. The presets chosen at
    // lobby time aren't persisted, so resumed bots fall back to the default
    // behavior rather than re-rolling a personality on every resume.
    if (!s.code) {
      const presets: Record<number, AIPreset> = {}
      for (let i = 0; i < s.state.players.length; i++) {
        if (s.state.players[i].name.startsWith('Bot')) presets[i] = null
      }
      setBotPresets(presets)
    }
    setStage({ kind: 'playing' })
  }

  function leave() {
    host.current?.destroy()
    guest.current?.destroy()
    host.current = null
    guest.current = null
    setState(null)
    setSeat(null)
    setBotPresets({})
    setEndView('scores')
    setShowBreakdown(false)
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
        colors={stage.colors}
        isHost={stage.isHost}
        status={stage.status}
        settings={stage.settings}
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
        .filter(
          (i) =>
            (state.offer!.to === 'any' ? i !== state.offer!.from : i === state.offer!.to) &&
            !state.offer!.declinedBy.includes(i as PlayerId) &&
            hasCards(state.players[i], state.offer!.want),
        )
    : []
  const humanCanAnswerOffer = offerResponders.some((s) => !(s in botPresets))
  /** Which seat this device is answering (or proposing) as. */
  const viewerSeat = (seat ?? currentId) as PlayerId
  const viewed = seat === null ? current : state.players[seat]
  /** Discard is owed by hand, not by turn — only the local human seat sees it. */
  const myDiscardOwed = seat !== null ? state.discards[seat as PlayerId] : undefined
  /**
   * Anything that must resolve before another dev-card action is legal: a
   * pending robber move, free roads still owed, a resource still to pick.
   */
  const devBusy =
    !myTurn ||
    state.phase !== 'play' ||
    !state.hasRolled ||
    state.mode === 'robber' ||
    state.freeRoads > 0 ||
    state.picking !== null ||
    state.draft !== null ||
    state.merchant !== null

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
        <div className="topbar__left">
          <SettingsChip settings={state.settings} botPresets={botPresets} />
          <h1 className="topbar__title">Catan</h1>
        </div>
        <PlayerStrip
          players={state.players}
          current={currentId}
          largestArmy={largestArmy}
          longestRoad={longestRoad}
          vpTarget={state.settings.vpTarget}
          endless={state.settings.endless}
        />
        <div className="topbar__actions">
          <button
            className="btn btn--ghost btn--icon-only"
            onClick={() => setShowGuide(true)}
            title="What things cost"
            aria-label="Cost guide — what each piece and card costs"
          >
            ?
          </button>
          <button
            className="btn btn--ghost topbar__new-game"
            onClick={() => {
              clearSaved()
              leave()
            }}
          >
            New game
          </button>
        </div>
      </header>

      {showGuide && <BuildGuide onClose={() => setShowGuide(false)} bank={state.bank} />}

      {winner && endView === 'scores' && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="winner-dialog-title">
          <div className="modal__panel">
            <h2 id="winner-dialog-title" className="modal__title">🏆 {winner.name} wins!</h2>
            <div className="modal__tabs">
              <button className="btn btn--ghost btn--on" disabled>
                Scores
              </button>
              <button className="btn btn--ghost" onClick={() => setEndView('map')}>
                View final board
              </button>
            </div>
            <ul className="seats">
              {[...state.players]
                .sort(
                  (a, b) =>
                    victoryPoints(b, largestArmy, longestRoad) -
                    victoryPoints(a, largestArmy, longestRoad),
                )
                .map((p) => {
                  const breakdown = scoreBreakdown(p, largestArmy, longestRoad)
                  return (
                    <li key={p.id} className="seats__row">
                      <div className="seats__row-main">
                        {p.name}
                        <small>
                          {breakdown.total} VP · {p.cities.length} cities · {p.settlements.length}{' '}
                          settlements · {p.knights} knights
                        </small>
                      </div>
                      {showBreakdown && (
                        <ul className="seats__breakdown">
                          <li>
                            Settlements: {breakdown.settlements} × 1 = {breakdown.settlementPoints}
                          </li>
                          <li>
                            Cities: {breakdown.cities} × 2 = {breakdown.cityPoints}
                          </li>
                          {breakdown.devCardPoints > 0 && (
                            <li>Victory point cards: {breakdown.devCardPoints}</li>
                          )}
                          {breakdown.largestArmy && <li>Largest army: 2</li>}
                          {breakdown.longestRoad && <li>Longest road: 2</li>}
                          <li className="seats__breakdown-total">Total: {breakdown.total}</li>
                        </ul>
                      )}
                    </li>
                  )
                })}
            </ul>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => setShowBreakdown((v) => !v)}>
                {showBreakdown ? 'Hide' : 'Show'} how scores add up
              </button>
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
        </div>
      )}

      {winner && endView === 'map' && (
        <div className="end-map-bar">
          <span className="end-map-bar__label">🏆 {winner.name} wins! — final board</span>
          <button className="btn btn--primary" onClick={() => setEndView('scores')}>
            Back to scores
          </button>
        </div>
      )}

      {!!myDiscardOwed && (
        <DiscardPicker
          player={state.players[seat as number]}
          owed={myDiscardOwed}
          onDiscard={(cards) => dispatch({ type: 'discard', playerId: seat as PlayerId, cards })}
        />
      )}

      {/* Bots draft on their own tick; only the buying human sees this. */}
      {myTurn && state.draft && !(currentId in botPresets) && (
        <DraftPicker
          options={state.draft}
          deckCount={state.deck.length}
          onPick={(index) => dispatch({ type: 'draftPick', index })}
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
          counts={state.players[viewerSeat].hand}
          onPick={(res) => dispatch({ type: 'plenty', res })}
        />
      )}

      {myTurn && state.picking === 'santaBonus' && (
        <ResourcePicker
          title="Pick a free resource"
          hint="Choose one resource to take from the bank."
          onPick={(res) => dispatch({ type: 'santaBonus', res })}
        />
      )}

      {myTurn && state.picking === 'meritBonus' && (
        <ResourcePicker
          title="Merit — pick a free resource"
          hint="Worth half a point, and take 1 resource from the bank."
          onPick={(res) => dispatch({ type: 'meritBonus', res })}
        />
      )}

      {myTurn && state.merchant && (
        <MerchantPanel
          baskets={state.merchant}
          player={current}
          bank={state.bank}
          onPick={(side, res, delta) => dispatch({ type: 'merchantPick', side, res, delta })}
          onConfirm={() => dispatch({ type: 'merchantConfirm' })}
          onCancel={() => dispatch({ type: 'merchantCancel' })}
        />
      )}

      {confirmCard && (
        <DevCardSheet
          card={confirmCard}
          deckCount={state.deck.length}
          onPlay={() => {
            dispatch({ type: 'playDev', cardId: confirmCard.id })
            setConfirmCard(null)
          }}
          onCancel={() => setConfirmCard(null)}
        />
      )}

      {showCardGuide && (
        <DevCardGuide deck={state.deck} onClose={() => setShowCardGuide(false)} />
      )}

      {myTurn && (
        <OfferComposer
          player={current}
          players={state.players}
          visible={composingOffer}
          onDismiss={() => setComposingOffer(false)}
          onReopen={() => setComposingOffer(true)}
          onCancel={() => setComposingOffer(false)}
          onPropose={(offer) => {
            setComposingOffer(false)
            dispatch({ type: 'propose', offer })
          }}
        />
      )}

      {/* Only prompt when a human can answer: if every responder is a bot the
          effect above decides, and a popup would flash open and shut. */}
      {state.offer && humanCanAnswerOffer && offerResponders.includes(viewerSeat) && (
        <OfferResponse
          offer={state.offer}
          players={state.players}
          answerable={offerResponders.filter((s) => !(s in botPresets)) as PlayerId[]}
          secondsLeft={offerClock}
          onAccept={(responder) => dispatch({ type: 'acceptOffer', responder })}
          onDecline={() => dispatch({ type: 'declineOffer', responder: viewerSeat })}
        />
      )}

      {state.endVote && !(viewerSeat in botPresets) && viewerSeat !== state.endVote.from && (
        <EndVote
          vote={state.endVote}
          players={state.players}
          answerable={state.players
            .map((p) => p.id)
            .filter((id) => !(id in botPresets)) as PlayerId[]}
          onRespond={(responder, accept) => dispatch({ type: 'respondEnd', responder, accept })}
        />
      )}

      {/* Stays up for the proposer until it's accepted, cancelled, or everyone's declined. */}
      {state.offer && state.offer.from === viewerSeat && (
        <PendingOffer
          offer={state.offer}
          players={state.players}
          onCancel={() => dispatch({ type: 'cancelOffer' })}
        />
      )}

      <div className="game-layout">
        <main className="stage">
          <div
            className="board-frame"
            style={{ aspectRatio: `${state.board.bounds.width} / ${state.board.bounds.height}` }}
          >
            <BoardView
              board={state.board}
              players={state.players}
              robberTile={state.robberTile}
              vertexTargets={myTurn ? vertexTargets : new Set()}
              edgeTargets={myTurn ? edgeTargets : new Set()}
              tileTargets={myTurn && state.mode === 'robber'}
              rolledSum={state.dice ? state.dice[0] + state.dice[1] : null}
              santaMode={state.settings.santaMode}
              onVertex={(id) => dispatch({ type: 'vertex', id })}
              onEdge={(id) => dispatch({ type: 'edge', id })}
              onTile={(id) => dispatch({ type: 'tile', id })}
            />
            {state.phase === 'play' && state.hasRolled && (
              <Dice dice={state.dice} rolling={rolling} />
            )}
          </div>
        </main>

        <div className="sidebar-rail">
          <div className="turnbar">
            <span className="turnpill">
              {myTurn && seat !== null ? 'Your turn' : `${current.name}'s turn`}
            </span>
            <span className="status">{winner ? `${winner.name} wins!` : state.message}</span>
          </div>

          <footer className="dock">
            {/*
              Row 1 — what you hold. Resources on the left, development cards on
              the right, so one glance at one row answers "what have I got".
            */}
            <div className="dock__row dock__row--holdings">
              <div className="dock__hand-section">
                <div className="dock__section-title">
                  {state.settings.publicHands ? 'Hands' : 'Your hand'}
                </div>
                {state.settings.publicHands ? (
                  <div className="dock__public-hands">
                    {state.players.map((p) => (
                      <div key={p.id} className="dock__player-hand">
                        <div className="dock__hand-owner">
                          {p.name}
                        </div>
                        <HandBar player={p} rates={state.phase === 'play' ? rates : undefined} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <HandBar player={viewed} rates={state.phase === 'play' ? rates : undefined} />
                )}
              </div>

              <DevBar
                player={viewed}
                busy={devBusy}
                disabled={!myTurn || state.phase !== 'play' || !state.hasRolled}
                playedThisTurn={state.playedDev}
                onPlay={(card) => setConfirmCard(card)}
                onGuide={() => setShowCardGuide(true)}
              />
            </div>

            {/*
              These read from your seat, not from whoever is acting. Rendering
              them against `current` meant that during a bot's 700ms tick the
              rail re-rendered against the bot's hand — which is the flicker,
              and also leaks what the bot is holding through the affordability
              states. Offline hot-seat is unaffected: `viewed` is `current`
              when there is no assigned seat.
            */}
            <TradeBar
              player={viewed}
              rates={rates}
              disabled={!myTurn || state.phase !== 'play' || !state.hasRolled || state.mode === 'robber'}
              onTrade={(give, get) => dispatch({ type: 'bankTrade', give, get })}
            />

            <ActionBar
              player={viewed}
              canBuyDev={!devBusy && canAffordDev(viewed) && state.deck.length > 0}
              devDeckEmpty={state.deck.length === 0}
              onBuyDev={() => dispatch({ type: 'buyDev' })}
              mode={state.mode}
              hasRolled={state.hasRolled}
              myTurn={myTurn && state.phase === 'play'}
              onBuild={(kind: BuildKind) => dispatch({ type: 'setMode', mode: kind })}
              onRoll={roll}
              onEndTurn={() => dispatch({ type: 'endTurn' })}
              onCancel={() => dispatch({ type: 'setMode', mode: null })}
              canOffer={state.players.length > 1}
              onOffer={() => setComposingOffer(true)}
              canProposeEnd={state.settings.endless && !state.endVote}
              onProposeEnd={() => dispatch({ type: 'proposeEnd' })}
            />
          </footer>
        </div>
      </div>
    </div>
  )
}
