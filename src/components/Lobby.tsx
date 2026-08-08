import { useState, useEffect } from 'react'
import type { GameSettings } from '../game/engine'
import type { AIPreset } from '../game/ai'
import { PALETTE } from '../game/players'
import { joinUrl } from '../net/session'

interface Props {
  /** Prefilled when the page was opened from a share link. */
  initialCode: string | null
  resumable: boolean
  onOffline: (count: number, color: number, settings?: Partial<GameSettings>, presets?: Record<number, AIPreset>) => void
  onHost: (name: string, color: number) => void
  onJoin: (code: string, name: string, color: number) => void
  onResume: () => void
}

type Screen = 'mode' | 'offline' | 'offline-color' | 'offline-presets' | 'online' | 'join'

/** A row of palette swatches; `taken` colors are shown but disabled. */
function ColorPicker({
  value,
  onPick,
  taken = [],
}: {
  value: number
  onPick: (i: number) => void
  taken?: number[]
}) {
  return (
    <div className="lobby__colors">
      {PALETTE.map((swatch, i) => (
        <button
          key={swatch.name}
          className={`lobby__swatch${value === i ? ' lobby__swatch--on' : ''}`}
          style={{ '--c': swatch.color } as React.CSSProperties}
          disabled={taken.includes(i) && value !== i}
          title={swatch.name}
          aria-label={`Select color ${swatch.name}`}
          onClick={() => onPick(i)}
        />
      ))}
    </div>
  )
}

