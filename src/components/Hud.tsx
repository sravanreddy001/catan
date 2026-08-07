import { Fragment, useState } from 'react'
import type { Resource } from '../game/board'
import {
  BUILD_LABEL,
  COSTS,
  DEV_COST,
  DEV_ICON,
  DEV_LABEL,
  RESOURCES,
  RESOURCE_ICON,
  canAfford,
  canAffordDev,
  hasCards,
  isEmptyBundle,
  victoryPoints,
  type BuildKind,
  type DevCard,
  type Player,
  type PlayerId,
  type TradeOffer,
} from '../game/players'

/** Same silhouettes Board.tsx draws on the map, so a button reads as "this piece". */
const SETTLEMENT_SHAPE = '-8,7 -8,-2 0,-10 8,-2 8,7'
const CITY_SHAPE = '-13,8 -13,-1 -6,-8 1,-1 1,-5 7,-12 13,-5 13,8'

function PieceIcon({
  kind,
  color = '#f3c969',
  dark = '#8a6a1f',
}: {
  kind: BuildKind
  color?: string
  dark?: string
}) {
  if (kind === 'road') {
    return (
      <svg width="26" height="26" viewBox="-14 -14 28 28">
        <line x1="-9" y1="7" x2="9" y2="-7" stroke={color} strokeWidth="6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="26" height="26" viewBox="-14 -14 28 28">
      <polygon
        points={kind === 'city' ? CITY_SHAPE : SETTLEMENT_SHAPE}
        fill={color}
        stroke={dark}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PlayerStrip({
  players,
  current,
  largestArmy,
  longestRoad,
}: {
  players: Player[]
  current: number
  largestArmy: PlayerId | null
  longestRoad: PlayerId | null
}) {
  return (
    <div className="strip">
      {players.map((p) => (
        <div
          key={p.id}
          className={`chip${p.id === current ? ' chip--active' : ''}`}
          style={{ '--c': p.color } as React.CSSProperties}
        >
          <span className="chip__dot" />
          <span className="chip__name">{p.name}</span>
          {largestArmy === p.id && <span title="Largest army">⚔️</span>}
          {longestRoad === p.id && <span title="Longest road">🛣️</span>}
          <span className="chip__vp">{victoryPoints(p, largestArmy, longestRoad)} VP</span>
        </div>
      ))}
    </div>
  )
}

/** Row-major 3x3 pip positions lit for each face value. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DieFace({ value }: { value: number }) {
  const lit = new Set(PIPS[value] ?? [])
  return (
    <span className="die">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`die__pip${lit.has(i) ? ' die__pip--on' : ''}`} />
      ))}
    </span>
  )
}

export function Dice({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  if (!dice) return null
  return (
    <div className={`dice${rolling ? ' dice--rolling' : ''}`}>
      <DieFace value={dice[0]} />
      <DieFace value={dice[1]} />
    </div>
  )
}

export function HandBar({
  player,
  rates,
}: {
  player: Player
  /** Best bank/harbour rate per resource, shown as a hint under each card. */
  rates?: Record<Resource, number>
}) {
  return (
    <div className="hand">
      {RESOURCES.map((r) => {
        const n = player.hand[r]
        return (
          <div key={r} className="stack" title={`${n} ${r}`}>
            <div className={`minicard${n === 0 ? ' minicard--empty' : ''}`}>
              {RESOURCE_ICON[r]}
              {n > 0 && <span className="minicard__count">{n}</span>}
            </div>
            {rates && <span className="card__rate">{rates[r]}:1</span>}
          </div>
        )
      })}
    </div>
  )
}

interface TradeBarProps {
  player: Player
  rates: Record<Resource, number>
  onTrade: (give: Resource, get: Resource) => void
}

/** Bank / harbour trade: pick what to give, then what to take. */
export function TradeBar({ player, rates, onTrade }: TradeBarProps) {
  const [give, setGive] = useState<Resource | null>(null)

  const affordable = (r: Resource) => player.hand[r] >= rates[r]

  if (!RESOURCES.some(affordable)) return null

  return (
    <div className="trade">
      <span className="trade__label">{give ? `Give ${rates[give]} ${give} for:` : 'Trade:'}</span>
      <div className="trade__row">
        {RESOURCES.map((r) => {
          const selecting = give === null
          const disabled = selecting ? !affordable(r) : r === give
          return (
            <button
              key={r}
              className={`swap${give === r ? ' swap--on' : ''}`}
              disabled={disabled}
              onClick={() => {
                if (selecting) setGive(r)
                else {
                  onTrade(give, r)
                  setGive(null)
                }
              }}
            >
              <span>{RESOURCE_ICON[r]}</span>
              {selecting && <span className="swap__rate">{rates[r]}:1</span>}
            </button>
          )
        })}
        {give && (
          <button className="swap swap--cancel" onClick={() => setGive(null)}>
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

function costLabel(kind: BuildKind): string {
  return Object.entries(COSTS[kind])
    .map(([res, n]) => RESOURCE_ICON[res as keyof typeof RESOURCE_ICON].repeat(n ?? 0))
    .join('')
}

const BUILD_KINDS: BuildKind[] = ['road', 'settlement', 'city']

/** What each piece and a dev card costs — the icon-only build buttons need this spelled out somewhere. */
export function BuildGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal">
      <div className="modal__panel">
        <h2 className="modal__title">What things cost</h2>
        <div className="guide">
          {BUILD_KINDS.map((k) => (
            <div key={k} className="guide__row">
              <span className="guide__piece">
                <PieceIcon kind={k} />
              </span>
              <span className="guide__name">{BUILD_LABEL[k]}</span>
              <span className="guide__cost">{costLabel(k)}</span>
            </div>
          ))}
          <div className="guide__row">
            <span className="guide__piece">{DEV_ICON.knight}</span>
            <span className="guide__name">Dev card</span>
            <span className="guide__cost">
              {Object.entries(DEV_COST)
                .map(([res, n]) => RESOURCE_ICON[res as keyof typeof RESOURCE_ICON].repeat(n ?? 0))
                .join('')}
            </span>
          </div>
        </div>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

interface DevBarProps {
  player: Player
  deckCount: number
  /** Blocked while a robber move or another card is resolving. */
  busy: boolean
  playedThisTurn: boolean
  onBuy: () => void
  onPlay: (card: DevCard) => void
}

export function DevBar({
  player,
  deckCount,
  busy,
  playedThisTurn,
  onBuy,
  onPlay,
}: DevBarProps) {
  return (
    <div className="devbar">
      <button
        className="swap swap--dev"
        disabled={!canAffordDev(player) || deckCount === 0 || busy}
        onClick={onBuy}
        title={`${deckCount} cards left in the deck`}
      >
        Buy dev 🐑🌾⛰️
      </button>
      <div className="devbar__cards">
        {player.devCards.length === 0 && <span className="devbar__empty">no cards</span>}
        {player.devCards.map((c) => {
          const playable = c.kind !== 'victory' && c.ready && !playedThisTurn && !busy
          return (
            <button
              key={c.id}
              className={`devcard${c.ready ? '' : ' devcard--new'}`}
              disabled={!playable}
              title={c.kind === 'victory' ? 'Counts towards victory automatically' : DEV_LABEL[c.kind]}
              onClick={() => onPlay(c)}
            >
              <span>{DEV_ICON[c.kind]}</span>
              <span className="devcard__label">{DEV_LABEL[c.kind]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Pick one or more resources — used by monopoly and year of plenty. */
export function ResourcePicker({
  title,
  hint,
  onPick,
  onCancel,
}: {
  title: string
  hint?: string
  onPick: (r: Resource) => void
  onCancel?: () => void
}) {
  return (
    <div className="modal">
      <div className="modal__panel">
        <h2 className="modal__title">{title}</h2>
        {hint && <p className="lobby__hint">{hint}</p>}
        <div className="trade__row">
          {RESOURCES.map((r) => (
            <button key={r} className="swap" onClick={() => onPick(r)}>
              <span>{RESOURCE_ICON[r]}</span>
            </button>
          ))}
        </div>
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

type Bundle = Partial<Record<Resource, number>>

/** Rolled a 7: the owner picks which `owed` cards to hand back to the bank. */
export function DiscardPicker({
  player,
  owed,
  onDiscard,
}: {
  player: Player
  owed: number
  onDiscard: (cards: Bundle) => void
}) {
  const [picks, setPicks] = useState<Bundle>({})
  const total = Object.values(picks).reduce((sum, n) => sum + (n ?? 0), 0)

  return (
    <div className="modal">
      <div className="modal__panel">
        <h2 className="modal__title">Rolled a 7 — discard {owed}</h2>
        <p className="lobby__hint">{player.name}, you're holding more than 7 cards.</p>
        <div className="discard__grid">
          {RESOURCES.map((r) => (
            <Fragment key={r}>
              <span className="offer__res">
                {RESOURCE_ICON[r]}
                <small>{player.hand[r]}</small>
              </span>
              <Stepper
                value={picks[r] ?? 0}
                max={player.hand[r]}
                onChange={(n) => setPicks({ ...picks, [r]: n })}
              />
            </Fragment>
          ))}
        </div>
        <button className="btn btn--primary" disabled={total !== owed} onClick={() => onDiscard(picks)}>
          Discard {total}/{owed}
        </button>
      </div>
    </div>
  )
}

function bundleText(b: Bundle): string {
  const parts = Object.entries(b)
    .filter(([, n]) => n)
    .map(([res, n]) => `${n}${RESOURCE_ICON[res as Resource]}`)
  return parts.length ? parts.join(' ') : '—'
}

function Stepper({
  value,
  max,
  onChange,
}: {
  value: number
  max?: number
  onChange: (n: number) => void
}) {
  return (
    <span className="stepper">
      <button className="stepper__btn" disabled={value === 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="stepper__n">{value}</span>
      <button
        className="stepper__btn"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </span>
  )
}

interface OfferComposerProps {
  player: Player
  players: Player[]
  onCancel: () => void
  onPropose: (offer: TradeOffer) => void
}

/** Build an offer: what you put up, what you want, and who it goes to. */
export function OfferComposer({ player, players, onCancel, onPropose }: OfferComposerProps) {
  const [give, setGive] = useState<Bundle>({})
  const [want, setWant] = useState<Bundle>({})
  const [to, setTo] = useState<PlayerId | 'any'>('any')

  const others = players.filter((p) => p.id !== player.id)
  const valid = !isEmptyBundle(give) && !isEmptyBundle(want)

  return (
    <div className="modal">
      <div className="modal__panel">
        <h2 className="modal__title">Propose a trade</h2>

        <div className="offer__grid">
          <span className="offer__head" />
          <span className="offer__head">You give</span>
          <span className="offer__head">You want</span>
          {RESOURCES.map((r) => (
            <Fragment key={r}>
              <span className="offer__res">
                {RESOURCE_ICON[r]}
                <small>{player.hand[r]}</small>
              </span>
              <Stepper
                value={give[r] ?? 0}
                max={player.hand[r]}
                onChange={(n) => setGive({ ...give, [r]: n })}
              />
              <Stepper value={want[r] ?? 0} onChange={(n) => setWant({ ...want, [r]: n })} />
            </Fragment>
          ))}
        </div>

        <div className="offer__to">
          <span className="trade__label">To:</span>
          <button
            className={`swap${to === 'any' ? ' swap--on' : ''}`}
            onClick={() => setTo('any')}
          >
            Anyone
          </button>
          {others.map((p) => (
            <button
              key={p.id}
              className={`swap${to === p.id ? ' swap--on' : ''}`}
              onClick={() => setTo(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="modal__actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!valid}
            onClick={() => onPropose({ from: player.id, to, give, want, declinedBy: [] })}
          >
            Propose
          </button>
        </div>
      </div>
    </div>
  )
}

interface OfferResponseProps {
  offer: TradeOffer
  players: Player[]
  onAccept: (responder: PlayerId) => void
  onDecline: () => void
}

/** Hot-seat: pass the device, the named player answers. */
export function OfferResponse({ offer, players, onAccept, onDecline }: OfferResponseProps) {
  const proposer = players.find((p) => p.id === offer.from)!
  const responders = players.filter(
    (p) =>
      (offer.to === 'any' ? p.id !== offer.from : p.id === offer.to) &&
      !offer.declinedBy.includes(p.id),
  )

  return (
    <div className="modal">
      <div className="modal__panel">
        <h2 className="modal__title">
          {proposer.name} wants to trade {bundleText(offer.give)} for {bundleText(offer.want)}
        </h2>
        <div className="offer__responders">
          {responders.map((p) => {
            const able = hasCards(p, offer.want)
            return (
              <button
                key={p.id}
                className="btn btn--primary"
                disabled={!able}
                onClick={() => onAccept(p.id)}
              >
                <span className="btn__label">{p.name} accepts</span>
                {!able && <span className="btn__cost">not enough cards</span>}
              </button>
            )
          })}
        </div>
        <button className="btn" onClick={onDecline}>
          Decline
        </button>
      </div>
    </div>
  )
}

/**
 * Non-blocking: the proposer can see their offer is still out there and keep
 * playing while it waits, instead of it vanishing the moment they hit Propose.
 */
export function PendingOffer({
  offer,
  players,
  onCancel,
}: {
  offer: TradeOffer
  players: Player[]
  onCancel: () => void
}) {
  const waitingOn = players.filter(
    (p) =>
      (offer.to === 'any' ? p.id !== offer.from : p.id === offer.to) &&
      !offer.declinedBy.includes(p.id),
  )
  return (
    <div className="pending-offer">
      <span className="pending-offer__text">
        Offered {bundleText(offer.give)} for {bundleText(offer.want)} —{' '}
        {waitingOn.map((p) => p.name).join(', ')} to answer
      </span>
      <button className="btn btn--ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

interface ActionBarProps {
  player: Player
  mode: BuildKind | 'robber' | null
  hasRolled: boolean
  /** Hidden in a solo game — nobody to trade with. */
  canOffer: boolean
  onBuild: (kind: BuildKind) => void
  onRoll: () => void
  onEndTurn: () => void
  onCancel: () => void
  onOffer: () => void
}

export function ActionBar({
  player,
  mode,
  hasRolled,
  canOffer,
  onBuild,
  onRoll,
  onEndTurn,
  onCancel,
  onOffer,
}: ActionBarProps) {
  const kinds: BuildKind[] = ['road', 'settlement', 'city']
  return (
    <div className={`actions${!hasRolled ? ' actions--roll' : ''}`}>
      {!hasRolled ? (
        <button className="btn btn--roll" onClick={onRoll}>
          <span className="btn__roll-icon">🎲</span>
          Roll dice
        </button>
      ) : (
        <>
          {kinds.map((k) => (
            <button
              key={k}
              className={`btn${mode === k ? ' btn--on' : ''}`}
              disabled={!canAfford(player, k)}
              onClick={() => (mode === k ? onCancel() : onBuild(k))}
              title={`${BUILD_LABEL[k]}: ${costLabel(k)}`}
            >
              <PieceIcon kind={k} color={player.color} dark={player.dark} />
            </button>
          ))}
          {canOffer && (
            <button className="btn btn--trade" onClick={onOffer} disabled={mode === 'robber'}>
              Trade
            </button>
          )}
          <button className="btn btn--primary" onClick={onEndTurn} disabled={mode === 'robber'}>
            End turn
          </button>
        </>
      )}
    </div>
  )
}
