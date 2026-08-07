import { useState } from 'react'
import type { GameSettings } from '../game/engine'
import { PALETTE } from '../game/players'
import { joinUrl } from '../net/session'

interface Props {
  /** Prefilled when the page was opened from a share link. */
  initialCode: string | null
  resumable: boolean
  onOffline: (count: number, color: number, settings?: Partial<GameSettings>) => void
  onHost: (name: string, color: number) => void
  onJoin: (code: string, name: string, color: number) => void
  onResume: () => void
}

type Screen = 'mode' | 'offline' | 'offline-color' | 'online' | 'join'

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

  return (
    <div className="modal">
      <div className="modal__panel">
        {screen === 'mode' && (
          <>
            <h2 className="modal__title">Catan</h2>
            <button className="lobby__count" onClick={() => setScreen('offline')}>
              Play offline
              <small>you against AI opponents</small>
            </button>
            <button className="lobby__count" onClick={() => setScreen('online')}>
              Play online
              <small>share a code, everyone on their own phone</small>
            </button>
            {resumable && (
              <button className="btn" onClick={onResume}>
                Resume saved game
              </button>
            )}
          </>
        )}

        {screen === 'offline' && (
          <>
            <h2 className="modal__title">How many opponents?</h2>
            <div className="lobby__counts">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className="lobby__count"
                  onClick={() => {
                    setOpponents(n)
                    setScreen('offline-color')
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="lobby__hint">Not counting you. All opponents are AI.</p>
            <button className="btn" onClick={() => setScreen('mode')}>
              Back
            </button>
          </>
        )}

        {screen === 'offline-color' && (
          <>
            <h2 className="modal__title">Pick your color</h2>
            <ColorPicker value={color} onPick={setColor} />
            <p className="lobby__hint">Opponents take the remaining colors.</p>

            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Game settings</h3>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={publicHands}
                  onChange={(e) => setPublicHands(e.target.checked)}
                />
                Public hands (see all players' cards)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={santaMode}
                  onChange={(e) => setSantaMode(e.target.checked)}
                />
                Santa mode (friendly variant, no robber)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <span>VP target:</span>
                <select
                  value={vpTarget}
                  onChange={(e) => setVpTarget(Number(e.target.value))}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                >
                  <option value={8}>8</option>
                  <option value={10}>10 (standard)</option>
                  <option value={12}>12</option>
                  <option value={15}>15</option>
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                <span>Bank preset:</span>
                <select
                  value={bankPreset}
                  onChange={(e) => setBankPreset(e.target.value as 'standard' | 'scarce' | 'veryScarce')}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                >
                  <option value="standard">Standard (19)</option>
                  <option value="scarce">Scarce (12)</option>
                  <option value="veryScarce">Very Scarce (9)</option>
                </select>
              </label>

              {bankPreset !== 'standard' && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  Note: Scarce bank means trading more often — resources run dry faster.
                </p>
              )}
            </div>

            <button className="btn btn--primary" onClick={() => onOffline(opponents, color, { publicHands, vpTarget, bankPreset, santaMode })}>
              Start
            </button>
            <button className="btn" onClick={() => setScreen('offline')}>
              Back
            </button>
          </>
        )}

        {screen === 'join' && (
          <>
            <h2 className="modal__title">Join room {code}</h2>
            <input
              className="field"
              placeholder="Your name"
              value={name}
              maxLength={12}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <ColorPicker value={color} onPick={setColor} />
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
          </>
        )}

        {screen === 'online' && (
          <>
            <h2 className="modal__title">Play online</h2>
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
          </>
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
    <div className="modal">
      <div className="modal__panel">
        <h2 className="modal__title">Room {code}</h2>
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
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Game settings</h3>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={publicHands}
                onChange={(e) => setPublicHands(e.target.checked)}
              />
              Public hands (see all players' cards)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={santaMode}
                onChange={(e) => setSantaMode(e.target.checked)}
              />
              Santa mode (friendly variant, no robber)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <span>VP target:</span>
              <select
                value={vpTarget}
                onChange={(e) => setVpTarget(Number(e.target.value))}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
              >
                <option value={8}>8</option>
                <option value={10}>10 (standard)</option>
                <option value={12}>12</option>
                <option value={15}>15</option>
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginTop: '0.75rem' }}>
              <span>Bank preset:</span>
              <select
                value={bankPreset}
                onChange={(e) => setBankPreset(e.target.value as 'standard' | 'scarce' | 'veryScarce')}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
              >
                <option value="standard">Standard (19)</option>
                <option value="scarce">Scarce (12)</option>
                <option value="veryScarce">Very Scarce (9)</option>
              </select>
            </label>

            {bankPreset !== 'standard' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                Note: Scarce bank means trading more often — resources run dry faster.
              </p>
            )}
          </div>
        )}

        {isHost ? (
          <button className="btn btn--primary" disabled={names.length < 2} onClick={() => onStart({ publicHands, vpTarget, bankPreset, santaMode })}>
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
