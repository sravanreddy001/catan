import { Fragment, useState } from 'react'
import type { GameSettings } from '../game/engine'
import type { AIPreset } from '../game/ai'
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

/** Display bank resource supply. */
export function BankSupply({ bank }: { bank: Record<Resource, number> }) {
  return (
    <div className="hand" style={{ opacity: 0.7, fontSize: '0.85rem' }}>
      {RESOURCES.map((r) => (
        <div key={r} className="stack" title={`Bank has ${bank[r]} ${r}`}>
          <div className="minicard">
            {RESOURCE_ICON[r]}
            <span className="minicard__count">{bank[r]}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

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
  vpTarget = 10,
}: {
  players: Player[]
  current: number
  largestArmy: PlayerId | null
  longestRoad: PlayerId | null
  vpTarget?: number
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
          <span className="chip__vp">{victoryPoints(p, largestArmy, longestRoad)} / {vpTarget}</span>
        </div>
      ))}
    </div>
  )
}

/** Settings indicator chip showing active non-default settings. */
export function SettingsChip({ settings, botPresets = {} }: { settings: GameSettings; botPresets?: Record<number, AIPreset> }) {
  const [expanded, setExpanded] = useState(false)
  const hasNonDefaultSettings =
    settings.publicHands ||
    settings.vpTarget !== 10 ||
    settings.bankPreset !== 'standard' ||
    settings.santaMode ||
    settings.speedMode
  const hasActiveBotPresets = Object.values(botPresets).some((p) => p !== null)
  const hasNonDefault = hasNonDefaultSettings || hasActiveBotPresets

  if (!hasNonDefault) return null

  const presetEmojis: Record<string, string> = {
    aggressive: '⚔️',
    economic: '💰',
    turtle: '🐢',
  }

  const bankPresetLabel = {
    standard: 'Standard (19)',
    scarce: 'Scarce (12)',
    veryScarce: 'Very Scarce (9)',
  }

  return (
    <>
      <button
        className="chip"
        style={{ cursor: 'pointer', fontSize: '0.8rem' }}
        onClick={() => setExpanded(!expanded)}
        title="Active game settings"
      >
        <span>⚙️</span>
        {settings.publicHands && <span title="Public hands mode">👁️</span>}
        {settings.vpTarget !== 10 && <span title={`VP target: ${settings.vpTarget}`}>🎯</span>}
        {settings.bankPreset !== 'standard' && <span title={`Bank: ${bankPresetLabel[settings.bankPreset]}`}>🏦</span>}
        {settings.santaMode && <span title="Santa mode">🎅</span>}
        {settings.speedMode && <span title="Speed mode">⚡</span>}
        {hasActiveBotPresets && Object.entries(botPresets).map(([seat, preset]) => {
          if (!preset) return null
          return <span key={seat} title={`Bot ${seat}: ${preset}`}>{presetEmojis[preset]}</span>
        })}
      </button>

      {expanded && (
        <div className="modal" onClick={() => setExpanded(false)}>
          <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Game settings</h2>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.8' }}>
              {settings.publicHands && <div>✓ Public hands: all players' cards visible</div>}
              {settings.vpTarget !== 10 && <div>✓ VP target: {settings.vpTarget} points to win</div>}
              {settings.bankPreset !== 'standard' && <div>✓ Bank preset: {bankPresetLabel[settings.bankPreset]}</div>}
              {settings.santaMode && <div>✓ Santa mode: friendly variant (no robber)</div>}
              {settings.speedMode && <div>✓ Speed mode: auto-placed setup, 2 rolls per turn</div>}
              {hasActiveBotPresets && (
                <>
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                    <strong>AI personalities:</strong>
                  </div>
                  {Object.entries(botPresets).map(([seat, preset]) => preset && (
                    <div key={seat}>
                      {presetEmojis[preset]} Bot {seat}: {preset}
                    </div>
                  ))}
                </>
              )}
            </div>
            <button className="btn" onClick={() => setExpanded(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
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

function totalCount(b: Bundle): number {
  return Object.values(b).reduce<number>((sum, n) => sum + (n ?? 0), 0)
}

/** Their/your resource picker: tap to add one to the draft. */
function PickCell({
  icon,
  count,
  disabled,
  onClick,
}: {
  icon: string
  count?: number
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="trade-cell trade-cell--pick" disabled={disabled} onClick={onClick}>
      <span className="trade-cell__icon">{icon}</span>
      {count !== undefined && <span className="trade-cell__count">{count}</span>}
    </button>
  )
}

/** A staged want/give cell: tap to remove one. Dim once empty. */
function StageCell({
  icon,
  n,
  tone,
  onRemove,
}: {
  icon: string
  n: number
  tone: 'want' | 'give'
  onRemove: () => void
}) {
  const filled = n > 0
  return (
    <button
      type="button"
      className={`trade-cell trade-cell--${tone} ${filled ? 'trade-cell--filled' : 'trade-cell--empty'}`}
      disabled={!filled}
      onClick={onRemove}
    >
      <span className="trade-cell__icon">{icon}</span>
      {filled && <span className="trade-cell__count">&times;{n}</span>}
    </button>
  )
}

function ReadonlyCell({ icon, n, tone }: { icon: string; n: number; tone: 'want' | 'give' }) {
  const filled = n > 0
  return (
    <div className={`trade-cell trade-cell--${tone} ${filled ? 'trade-cell--filled' : 'trade-cell--empty'}`}>
      <span className="trade-cell__icon">{icon}</span>
      {filled && <span className="trade-cell__count">&times;{n}</span>}
    </div>
  )
}

interface OfferComposerProps {
  player: Player
  players: Player[]
  /** Panel is on-screen. When false and a draft is staged, a reopen pill shows instead. */
  visible: boolean
  onDismiss: () => void
  onReopen: () => void
  onCancel: () => void
  onPropose: (offer: TradeOffer) => void
}

/** Build an offer: tap their resources to want them, yours to give them up. */
export function OfferComposer({
  player,
  players,
  visible,
  onDismiss,
  onReopen,
  onCancel,
  onPropose,
}: OfferComposerProps) {
  const [give, setGive] = useState<Bundle>({})
  const [want, setWant] = useState<Bundle>({})
  const [to, setTo] = useState<PlayerId | 'any'>('any')

  const others = players.filter((p) => p.id !== player.id)
  const valid = !isEmptyBundle(give) && !isEmptyBundle(want)
  const staged = totalCount(give) + totalCount(want)

  const addWant = (r: Resource) => setWant((w) => ({ ...w, [r]: (w[r] ?? 0) + 1 }))
  const removeWant = (r: Resource) => setWant((w) => ({ ...w, [r]: Math.max(0, (w[r] ?? 0) - 1) }))
  const addGive = (r: Resource) => setGive((g) => ({ ...g, [r]: (g[r] ?? 0) + 1 }))
  const removeGive = (r: Resource) => setGive((g) => ({ ...g, [r]: Math.max(0, (g[r] ?? 0) - 1) }))
  const reset = () => {
    setGive({})
    setWant({})
    setTo('any')
  }

  if (!visible) {
    if (staged === 0) return null
    return (
      <button className="trade-reopen" onClick={onReopen}>
        Trade ({staged} staged)
      </button>
    )
  }

  return (
    <div
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div className="modal__panel">
        <div className="trade-head">
          <h2 className="modal__title">Trade</h2>
          <button className="trade-close" onClick={onDismiss} aria-label="Dismiss">
            &times;
          </button>
        </div>

        <span className="trade-eyebrow">Theirs</span>
        <div className="trade-grid">
          {RESOURCES.map((r) => (
            <PickCell key={r} icon={RESOURCE_ICON[r]} onClick={() => addWant(r)} />
          ))}
        </div>

        <span className="trade-eyebrow trade-eyebrow--want">Want</span>
        <div className="trade-grid">
          {RESOURCES.map((r) => (
            <StageCell
              key={r}
              icon={RESOURCE_ICON[r]}
              n={want[r] ?? 0}
              tone="want"
              onRemove={() => removeWant(r)}
            />
          ))}
        </div>

        <hr className="trade-divider" />

        <span className="trade-eyebrow trade-eyebrow--give">Give</span>
        <div className="trade-grid">
          {RESOURCES.map((r) => (
            <StageCell
              key={r}
              icon={RESOURCE_ICON[r]}
              n={give[r] ?? 0}
              tone="give"
              onRemove={() => removeGive(r)}
            />
          ))}
        </div>

        <span className="trade-eyebrow">Yours</span>
        <div className="trade-grid">
          {RESOURCES.map((r) => (
            <PickCell
              key={r}
              icon={RESOURCE_ICON[r]}
              count={player.hand[r]}
              disabled={(give[r] ?? 0) >= player.hand[r]}
              onClick={() => addGive(r)}
            />
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
          <button
            className="btn"
            onClick={() => {
              reset()
              onCancel()
            }}
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!valid}
            onClick={() => {
              onPropose({ from: player.id, to, give, want, declinedBy: [] })
              reset()
            }}
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
        <h2 className="modal__title">{proposer.name} offered a trade</h2>

        <span className="trade-eyebrow trade-eyebrow--want">You&apos;d get</span>
        <div className="trade-grid">
          {RESOURCES.map((r) => (
            <ReadonlyCell key={r} icon={RESOURCE_ICON[r]} n={offer.give[r] ?? 0} tone="want" />
          ))}
        </div>

        <span className="trade-eyebrow trade-eyebrow--give">You&apos;d give</span>
        <div className="trade-grid">
          {RESOURCES.map((r) => (
            <ReadonlyCell key={r} icon={RESOURCE_ICON[r]} n={offer.want[r] ?? 0} tone="give" />
          ))}
        </div>

        <div className="offer__responders">
          {responders.map((p) => {
            const able = hasCards(p, offer.want)
            return (
              <button
                key={p.id}
                className="btn btn--accept"
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
