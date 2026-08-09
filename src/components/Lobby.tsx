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
  /** Settings are the host's to set; they seed the room and stay editable there. */
  onHost: (name: string, color: number, settings?: Partial<GameSettings>) => void
  onJoin: (code: string, name: string, color: number) => void
  onResume: () => void
}

/**
 * One screen, two modes. Everything needed to start is on it; the knobs most
 * games never touch live in a single collapsed section, so the common path is
 * pick opponents, pick colour, start. If that section outgrows one panel, that
 * is the point to split it up again — not before.
 */
type Screen = 'offline' | 'online'

/**
 * 15 is gone: the board tops out at 13 VP (4 cities, 1 settlement, both
 * bonuses), so reaching 15 needs two victory cards, and roughly a third of
 * four-player games never got there. An endless mode is the right home for
 * a marathon, not a VP target that can strand a game.
 */
const VP_OPTIONS = [8, 10, 12]

const BANK_OPTIONS: Array<{ value: GameSettings['bankPreset']; label: string }> = [
  { value: 'standard', label: 'Standard (19)' },
  { value: 'scarce', label: 'Scarce (12)' },
  { value: 'veryScarce', label: 'Very Scarce (9)' },
]

/**
 * Quick-select bundles. A preset is a convenience default, not a mode: it sets
 * several fields at once and every one of them stays editable afterwards, so
 * picking "Speed game" and then putting the VP target back to 10 works.
 */
const PRESETS: Array<{ name: string; icon: string; blurb: string; values: Partial<GameSettings> }> = [
  {
    name: 'Speed game',
    icon: '⚡',
    blurb: 'Auto setup, two rolls a turn, first to 8',
    values: { speedMode: true, vpTarget: 8 },
  },
  {
    name: 'Chaos game',
    icon: '🎲',
    blurb: 'Santa, very scarce bank, full dev deck with drafting',
    values: { santaMode: true, bankPreset: 'veryScarce', newDevCards: true, draftDevCards: true },
  },
  {
    name: 'Teaching game',
    icon: '🎓',
    blurb: 'Open hands, first to 8 — nothing hidden',
    values: { publicHands: true, vpTarget: 8 },
  },
]

const BOT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'null', label: 'Default (balanced)' },
  { value: 'aggressive', label: 'Aggressive (targets leader, plays hard)' },
  { value: 'economic', label: 'Economic (builds cities, trades often)' },
  { value: 'turtle', label: 'Turtle (spreads settlements, avoids fights)' },
]

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

