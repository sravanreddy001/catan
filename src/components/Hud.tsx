import { useState } from 'react'
import type { Resource } from '../game/board'
import {
  COSTS,
  RESOURCES,
  RESOURCE_ICON,
  canAfford,
  victoryPoints,
  type BuildKind,
  type Player,
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
      {RESOURCES.map((r) => (
        <div key={r} className="card" title={r}>
          <span className="card__icon">{RESOURCE_ICON[r]}</span>
          <span className="card__n">{player.hand[r]}</span>
          {rates && <span className="card__rate">{rates[r]}:1</span>}
        </div>
      ))}
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

interface ActionBarProps {
  player: Player
  mode: BuildKind | 'robber' | null
  hasRolled: boolean
  onBuild: (kind: BuildKind) => void
  onRoll: () => void
  onEndTurn: () => void
  onCancel: () => void
}

export function ActionBar({
  player,
  mode,
  hasRolled,
  onBuild,
  onRoll,
  onEndTurn,
  onCancel,
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
          <button className="btn btn--primary" onClick={onEndTurn} disabled={mode === 'robber'}>
            End turn
          </button>
        </>
      )}
    </div>
  )
}
