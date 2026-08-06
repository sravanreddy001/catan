import { useState } from 'react'
import { joinUrl } from '../net/session'

interface Props {
  /** Prefilled when the page was opened from a share link. */
  initialCode: string | null
  resumable: boolean
  onOffline: (count: number) => void
  onHost: (name: string) => void
  onJoin: (code: string, name: string) => void
  onResume: () => void
}

type Screen = 'mode' | 'offline' | 'online'

export default function Lobby({
  initialCode,
  resumable,
  onOffline,
  onHost,
  onJoin,
  onResume,
}: Props) {
  const [screen, setScreen] = useState<Screen>(initialCode ? 'online' : 'mode')
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialCode ?? '')

  return (
    <div className="modal">
      <div className="modal__panel">
        {screen === 'mode' && (
          <>
            <h2 className="modal__title">Catan</h2>
            <button className="lobby__count" onClick={() => setScreen('offline')}>
              Play offline
              <small>one device, passed around</small>
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
            <h2 className="modal__title">How many players in total?</h2>
            <div className="lobby__counts">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className="lobby__count" onClick={() => onOffline(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="lobby__hint">Including you. Everyone plays on this device.</p>
            <button className="btn" onClick={() => setScreen('mode')}>
              Back
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
            <button
              className="btn btn--primary"
              disabled={!name.trim()}
              onClick={() => onHost(name.trim())}
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
              onClick={() => onJoin(code.trim(), name.trim())}
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
  isHost: boolean
  status: string
  onStart: () => void
  onCancel: () => void
}

/** Shown between creating/joining a room and the host starting the game. */
export function WaitingRoom({ code, names, isHost, status, onStart, onCancel }: WaitingProps) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

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
              {n}
              {i === 0 && <small>host</small>}
            </li>
          ))}
          {names.length < 4 && <li className="seats__row seats__row--empty">waiting…</li>}
        </ul>

        <p className="lobby__hint">{status}</p>

        {isHost ? (
          <button className="btn btn--primary" disabled={names.length < 2} onClick={onStart}>
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