export default function Lobby({
  initialCode,
  resumable,
  onOffline,
  onHost,
  onJoin,
  onResume,
}: Props) {
  const [screen, setScreen] = useState<Screen>(initialCode ? 'join' : 'mode')
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [color, setColor] = useState(0)
  const [opponents, setOpponents] = useState(1)
  const [vpTarget, setVpTarget] = useState(10)
  const [publicHands, setPublicHands] = useState(false)
  const [bankPreset, setBankPreset] = useState<'standard' | 'scarce' | 'veryScarce'>('standard')
  const [santaMode, setSantaMode] = useState(false)
  const [speedMode, setSpeedMode] = useState(false)
  const [newDevCards, setNewDevCards] = useState(false)
  const [botPresets, setBotPresets] = useState<Record<number, AIPreset>>({})

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (screen === 'offline') setScreen('mode')
        else if (screen === 'offline-color') setScreen('offline')
        else if (screen === 'offline-presets') setScreen('offline-color')
        else if (screen === 'online' || screen === 'join') setScreen('mode')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [screen])

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lobby-dialog-title">
      <div className="modal__panel">
        {screen === 'mode' && (
          <div className="lobby__mode-selection">
            <h2 id="lobby-dialog-title" className="modal__title">Catan</h2>
            <div className="lobby__mode-buttons">
              <button className="lobby__mode-card" onClick={() => setScreen('offline')}>
                <span className="lobby__mode-icon">🤖</span>
                <div className="lobby__mode-text">
                  <span className="lobby__mode-title">Play offline</span>
                  <span className="lobby__mode-desc">You against AI opponents</span>
                </div>
              </button>
              <button className="lobby__mode-card" onClick={() => setScreen('online')}>
                <span className="lobby__mode-icon">🌐</span>
                <div className="lobby__mode-text">
                  <span className="lobby__mode-title">Play online</span>
                  <span className="lobby__mode-desc">Share a code, everyone on their own phone</span>
                </div>
              </button>
              {resumable && (
                <button className="btn btn--primary lobby__resume-btn" onClick={onResume}>
                  Resume saved game
                </button>
              )}
            </div>
          </div>
        )}

        {screen === 'offline' && (
          <div className="lobby__screen">
            <h2 id="lobby-dialog-title" className="modal__title">How many opponents?</h2>
            <div className="lobby__counts">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className={`lobby__count-card${opponents === n ? ' lobby__count-card--on' : ''}`}
                  onClick={() => {
                    setOpponents(n)
                    setScreen('offline-color')
                  }}
                >
                  <span className="lobby__count-num">{n}</span>
                  <span className="lobby__count-sub">{n === 1 ? '1 Bot' : `${n} Bots`}</span>
                  <span className="lobby__count-badge">{n + 1} players</span>
                </button>
              ))}
            </div>
            <p className="lobby__hint">Not counting you. All opponents are AI.</p>
            <div className="lobby__actions">
              <button className="btn" onClick={() => setScreen('mode')}>
                Back
              </button>
            </div>
          </div>
        )}

        {screen === 'offline-color' && (
          <div className="lobby__screen">
            <h2 id="lobby-dialog-title" className="modal__title">Pick your color</h2>
            <ColorPicker value={color} onPick={setColor} />
            <p className="lobby__hint">Opponents take the remaining colors.</p>

            <div className="settings-section">
              <h3 className="settings-section__title">Game settings</h3>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  className="custom-checkbox"
                  checked={publicHands}
                  onChange={(e) => setPublicHands(e.target.checked)}
                />
                <span>Public hands (see all players' cards)</span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  className="custom-checkbox"
                  checked={santaMode}
                  onChange={(e) => setSantaMode(e.target.checked)}
                />
                <span>Santa mode (friendly variant, no robber)</span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  className="custom-checkbox"
                  checked={speedMode}
                  onChange={(e) => setSpeedMode(e.target.checked)}
                />
                <span>Speed mode (auto setup, 2 rolls per turn)</span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  className="custom-checkbox"
                  checked={newDevCards}
                  onChange={(e) => setNewDevCards(e.target.checked)}
                />
                <span>New dev cards (Merchant, Trailblazer, Diplomat, Merit)</span>
              </label>

              <div className="select-row">
                <label htmlFor="vp-target-select">VP target:</label>
                <select
                  id="vp-target-select"
                  className="custom-select"
                  value={vpTarget}
                  onChange={(e) => setVpTarget(Number(e.target.value))}
                >
                  <option value={8}>8</option>
                  <option value={10}>10 (standard)</option>
                  <option value={12}>12</option>
                  <option value={15}>15</option>
                </select>
              </div>

              <div className="select-row">
                <label htmlFor="bank-preset-select">Bank preset:</label>
                <select
                  id="bank-preset-select"
                  className="custom-select"
                  value={bankPreset}
                  onChange={(e) => setBankPreset(e.target.value as 'standard' | 'scarce' | 'veryScarce')}
                >
                  <option value="standard">Standard (19)</option>
                  <option value="scarce">Scarce (12)</option>
                  <option value="veryScarce">Very Scarce (9)</option>
                </select>
              </div>

              {bankPreset !== 'standard' && (
                <p className="settings-note">
                  Note: Scarce bank means trading more often — resources run dry faster.
                </p>
              )}
            </div>

            <div className="lobby__actions">
              <button
                className="btn btn--primary"
                onClick={() => {
                  const newPresets: Record<number, AIPreset> = {}
                  for (let i = 1; i <= opponents; i++) {
                    newPresets[i] = null
                  }
                  setBotPresets(newPresets)
                  setScreen('offline-presets')
                }}
              >
                Next: AI personalities
              </button>
              <button className="btn" onClick={() => setScreen('offline')}>
                Back
              </button>
            </div>
          </div>
        )}

        {screen === 'offline-presets' && (
          <div className="lobby__screen">
            <h2 id="lobby-dialog-title" className="modal__title">AI personalities</h2>
            <p className="lobby__hint">Customize each bot's playstyle, or keep defaults.</p>

            <div className="settings-section">
              {Array.from({ length: opponents }).map((_, i) => {
                const botSeat = i + 1
                const preset = botPresets[botSeat] ?? null
                return (
                  <div key={botSeat} className="bot-preset-row">
                    <label htmlFor={`bot-${botSeat}-select`} className="bot-preset-label">
                      Bot {botSeat}:
                    </label>
                    <select
                      id={`bot-${botSeat}-select`}
                      className="custom-select"
                      value={preset ?? 'null'}
                      onChange={(e) => {
                        const value = e.target.value === 'null' ? null : (e.target.value as AIPreset)
                        setBotPresets({ ...botPresets, [botSeat]: value })
                      }}
                    >
                      <option value="null">Default (balanced)</option>
                      <option value="aggressive">Aggressive (targets leader, plays hard)</option>
                      <option value="economic">Economic (builds cities, trades often)</option>
                      <option value="turtle">Turtle (spreads settlements, avoids fights)</option>
                    </select>
                  </div>
                )
              })}
            </div>

            <div className="lobby__actions">
              <button
                className="btn btn--primary"
                onClick={() =>
                  onOffline(
                    opponents,
                    color,
                    { publicHands, vpTarget, bankPreset, santaMode, speedMode, newDevCards },
                    botPresets,
                  )
                }
              >
                Start Game
              </button>
              <button className="btn" onClick={() => setScreen('offline-color')}>
                Back
              </button>
            </div>
          </div>
        )}

        {screen === 'join' && (
          <div className="lobby__screen">
            <h2 id="lobby-dialog-title" className="modal__title">Join room {code}</h2>
            <input
              className="field"
              placeholder="Your name"
              value={name}
              maxLength={12}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <ColorPicker value={color} onPick={setColor} />
            <div className="lobby__actions">
              <button
                className="btn btn--primary"
                disabled={!name.trim() || code.trim().length < 4}
                onClick={() => onJoin(code.trim(), name.trim(), color)}
              >
                Join game
              </button>
              <button className="btn" onClick={() => setScreen('mode')}>
                Create a new game instead
              </button>
            </div>
          </div>
        )}

        {screen === 'online' && (
          <div className="lobby__screen">
            <h2 id="lobby-dialog-title" className="modal__title">Play online</h2>
            <input
              className="field"
              placeholder="Your name"
              value={name}
              maxLength={12}
              onChange={(e) => setName(e.target.value)}
            />
            <ColorPicker value={color} onPick={setColor} />
            <button
              className="btn btn--primary"
              disabled={!name.trim()}
              onClick={() => onHost(name.trim(), color)}
            >
              Host a new game
            </button>
            <div className="lobby__divider">or join</div>
            <input
              className="field"
              placeholder="Room code"
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <div className="lobby__actions">
              <button
                className="btn"
                disabled={!name.trim() || code.trim().length < 4}
                onClick={() => onJoin(code.trim(), name.trim(), color)}
              >
                Join game
              </button>
              <button className="btn" onClick={() => setScreen('mode')}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface WaitingProps {
  code: string
  names: string[]
  /** PALETTE index per seat, parallel to `names`. */
  colors: number[]
  isHost: boolean
  status: string
  settings: GameSettings
  onStart: (settings?: Partial<GameSettings>) => void
  onCancel: () => void
}

/** Shown between creating/joining a room and the host starting the game. */
export function WaitingRoom({ code, names, colors, isHost, status, settings, onStart, onCancel }: WaitingProps) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [vpTarget, setVpTarget] = useState(settings.vpTarget)
  const [publicHands, setPublicHands] = useState(settings.publicHands)
  const [bankPreset, setBankPreset] = useState(settings.bankPreset)
  const [santaMode, setSantaMode] = useState(settings.santaMode)
  const [speedMode, setSpeedMode] = useState(settings.speedMode)
  const [newDevCards, setNewDevCards] = useState(settings.newDevCards)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  async function copy(what: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : joinUrl(code))
      setCopied(what)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="waiting-dialog-title">
      <div className="modal__panel">
        <h2 id="waiting-dialog-title" className="modal__title">Room {code}</h2>
        <div className="modal__actions">
          <button className="btn" onClick={() => copy('code')}>
            {copied === 'code' ? 'Copied ✓' : 'Copy code'}
          </button>
          <button className="btn" onClick={() => copy('link')}>
            {copied === 'link' ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>

        <ul className="seats">
          {names.map((n, i) => (
            <li key={i} className="seats__row">
              <span
                className="chip__dot"
                style={{ '--c': PALETTE[colors[i] ?? i].color } as React.CSSProperties}
              />
              {n}
              {i === 0 && <small>host</small>}
            </li>
          ))}
          {names.length < 4 && <li className="seats__row seats__row--empty">waiting…</li>}
        </ul>

        <p className="lobby__hint">{status}</p>

        {isHost && (
          <div className="settings-section">
            <h3 className="settings-section__title">Game settings</h3>

            <label className="checkbox-row">
              <input
                type="checkbox"
                className="custom-checkbox"
                checked={publicHands}
                onChange={(e) => setPublicHands(e.target.checked)}
              />
              <span>Public hands (see all players' cards)</span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                className="custom-checkbox"
                checked={santaMode}
                onChange={(e) => setSantaMode(e.target.checked)}
              />
              <span>Santa mode (friendly variant, no robber)</span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                className="custom-checkbox"
                checked={speedMode}
                onChange={(e) => setSpeedMode(e.target.checked)}
              />
              <span>Speed mode (auto setup, 2 rolls per turn)</span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                className="custom-checkbox"
                checked={newDevCards}
                onChange={(e) => setNewDevCards(e.target.checked)}
              />
              <span>New dev cards (Merchant, Trailblazer, Diplomat, Merit)</span>
            </label>

            <div className="select-row">
              <label htmlFor="waiting-vp-target">VP target:</label>
              <select
                id="waiting-vp-target"
                className="custom-select"
                value={vpTarget}
                onChange={(e) => setVpTarget(Number(e.target.value))}
              >
                <option value={8}>8</option>
                <option value={10}>10 (standard)</option>
                <option value={12}>12</option>
                <option value={15}>15</option>
              </select>
            </div>

            <div className="select-row">
              <label htmlFor="waiting-bank-preset">Bank preset:</label>
              <select
                id="waiting-bank-preset"
                className="custom-select"
                value={bankPreset}
                onChange={(e) => setBankPreset(e.target.value as 'standard' | 'scarce' | 'veryScarce')}
              >
                <option value="standard">Standard (19)</option>
                <option value="scarce">Scarce (12)</option>
                <option value="veryScarce">Very Scarce (9)</option>
              </select>
            </div>

            {bankPreset !== 'standard' && (
              <p className="settings-note">
                Note: Scarce bank means trading more often — resources run dry faster.
              </p>
            )}
          </div>
        )}

        {isHost ? (
          <button className="btn btn--primary" disabled={names.length < 2} onClick={() => onStart({ publicHands, vpTarget, bankPreset, santaMode, speedMode, newDevCards })}>
            {names.length < 2 ? 'Waiting for players…' : `Start with ${names.length}`}
          </button>
        ) : (
          <p className="lobby__hint">Waiting for the host to start.</p>
        )}
        <button className="btn" onClick={onCancel}>
          Leave
        </button>
      </div>
    </div>
  )
}
