import { useState, useEffect } from 'react'
import { PIECE_LIMITS, type GameSettings } from '../game/engine'
import type { AIPreset } from '../game/ai'
import type { Resource } from '../game/board'
import {
  BUILD_LABEL,
  COSTS,
  DEV_COST,
  DEV_ICON,
  DEV_LABEL,
  DEV_RULE,
  MERCHANT_LIMIT,
  RESOURCES,
  RESOURCE_ICON,
  canAfford,
  hasCards,
  isEmptyBundle,
  formatVP,
  scoreBreakdown,
  type BuildKind,
  type DevCard,
  type DevKind,
  type Player,
  type PlayerId,
  type TradeOffer,
} from '../game/players'

/** Close modals on Escape key */
function useEscapeKey(callback?: () => void) {
  useEffect(() => {
    if (!callback) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        callback()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [callback])
}

/** Display bank resource supply. */
export function BankSupply({ bank }: { bank: Record<Resource, number> }) {
  return (
    <div className="hand" style={{ opacity: 0.85 }}>
      {RESOURCES.map((r) => (
        <div key={r} className="stack" title={`Bank has ${bank[r]} ${r}`}>
          <div className={`minicard minicard--${r}`}>
            <span className="minicard__icon">{RESOURCE_ICON[r]}</span>
            <span className="minicard__count">{bank[r]}</span>
          </div>
          <span className="minicard__label">{r}</span>
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
  size = 32,
}: {
  kind: BuildKind
  color?: string
  dark?: string
  size?: number
}) {
  if (kind === 'road') {
    return (
      <svg width={size} height={size} viewBox="-14 -14 28 28">
        <line x1="-9" y1="7" x2="9" y2="-7" stroke={color} strokeWidth="6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="-14 -14 28 28">
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
  endless = false,
}: {
  players: Player[]
  current: number
  largestArmy: PlayerId | null
  longestRoad: PlayerId | null
  vpTarget?: number
  /** Endless games have no target, so scores are shown as running totals. */
  endless?: boolean
}) {
  const outOf = endless ? '' : ` / ${vpTarget}`
  return (
    <div className="strip">
      {players.map((p) => {
        const breakdown = scoreBreakdown(p, largestArmy, longestRoad)
        const tooltipTitle = `${p.name}'s Score Breakdown:
• Settlements: ${breakdown.settlements} (${breakdown.settlementPoints} VP)
• Cities: ${breakdown.cities} (${breakdown.cityPoints} VP)${breakdown.devCardPoints > 0 ? `\n• Victory Point Cards: ${breakdown.devCardPoints} VP` : ''}${breakdown.largestArmy ? '\n• Largest Army: 2 VP' : ''}${breakdown.longestRoad ? '\n• Longest Road: 2 VP' : ''}
Total: ${formatVP(breakdown.total)}${outOf} VP`

        return (
          <div
            key={p.id}
            className={`chip${p.id === current ? ' chip--active' : ''}`}
            style={{ '--c': p.color } as React.CSSProperties}
            title={tooltipTitle}
            tabIndex={0}
          >
            <span className="chip__dot" />
            <span className="chip__name">{p.name}</span>
            {largestArmy === p.id && <span title="Largest army (2 VP)">⚔️</span>}
            {longestRoad === p.id && <span title="Longest road (2 VP)">🛣️</span>}
            <span className="chip__vp">
              {formatVP(breakdown.total)}{outOf}
            </span>

            <div className="chip__tooltip">
              <div className="chip__tooltip-title">{p.name}'s Score</div>
              <div className="chip__tooltip-row">
                <span>Settlements ({breakdown.settlements})</span>
                <span>{breakdown.settlementPoints} VP</span>
              </div>
              <div className="chip__tooltip-row">
                <span>Cities ({breakdown.cities})</span>
                <span>{breakdown.cityPoints} VP</span>
              </div>
              {breakdown.devCardPoints > 0 && (
                <div className="chip__tooltip-row">
                  <span>Dev Cards</span>
                  <span>{breakdown.devCardPoints} VP</span>
                </div>
              )}
              {breakdown.largestArmy && (
                <div className="chip__tooltip-row">
                  <span>Largest Army</span>
                  <span>2 VP</span>
                </div>
              )}
              {breakdown.longestRoad && (
                <div className="chip__tooltip-row">
                  <span>Longest Road</span>
                  <span>2 VP</span>
                </div>
              )}
              <div className="chip__tooltip-total">
                <span>Total</span>
                <span>{formatVP(breakdown.total)}{outOf}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Settings indicator chip showing active non-default settings. */
export function SettingsChip({ settings, botPresets = {} }: { settings: GameSettings; botPresets?: Record<number, AIPreset> }) {
  const [expanded, setExpanded] = useState(false)
  useEscapeKey(expanded ? () => setExpanded(false) : undefined)

  const hasNonDefaultSettings =
    settings.publicHands ||
    settings.vpTarget !== 10 ||
    settings.bankPreset !== 'standard' ||
    settings.santaMode ||
    settings.speedMode ||
    settings.newDevCards ||
    settings.draftDevCards ||
    settings.endless
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
        aria-label="Active game settings"
      >
        <span>⚙️</span>
        {settings.publicHands && <span title="Public hands mode">👁️</span>}
        {!settings.endless && settings.vpTarget !== 10 && <span title={`VP target: ${settings.vpTarget}`}>🎯</span>}
        {settings.bankPreset !== 'standard' && <span title={`Bank: ${bankPresetLabel[settings.bankPreset]}`}>🏦</span>}
        {settings.santaMode && <span title="Santa mode">🎅</span>}
        {settings.speedMode && <span title="Speed mode">⚡</span>}
        {settings.newDevCards && <span title="Expanded dev card deck">🃏</span>}
        {settings.draftDevCards && <span title="Dev card drafting">🎴</span>}
        {settings.endless && <span title="Endless mode">♾️</span>}
        {hasActiveBotPresets && Object.entries(botPresets).map(([seat, preset]) => {
          if (!preset) return null
          return <span key={seat} title={`Bot ${seat}: ${preset}`}>{presetEmojis[preset]}</span>
        })}
      </button>

      {expanded && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          onClick={() => setExpanded(false)}
        >
          <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
            <h2 id="settings-dialog-title" className="modal__title">Game settings</h2>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.8' }}>
              {settings.publicHands && <div>✓ Public hands: all players' cards visible</div>}
              {settings.endless
                ? <div>✓ Endless: no target — play until the board fills up</div>
                : settings.vpTarget !== 10 && <div>✓ VP target: {settings.vpTarget} points to win</div>}
              {settings.bankPreset !== 'standard' && <div>✓ Bank preset: {bankPresetLabel[settings.bankPreset]}</div>}
              {settings.santaMode && <div>✓ Santa mode: friendly variant (no robber)</div>}
              {settings.speedMode && <div>✓ Speed mode: auto-placed setup, 2 rolls per turn</div>}
              {settings.newDevCards && <div>✓ New dev cards: Merchant, Trailblazer, Diplomat, Merit — fewer knights</div>}
              {settings.draftDevCards && <div>✓ Dev card drafting: buying reveals three, you pick one</div>}
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
            <div className={`minicard minicard--${r}${n === 0 ? ' minicard--empty' : ''}`}>
              <span className="minicard__icon">{RESOURCE_ICON[r]}</span>
              {n > 0 && <span className="minicard__count">{n}</span>}
            </div>
            <span className="minicard__label">{r}</span>
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
  disabled?: boolean
}

/** Bank / harbour trade: pick what to give, then what to take. */
export function TradeBar({ player, rates, onTrade, disabled = false }: TradeBarProps) {
  const [give, setGive] = useState<Resource | null>(null)

  const affordable = (r: Resource) => !disabled && player.hand[r] >= rates[r]
  const hasAnyAffordable = RESOURCES.some((r) => player.hand[r] >= rates[r])

  return (
    <div className={`trade${disabled || !hasAnyAffordable ? ' trade--disabled' : ''}`}>
      <span className="trade__label">{give ? `Give ${rates[give]} ${give} for:` : 'Trade:'}</span>
      <div className="trade__row">
        {RESOURCES.map((r) => {
          const selecting = give === null
          const isBtnDisabled = disabled || (selecting ? !affordable(r) : r === give)
          return (
            <button
              key={r}
              className={`swap${give === r ? ' swap--on' : ''}`}
              disabled={isBtnDisabled}
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
        {give && !disabled && (
          <button className="swap swap--cancel" onClick={() => setGive(null)} aria-label="Cancel selection">
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

/**
 * Spoken form of a build cost. The visible label is a row of resource emoji,
 * which a screen reader reads as "brick brick" or not at all, so the
 * accessible name spells the cost out in words instead.
 */
function costSpoken(kind: BuildKind): string {
  const parts = Object.entries(COSTS[kind]).map(([res, n]) => `${n} ${res}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
}

const BUILD_KINDS: BuildKind[] = ['road', 'settlement', 'city']

/** What each piece and a dev card costs — the icon-only build buttons need this spelled out somewhere. */
export function BuildGuide({ onClose, bank }: { onClose: () => void; bank?: Record<Resource, number> }) {
  useEscapeKey(onClose)
  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-guide-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal__panel">
        <h2 id="build-guide-title" className="modal__title">What things cost</h2>
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
        {bank && (
          <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)', textAlign: 'left' }}>
              Bank supply
            </h3>
            <BankSupply bank={bank} />
          </div>
        )}
        <button className="btn" onClick={onClose} style={{ marginTop: '1rem' }}>
          Close
        </button>
      </div>
    </div>
  )
}

/**
 * Your development cards. Buying one moved into the build row — it is a fourth
 * purchase, not a separate concept — so this is now only the cards you hold.
 */
interface DevBarProps {
  player: Player
  busy: boolean
  playedThisTurn: boolean
  disabled?: boolean
  onPlay: (card: DevCard) => void
  onGuide: () => void
}

/** The four kinds only dealt when the expanded deck is on, tinted to stand out. */
const EXTRA_KINDS: DevKind[] = ['merchant', 'trailblazer', 'diplomat', 'merit']

/** Matches the emoji cost strings the three build buttons carry. */
export const DEV_COST_LABEL = '🐑🌾⛰️'

export function DevBar({
  player,
  busy,
  playedThisTurn,
  disabled = false,
  onPlay,
  onGuide,
}: DevBarProps) {
  return (
    <div className={`devbar${disabled ? ' devbar--disabled' : ''}`}>
      <button
        className="btn btn--icon-only"
        onClick={onGuide}
        title="What do the cards do?"
        aria-label="Development card guide — what each card does"
      >
        ❓
      </button>
      <div className="devbar__cards">
        {player.devCards.length === 0 && <span className="devbar__empty">no cards</span>}
        {player.devCards.map((c) => {
          const playable = !disabled && c.kind !== 'victory' && c.ready && !playedThisTurn && !busy && !c.spent
          const classes = [
            'devcard',
            c.ready ? '' : 'devcard--new',
            EXTRA_KINDS.includes(c.kind) ? 'devcard--kind-new' : '',
            c.kind === 'diplomat' && player.shielded ? 'devcard--shield' : '',
          ]
          return (
            <button
              key={c.id}
              className={classes.filter(Boolean).join(' ')}
              disabled={!playable}
              title={c.kind === 'victory' ? 'Counts towards victory automatically' : DEV_RULE[c.kind]}
              onClick={() => onPlay(c)}
            >
              <span>{DEV_ICON[c.kind]}</span>
              <span className="devcard__label">
                {DEV_LABEL[c.kind]}
                {c.spent ? ' · used' : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Confirm step shown when a card is tapped. Nine kinds is more than anyone
 * holds in their head, so a card states what it does before it resolves —
 * which also means no card is ever spent by a stray tap.
 */
export function DevCardSheet({
  card,
  deckCount,
  onPlay,
  onCancel,
}: {
  card: DevCard
  deckCount: number
  onPlay: () => void
  onCancel: () => void
}) {
  useEscapeKey(onCancel)
  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cardsheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal__panel">
        <div className="cardsheet">
          <div className="cardsheet__art">{DEV_ICON[card.kind]}</div>
          <div>
            <p id="cardsheet-title" className="cardsheet__name">{DEV_LABEL[card.kind]}</p>
            <p className="cardsheet__rule">{DEV_RULE[card.kind]}</p>
            <p className="cardsheet__meta">{deckCount} cards left in the deck</p>
          </div>
        </div>
        <div className="modal__actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={onPlay}>
            Play {DEV_LABEL[card.kind]}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The draft: the cards a purchase revealed, one of which must be taken. There
 * is deliberately no cancel — the cost is already paid by the time this opens,
 * and the cards are off the deck until a pick puts the rest back.
 */
export function DraftPicker({
  options,
  deckCount,
  onPick,
}: {
  options: DevKind[]
  deckCount: number
  onPick: (index: number) => void
}) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="draft-title">
      <div className="modal__panel">
        <h2 id="draft-title" className="modal__title">
          {options.length === 1 ? 'Last card in the deck' : `Pick one of ${options.length}`}
        </h2>
        <p className="draft__hint">
          The ones you leave go to the bottom of the deck — delayed, not gone.
        </p>
        <div className="draft__options">
          {options.map((kind, i) => (
            <button key={`${kind}-${i}`} className="draft__card" onClick={() => onPick(i)}>
              <span className="draft__art">{DEV_ICON[kind]}</span>
              <span className="draft__name">{DEV_LABEL[kind]}</span>
              <span className="draft__rule">{DEV_RULE[kind]}</span>
            </button>
          ))}
        </div>
        <p className="cardsheet__meta">{deckCount} cards left in the deck</p>
      </div>
    </div>
  )
}

/** Every kind in the current deck, with its rule and how many are left. */
export function DevCardGuide({
  deck,
  onClose,
}: {
  deck: DevKind[]
  onClose: () => void
}) {
  useEscapeKey(onClose)
  const kinds = (Object.keys(DEV_LABEL) as DevKind[]).filter(
    (k) => !EXTRA_KINDS.includes(k) || deck.includes(k),
  )
  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-guide-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal__panel">
        <div className="trade-head">
          <h2 id="card-guide-title" className="modal__title">Development cards</h2>
          <button className="trade-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="guide guide--scroll">
          {kinds.map((k) => (
            <div
              key={k}
              className={`guide__row${EXTRA_KINDS.includes(k) ? ' guide__row--new' : ''}`}
            >
              <span className="guide__piece">{DEV_ICON[k]}</span>
              <span className="guide__name">
                {DEV_LABEL[k]}
                <span className="guide__rule">{DEV_RULE[k]}</span>
              </span>
              <span className="guide__cost">{deck.filter((d) => d === k).length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type MerchantBaskets = { give: Bundle; get: Bundle }

/**
 * Merchant: three independent 1:1 swaps resolved as one transaction, so both
 * baskets fill freely across resource types and only the totals have to match.
 */
export function MerchantPanel({
  baskets,
  player,
  bank,
  onPick,
  onConfirm,
  onCancel,
}: {
  baskets: MerchantBaskets
  player: Player
  bank: Record<Resource, number>
  onPick: (side: 'give' | 'get', res: Resource, delta: number) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  useEscapeKey(onCancel)
  const total = (b: Bundle) => Object.values(b).reduce((sum, n) => sum + (n ?? 0), 0)
  const given = total(baskets.give)
  const taken = total(baskets.get)
  const balanced = given > 0 && given === taken

  const row = (side: 'give' | 'get') =>
    RESOURCES.map((r) => {
      const n = baskets[side][r] ?? 0
      const cap = side === 'give' ? player.hand[r] : bank[r]
      const full = given >= MERCHANT_LIMIT && side === 'give' && n === 0
      return (
        <button
          key={r}
          className={`trade-cell trade-cell--${side === 'give' ? 'give' : 'want'}${
            n > 0 ? ' trade-cell--filled' : ' trade-cell--pick'
          }`}
          disabled={cap === 0 || full}
          onClick={() => onPick(side, r, 1)}
          onContextMenu={(e) => {
            e.preventDefault()
            onPick(side, r, -1)
          }}
        >
          <span className="trade-cell__icon">{RESOURCE_ICON[r]}</span>
          <span className="trade-cell__count">{n > 0 ? n : cap}</span>
        </button>
      )
    })

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merchant-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal__panel">
        <div className="trade-head">
          <h2 id="merchant-modal-title" className="modal__title">{DEV_ICON.merchant} Merchant</h2>
          <button className="trade-close" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="cardsheet__rule">{DEV_RULE.merchant}</p>

        <span className="trade-eyebrow trade-eyebrow--give">
          Give <span>{given} / {MERCHANT_LIMIT}</span>
        </span>
        <div className="trade-grid">{row('give')}</div>

        <span className="trade-eyebrow trade-eyebrow--want">
          Get <span>{taken} / {given || MERCHANT_LIMIT}</span>
        </span>
        <div className="trade-grid">{row('get')}</div>

        <div className="modal__actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={!balanced} onClick={onConfirm}>
            {balanced ? `Swap ${given}` : given > taken ? `Pick ${given - taken} more` : 'Pick cards'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Pick one or more resources — used by monopoly and year of plenty. */
export function ResourcePicker({
  title,
  hint,
  counts,
  onPick,
  onCancel,
}: {
  title: string
  hint?: string
  /** Your own hand, shown on each swatch so the pick is an informed one. */
  counts?: Record<Resource, number>
  onPick: (r: Resource) => void
  onCancel?: () => void
}) {
  useEscapeKey(onCancel)
  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-picker-title"
      onClick={(e) => {
        if (onCancel && e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal__panel">
        <h2 id="resource-picker-title" className="modal__title">{title}</h2>
        {hint && <p className="lobby__hint">{hint}</p>}
        <div className="trade__row">
          {RESOURCES.map((r) => (
            <button key={r} className="swap" onClick={() => onPick(r)}>
              <span>{RESOURCE_ICON[r]}</span>
              {counts && <span className="swap__have">{counts[r]}</span>}
            </button>
          ))}
        </div>
        {counts && <p className="lobby__hint">Numbers are the cards you already hold.</p>}
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
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="discard-title">
      <div className="modal__panel">
        <h2 id="discard-title" className="modal__title">Rolled a 7 — discard {owed}</h2>
        <p className="lobby__hint">{player.name}, you&apos;re holding more than 7 cards.</p>

        {/*
          * Same grid as the trade composer, two rows: what is going back to
          * the bank on top, what is left in your hand underneath, a resource
          * holding one column across both. Tap down to add, tap up to undo.
          */}
        <div className="pickgrid">
          <span className="pickgrid__eyebrow pickgrid__eyebrow--give">
            Discarding ({total}/{owed})
          </span>
          {RESOURCES.map((r) => {
            const n = picks[r] ?? 0
            return (
              <button
                key={`discard-${r}`}
                className={`pickgrid__cell pickgrid__cell--give${n > 0 ? ' pickgrid__cell--on' : ''}`}
                disabled={n === 0}
                aria-label={`Discarding ${n} ${r} — tap to keep one`}
                onClick={() => setPicks((p) => ({ ...p, [r]: Math.max(0, (p[r] ?? 0) - 1) }))}
              >
                <span className="pickgrid__icon">{RESOURCE_ICON[r]}</span>
                <span className="pickgrid__count">{n}</span>
              </button>
            )
          })}

          <span className="pickgrid__eyebrow">Your hand — tap to discard</span>
          {RESOURCES.map((r) => {
            const held = player.hand[r] ?? 0
            const n = picks[r] ?? 0
            const left = held - n
            return (
              <button
                key={`keep-${r}`}
                className="pickgrid__pick"
                disabled={left === 0 || total >= owed}
                aria-label={`Discard one ${r} — ${left} left in hand`}
                onClick={() => setPicks((p) => ({ ...p, [r]: Math.min(held, (p[r] ?? 0) + 1) }))}
              >
                <span className="pickgrid__icon">{RESOURCE_ICON[r]}</span>
                <span className="pickgrid__count">{left}</span>
              </button>
            )
          })}
        </div>

        <button className="btn btn--primary btn--discard" disabled={total !== owed} onClick={() => onDiscard(picks)}>
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


function totalCount(b: Bundle): number {
  return Object.values(b).reduce<number>((sum, n) => sum + (n ?? 0), 0)
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

/**
 * Player-to-player trade composer: four rows over five fixed resource
 * columns — want picks, staged want, staged give, give picks.
 */
export function OfferComposer({
  player,
  players,
  visible,
  onDismiss,
  onReopen,
  onCancel,
  onPropose,
}: OfferComposerProps) {
  useEscapeKey(visible ? onDismiss : undefined)
  const [give, setGive] = useState<Bundle>({})
  const [want, setWant] = useState<Bundle>({})
  const [to, setTo] = useState<PlayerId | 'any'>('any')

  const others = players.filter((p) => p.id !== player.id)
  const valid = !isEmptyBundle(give) && !isEmptyBundle(want)
  const staged = totalCount(give) + totalCount(want)

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
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-composer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div className="modal__panel modal__panel--trade">
        <div className="trade-head">
          <h2 id="trade-composer-title" className="modal__title">Propose trade</h2>
          <button className="trade-close" onClick={onDismiss} aria-label="Dismiss trade dialog">
            &times;
          </button>
        </div>

        {/*
          * Four rows over five fixed resource columns: pick what you want, see
          * it, see what you are giving, pick what you give. A resource keeps
          * the same column in all four rows, so a trade reads as two vertical
          * pairs instead of two lists that have to be matched up by icon.
          */}
        <div className="pickgrid">
          <span className="pickgrid__eyebrow pickgrid__eyebrow--want">Pick what you want</span>
          {RESOURCES.map((r) => (
            <button
              key={`want-pick-${r}`}
              className="pickgrid__pick"
              aria-label={`Ask for one more ${r}`}
              onClick={() => setWant((w) => ({ ...w, [r]: (w[r] ?? 0) + 1 }))}
            >
              <span className="pickgrid__icon">{RESOURCE_ICON[r]}</span>
            </button>
          ))}

          <span className="pickgrid__eyebrow">You get ({totalCount(want)})</span>
          {RESOURCES.map((r) => {
            const n = want[r] ?? 0
            return (
              <button
                key={`want-cell-${r}`}
                className={`pickgrid__cell pickgrid__cell--want${n > 0 ? ' pickgrid__cell--on' : ''}`}
                disabled={n === 0}
                aria-label={`Asking for ${n} ${r} — tap to remove one`}
                onClick={() => setWant((w) => ({ ...w, [r]: Math.max(0, (w[r] ?? 0) - 1) }))}
              >
                <span className="pickgrid__icon">{RESOURCE_ICON[r]}</span>
                <span className="pickgrid__count">{n}</span>
              </button>
            )
          })}

          <span className="pickgrid__eyebrow">You give ({totalCount(give)})</span>
          {RESOURCES.map((r) => {
            const n = give[r] ?? 0
            return (
              <button
                key={`give-cell-${r}`}
                className={`pickgrid__cell pickgrid__cell--give${n > 0 ? ' pickgrid__cell--on' : ''}`}
                disabled={n === 0}
                aria-label={`Offering ${n} ${r} — tap to remove one`}
                onClick={() => setGive((g) => ({ ...g, [r]: Math.max(0, (g[r] ?? 0) - 1) }))}
              >
                <span className="pickgrid__icon">{RESOURCE_ICON[r]}</span>
                <span className="pickgrid__count">{n}</span>
              </button>
            )
          })}

          <span className="pickgrid__eyebrow pickgrid__eyebrow--give">Pick what you give</span>
          {RESOURCES.map((r) => {
            const held = player.hand[r] ?? 0
            const n = give[r] ?? 0
            return (
              <button
                key={`give-pick-${r}`}
                className="pickgrid__pick"
                disabled={n >= held}
                aria-label={`Offer one more ${r} — you hold ${held}`}
                onClick={() => setGive((g) => ({ ...g, [r]: Math.min(held, (g[r] ?? 0) + 1) }))}
              >
                <span className="pickgrid__icon">{RESOURCE_ICON[r]}</span>
                <span className="pickgrid__held">{held}</span>
              </button>
            )
          })}
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
            className="btn btn--primary btn--propose"
            disabled={!valid}
            onClick={() => {
              onPropose({ from: player.id, to, give, want, declinedBy: [] })
              reset()
            }}
          >
            {valid ? 'Propose trade' : 'Select cards to trade'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface OfferResponseProps {
  offer: TradeOffer
  players: Player[]
  /** Seats this device may answer for — bots decide for themselves. */
  answerable?: PlayerId[]
  /** Countdown on a bot's offer; null when no clock is running. */
  secondsLeft?: number | null
  onAccept: (responder: PlayerId) => void
  onDecline: () => void
}

/** Hot-seat: pass the device, the named player answers. */
/** Endless mode's "shall we stop?" vote. Every other player has to agree. */
export function EndVote({
  vote,
  players,
  answerable,
  onRespond,
}: {
  vote: { from: PlayerId; accepted: PlayerId[] }
  players: Player[]
  /** Seats this client may answer for — bots answer themselves. */
  answerable: PlayerId[]
  onRespond: (responder: PlayerId, accept: boolean) => void
}) {
  const proposer = players.find((p) => p.id === vote.from)!
  const pending = players.filter(
    (p) => p.id !== vote.from && !vote.accepted.includes(p.id) && answerable.includes(p.id),
  )
  if (pending.length === 0) return null
  const waiting = players.length - 1 - vote.accepted.length

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="end-vote-title">
      <div className="modal__panel">
        <h2 id="end-vote-title" className="modal__title">{proposer.name} wants to end the game</h2>
        <p className="draft__hint">
          Everyone has to agree. If you all do, the highest score wins. Waiting on {waiting}.
        </p>
        <div className="offer__responders">
          {pending.map((p) => (
            <button key={p.id} className="btn btn--accept" onClick={() => onRespond(p.id, true)}>
              {pending.length > 1 ? `${p.name} agrees` : 'End the game'}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => onRespond(pending[0].id, false)}>
          Keep playing
        </button>
      </div>
    </div>
  )
}

export function OfferResponse({ offer, players, answerable, secondsLeft, onAccept, onDecline }: OfferResponseProps) {
  useEscapeKey(onDecline)
  const proposer = players.find((p) => p.id === offer.from)!
  const responders = players.filter(
    (p) =>
      (offer.to === 'any' ? p.id !== offer.from : p.id === offer.to) &&
      !offer.declinedBy.includes(p.id) &&
      hasCards(p, offer.want) &&
      (answerable === undefined || answerable.includes(p.id)),
  )

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="offer-response-title">
      <div className="modal__panel">
        <h2 id="offer-response-title" className="modal__title">{proposer.name} offered a trade</h2>
        {secondsLeft !== null && secondsLeft !== undefined && (
          <p className="offer__clock" aria-live="off">
            {secondsLeft}s to answer — no answer counts as a pass.
          </p>
        )}

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

        {/* Accept(s) and decline share one row — a bot's offer runs on a clock,
            so the answer must be one glance wide, not a stack. */}
        <div className="offer__answers">
          {responders.map((p) => {
            const able = hasCards(p, offer.want)
            return (
              <button
                key={p.id}
                className="btn btn--accept"
                disabled={!able}
                onClick={() => onAccept(p.id)}
              >
                {/* Naming the seat only helps when the device answers for more
                    than one — otherwise it reads as "You Accepts". */}
                <span className="btn__label">{responders.length > 1 ? `${p.name} accepts` : 'Accept trade'}</span>
                {!able && <span className="btn__cost">not enough cards</span>}
              </button>
            )
          })}
          <button className="btn" onClick={onDecline}>
            Decline
          </button>
        </div>
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
  myTurn?: boolean
  /** Hidden in a solo game — nobody to trade with. */
  canOffer: boolean
  /** Endless mode only: propose that the table stops and scores as it stands. */
  canProposeEnd?: boolean
  onProposeEnd?: () => void
  /** Buying a dev card sits in the build row: it is a fourth thing you buy. */
  canBuyDev: boolean
  /** Deck exhausted — the same permanent "none left" as a spent piece. */
  devDeckEmpty: boolean
  onBuild: (kind: BuildKind) => void
  onBuyDev: () => void
  onRoll: () => void
  onEndTurn: () => void
  onCancel: () => void
  onOffer: () => void
}

export function ActionBar({
  player,
  mode,
  hasRolled,
  myTurn = true,
  canOffer,
  canProposeEnd = false,
  onProposeEnd,
  canBuyDev,
  devDeckEmpty,
  onBuild,
  onBuyDev,
  onRoll,
  onEndTurn,
  onCancel,
  onOffer,
}: ActionBarProps) {
  const kinds: BuildKind[] = ['road', 'settlement', 'city']
  /*
   * Pieces are finite, and running out is permanent in a way that being short
   * of cards is not — a player who has placed all 15 roads will never build
   * another, however much brick they collect. The button says so directly
   * rather than sitting dim and unexplained next to affordable costs.
   */
  const placed: Record<BuildKind, number> = {
    road: player.roads.length,
    settlement: player.settlements.length,
    city: player.cities.length,
  }
  const limits: Record<BuildKind, number> = {
    road: PIECE_LIMITS.roads,
    settlement: PIECE_LIMITS.settlements,
    city: PIECE_LIMITS.cities,
  }
  const canRoll = myTurn && !hasRolled
  const canAct = myTurn && hasRolled && mode !== 'robber'

  // Roll and End turn share one slot. A turn only moves one way — roll, then
  // end — so the two are never both live, and collapsing them puts the turn's
  // whole forward path at a single address under the thumb. The label flips on
  // the player's own tap, never on a bot tick, so it cannot change mid-reach.
  const rolling = !hasRolled

  return (
    <div className="actions">
      <div className="actions__grid">
        <div className="actions__build-row">
          {kinds.map((k) => {
            const spent = placed[k] >= limits[k]
            const canBuild = canAct && !spent && canAfford(player, k)
            return (
              <button
                key={k}
                className={`btn btn--build${mode === k ? ' btn--on' : ''}${spent ? ' btn--spent' : ''}`}
                disabled={!canBuild}
                onClick={() => (mode === k ? onCancel() : onBuild(k))}
                title={
                  spent
                    ? `All ${limits[k]} ${BUILD_LABEL[k].toLowerCase()} pieces are on the board`
                    : `${BUILD_LABEL[k]}: ${costLabel(k)}`
                }
                aria-label={
                  spent
                    ? `${BUILD_LABEL[k]} — none left, all ${limits[k]} are on the board`
                    : `Build ${BUILD_LABEL[k].toLowerCase()} — costs ${costSpoken(k)}`
                }
                aria-pressed={mode === k}
              >
                <div className="btn__build-header">
                  <span className="btn__piece">
                    <PieceIcon kind={k} color={player.color} dark={player.dark} />
                    {spent && (
                      <span className="btn__spent-mark" aria-hidden="true">
                        🚫
                      </span>
                    )}
                  </span>
                  <span className="btn__label">{BUILD_LABEL[k]}</span>
                </div>
                {spent && <span className="btn__cost btn__cost--spent">none left</span>}
              </button>
            )
          })}

          <button
            className={`btn btn--build btn--buydev${devDeckEmpty ? ' btn--spent' : ''}`}
            disabled={!canBuyDev}
            onClick={onBuyDev}
            title={
              devDeckEmpty
                ? 'The development deck is empty'
                : `Buy a development card: ${DEV_COST_LABEL}`
            }
            aria-label={
              devDeckEmpty
                ? 'Development cards — none left, the deck is empty'
                : 'Buy a development card — costs 1 wool, 1 grain and 1 ore'
            }
          >
            <div className="btn__build-header">
              <span className="btn__piece">
                <span className="btn__buydev-icon">🃏</span>
                {devDeckEmpty && (
                  <span className="btn__spent-mark" aria-hidden="true">
                    🚫
                  </span>
                )}
              </span>
              <span className="btn__label">Buy</span>
            </div>
            {devDeckEmpty && <span className="btn__cost btn__cost--spent">none left</span>}
          </button>
        </div>

        <div className="actions__footer-row">
          {canOffer && (
            <button className="btn btn--trade" onClick={onOffer} disabled={!canAct}>
              <span className="btn__label">Trade</span>
            </button>
          )}
          {canProposeEnd && (
            <button
              className="btn"
              onClick={onProposeEnd}
              disabled={!canAct}
              title="Ask everyone to stop and score as it stands"
            >
              <span className="btn__label">End game</span>
            </button>
          )}
          <button
            className="btn btn--primary btn--turn"
            onClick={rolling ? onRoll : onEndTurn}
            disabled={rolling ? !canRoll : !canAct}
            aria-label={rolling ? 'Roll the dice' : 'End your turn'}
          >
            {rolling && <span className="btn__roll-icon">🎲</span>}
            <span className="btn__label">{rolling ? 'Roll dice' : 'End turn'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
