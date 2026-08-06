import { Fragment, useState } from 'react'
import type { Resource } from '../game/board'
import {
  COSTS,
  RESOURCES,
  RESOURCE_ICON,
  canAfford,
  hasCards,
  isEmptyBundle,
  victoryPoints,
  type BuildKind,
  type Player,
  type PlayerId,
  type TradeOffer,
} from '../game/players'

export function PlayerStrip({ players, current }: { players: Player[]; current: number }) {
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
          <span className="chip__vp">{victoryPoints(p)} VP</span>
        </div>
      ))}
    </div>
  )
}

export function Dice({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  return (
    <div className={`dice${rolling ? ' dice--rolling' : ''}`}>
      <span className="die">{dice ? dice[0] : '?'}</span>
      <span className="die">{dice ? dice[1] : '?'}</span>
      <span className="dice__sum">{dice ? dice[0] + dice[1] : '–'}</span>
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
        // Tighten the overlap as the pile grows so a big hand still fits.
        const overlap = n > 8 ? 4 : n > 5 ? 7 : 11
        return (
          <div key={r} className="stack" title={`${n} ${r}`}>
            <div className="stack__cards" style={{ '--overlap': `${overlap}px` } as React.CSSProperties}>
              {n === 0 ? (
                <span className="minicard minicard--empty">{RESOURCE_ICON[r]}</span>
              ) : (
                Array.from({ length: n }, (_, i) => (
                  <span key={i} className={`minicard minicard--${r}`}>
                    {RESOURCE_ICON[r]}
                  </span>
                ))
              )}
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

type Bundle = Partial<Record<Resource, number>>

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
        <h2 className="modal__title">Offer a trade</h2>

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
            onClick={() => onPropose({ from: player.id, to, give, want })}
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
  const responders = players.filter((p) =>
    offer.to === 'any' ? p.id !== offer.from : p.id === offer.to,
  )

  return (
    <div className="modal">
      <div className="modal__panel">
        <h2 className="modal__title">
          {proposer.name} offers {bundleText(offer.give)} for {bundleText(offer.want)}
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
          Decline / cancel
        </button>
      </div>
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
    <div className="actions">
      {!hasRolled ? (
        <button className="btn btn--primary" onClick={onRoll}>
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
            >
              <span className="btn__label">{k}</span>
              <span className="btn__cost">{costLabel(k)}</span>
            </button>
          ))}
          {canOffer && (
            <button className="btn" onClick={onOffer} disabled={mode === 'robber'}>
              <span className="btn__label">Offer</span>
              <span className="btn__cost">to players</span>
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