/** The variant toggles, shared by the lobby and the online waiting room. */
function SettingsFields({
  idPrefix,
  publicHands,
  setPublicHands,
  santaMode,
  setSantaMode,
  speedMode,
  setSpeedMode,
  newDevCards,
  setNewDevCards,
  draftDevCards,
  setDraftDevCards,
  endless,
  setEndless,
  vpTarget,
  setVpTarget,
  bankPreset,
  setBankPreset,
}: {
  idPrefix: string
  publicHands: boolean
  setPublicHands: (v: boolean) => void
  santaMode: boolean
  setSantaMode: (v: boolean) => void
  speedMode: boolean
  setSpeedMode: (v: boolean) => void
  newDevCards: boolean
  setNewDevCards: (v: boolean) => void
  draftDevCards: boolean
  setDraftDevCards: (v: boolean) => void
  endless: boolean
  setEndless: (v: boolean) => void
  vpTarget: number
  setVpTarget: (v: number) => void
  bankPreset: GameSettings['bankPreset']
  setBankPreset: (v: GameSettings['bankPreset']) => void
}) {
  const toggles: Array<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = [
    { checked: publicHands, onChange: setPublicHands, label: "Public hands (see all players' cards)" },
    { checked: santaMode, onChange: setSantaMode, label: 'Santa mode (friendly variant, no robber)' },
    { checked: speedMode, onChange: setSpeedMode, label: 'Speed mode (auto setup, 2 rolls per turn)' },
    { checked: newDevCards, onChange: setNewDevCards, label: 'New dev cards (Merchant, Trailblazer, Diplomat, Merit)' },
    { checked: draftDevCards, onChange: setDraftDevCards, label: 'Dev card drafting (see three, pick one)' },
    { checked: endless, onChange: setEndless, label: 'Endless (no target — play until the board fills up)' },
  ]

  /** Presets only touch the fields they name; the rest keep their values. */
  function applyPreset(values: Partial<GameSettings>) {
    if (values.publicHands !== undefined) setPublicHands(values.publicHands)
    if (values.santaMode !== undefined) setSantaMode(values.santaMode)
    if (values.speedMode !== undefined) setSpeedMode(values.speedMode)
    if (values.newDevCards !== undefined) setNewDevCards(values.newDevCards)
    if (values.draftDevCards !== undefined) setDraftDevCards(values.draftDevCards)
    if (values.endless !== undefined) setEndless(values.endless)
    if (values.vpTarget !== undefined) setVpTarget(values.vpTarget)
    if (values.bankPreset !== undefined) setBankPreset(values.bankPreset)
  }

  return (
    <>
      <div className="lobby__presets">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="lobby__preset"
            title={p.blurb}
            onClick={() => applyPreset(p.values)}
          >
            <span className="lobby__preset-icon">{p.icon}</span>
            <span className="lobby__preset-name">{p.name}</span>
            <span className="lobby__preset-blurb">{p.blurb}</span>
          </button>
        ))}
      </div>

      {toggles.map((t) => (
        <label key={t.label} className="checkbox-row">
          <input
            type="checkbox"
            className="custom-checkbox"
            checked={t.checked}
            onChange={(e) => t.onChange(e.target.checked)}
          />
          <span>{t.label}</span>
        </label>
      ))}

      <div className="select-row">
        <label htmlFor={`${idPrefix}-vp-target`}>VP target:</label>
        <select
          id={`${idPrefix}-vp-target`}
          className="custom-select"
          value={vpTarget}
          onChange={(e) => setVpTarget(Number(e.target.value))}
        >
          {/* A saved room can still carry a retired target; show it rather
              than render a blank select over a value that is really set. */}
          {(VP_OPTIONS.includes(vpTarget) ? VP_OPTIONS : [...VP_OPTIONS, vpTarget]).map((n) => (
            <option key={n} value={n}>
              {n === 10 ? '10 (standard)' : n}
            </option>
          ))}
        </select>
      </div>

      <div className="select-row">
        <label htmlFor={`${idPrefix}-bank-preset`}>Bank preset:</label>
        <select
          id={`${idPrefix}-bank-preset`}
          className="custom-select"
          value={bankPreset}
          onChange={(e) => setBankPreset(e.target.value as GameSettings['bankPreset'])}
        >
          {BANK_OPTIONS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      {bankPreset !== 'standard' && (
        <p className="settings-note">
          Note: Scarce bank means trading more often — resources run dry faster.
        </p>
      )}
    </>
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
  const [screen, setScreen] = useState<Screen>(initialCode ? 'online' : 'offline')
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
  const [draftDevCards, setDraftDevCards] = useState(false)
  const [endless, setEndless] = useState(false)
  const [botPresets, setBotPresets] = useState<Record<number, AIPreset>>({})

  const settings = { publicHands, vpTarget, bankPreset, santaMode, speedMode, newDevCards, draftDevCards, endless }

  /** Seats 1..opponents; a seat with no explicit pick plays the default. */
  function presetsForStart(): Record<number, AIPreset> {
    const out: Record<number, AIPreset> = {}
    for (let i = 1; i <= opponents; i++) out[i] = botPresets[i] ?? null
    return out
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lobby-dialog-title">
      <div className="modal__panel">
        <h2 id="lobby-dialog-title" className="modal__title">Catan</h2>

        <div className="lobby__tabs" role="tablist" aria-label="Game mode">
          <button
            role="tab"
            aria-selected={screen === 'offline'}
            className={`lobby__tab${screen === 'offline' ? ' lobby__tab--on' : ''}`}
            onClick={() => setScreen('offline')}
          >
            🤖 Offline
          </button>
          <button
            role="tab"
            aria-selected={screen === 'online'}
            className={`lobby__tab${screen === 'online' ? ' lobby__tab--on' : ''}`}
            onClick={() => setScreen('online')}
          >
            🌐 Online
          </button>
        </div>

        {screen === 'offline' && (
          <div className="lobby__screen">
            <div className="lobby__field">
              <span className="lobby__field-label">Opponents</span>
              <div className="lobby__counts">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    className={`lobby__count-card${opponents === n ? ' lobby__count-card--on' : ''}`}
                    aria-pressed={opponents === n}
                    onClick={() => setOpponents(n)}
                  >
                    <span className="lobby__count-num">{n}</span>
                    <span className="lobby__count-sub">{n === 1 ? '1 bot' : `${n} bots`}</span>
                    <span className="lobby__count-badge">{n + 1}p</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="lobby__field">
              <span className="lobby__field-label">Your colour</span>
              <ColorPicker value={color} onPick={setColor} />
            </div>

            <details className="lobby__advanced">
              {/* Short enough to stay on one line at 375px — a wrapped summary
                  costs a whole row of the settings box below it. */}
              <summary className="lobby__advanced-summary">Advanced settings</summary>
              <div className="settings-section">
                <SettingsFields
                  idPrefix="lobby"
                  publicHands={publicHands}
                  setPublicHands={setPublicHands}
                  santaMode={santaMode}
                  setSantaMode={setSantaMode}
                  speedMode={speedMode}
                  setSpeedMode={setSpeedMode}
                  newDevCards={newDevCards}
                  setNewDevCards={setNewDevCards}
                  draftDevCards={draftDevCards}
                  endless={endless}
                  setEndless={setEndless}
                  setDraftDevCards={setDraftDevCards}
                  vpTarget={vpTarget}
                  setVpTarget={setVpTarget}
                  bankPreset={bankPreset}
                  setBankPreset={setBankPreset}
                />

                <h3 className="settings-section__title">Bot personalities</h3>
                {Array.from({ length: opponents }).map((_, i) => {
                  const botSeat = i + 1
                  return (
                    <div key={botSeat} className="bot-preset-row">
                      <label htmlFor={`bot-${botSeat}-select`} className="bot-preset-label">
                        Bot {botSeat}:
                      </label>
                      <select
                        id={`bot-${botSeat}-select`}
                        className="custom-select"
                        value={botPresets[botSeat] ?? 'null'}
                        onChange={(e) =>
                          setBotPresets({
                            ...botPresets,
                            [botSeat]: e.target.value === 'null' ? null : (e.target.value as AIPreset),
                          })
                        }
                      >
                        {BOT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </details>

            <div className="lobby__actions">
              <button
                className="btn btn--primary"
                onClick={() => onOffline(opponents, color, settings, presetsForStart())}
              >
                Start game
              </button>
              {resumable && (
                <button className="btn" onClick={onResume}>
                  Resume saved game
                </button>
              )}
            </div>
          </div>
        )}

        {screen === 'online' && (
          <div className="lobby__screen">
            <input
              className="field"
              placeholder="Your name"
              value={name}
              maxLength={12}
              autoFocus={!!initialCode}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="lobby__field">
              <span className="lobby__field-label">Your colour</span>
              <ColorPicker value={color} onPick={setColor} />
            </div>

            <details className="lobby__advanced">
              <summary className="lobby__advanced-summary">Advanced settings</summary>
              <div className="settings-section">
                <SettingsFields
                  idPrefix="lobby-online"
                  publicHands={publicHands}
                  setPublicHands={setPublicHands}
                  santaMode={santaMode}
                  setSantaMode={setSantaMode}
                  speedMode={speedMode}
                  setSpeedMode={setSpeedMode}
                  newDevCards={newDevCards}
                  setNewDevCards={setNewDevCards}
                  draftDevCards={draftDevCards}
                  endless={endless}
                  setEndless={setEndless}
                  setDraftDevCards={setDraftDevCards}
                  vpTarget={vpTarget}
                  setVpTarget={setVpTarget}
                  bankPreset={bankPreset}
                  setBankPreset={setBankPreset}
                />
                <p className="lobby__hint">Only the host&apos;s settings apply, and they stay editable in the room.</p>
              </div>
            </details>

            <button
              className="btn btn--primary"
              disabled={!name.trim()}
              onClick={() => onHost(name.trim(), color, settings)}
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
              {resumable && (
                <button className="btn" onClick={onResume}>
                  Resume saved game
                </button>
              )}
            </div>

            <p className="lobby__hint">
              Joining? The host&apos;s settings apply to the room.
            </p>
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
  const [draftDevCards, setDraftDevCards] = useState(settings.draftDevCards)
  const [endless, setEndless] = useState(settings.endless)

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
            <SettingsFields
              idPrefix="waiting"
              publicHands={publicHands}
              setPublicHands={setPublicHands}
              santaMode={santaMode}
              setSantaMode={setSantaMode}
              speedMode={speedMode}
              setSpeedMode={setSpeedMode}
              newDevCards={newDevCards}
              setNewDevCards={setNewDevCards}
              draftDevCards={draftDevCards}
              endless={endless}
              setEndless={setEndless}
              setDraftDevCards={setDraftDevCards}
              vpTarget={vpTarget}
              setVpTarget={setVpTarget}
              bankPreset={bankPreset}
              setBankPreset={setBankPreset}
            />
          </div>
        )}

        {isHost ? (
          <button className="btn btn--primary" disabled={names.length < 2} onClick={() => onStart({ publicHands, vpTarget, bankPreset, santaMode, speedMode, newDevCards, draftDevCards, endless })}>
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
