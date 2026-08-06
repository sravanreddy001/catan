// Online play over WebRTC: the host's browser owns the game state and
// broadcasts it; guests send intents. A snapshot is mirrored into
// localStorage so a refresh (or a host coming back) resumes rather than
// losing the game.

import Peer, { type DataConnection } from 'peerjs'
import type { Action, GameState } from '../game/engine'

/** Peer ids must be globally unique, so the short room code gets a prefix. */
const PEER_PREFIX = 'catan-hex-'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const STORAGE_KEY = 'catan.session.v1'

export type Role = 'host' | 'guest'

export interface Lobby {
  code: string
  /** Display names by seat; the host is always seat 0. */
  names: string[]
  /** PALETTE index per seat, parallel to `names`. */
  colors: number[]
  started: boolean
}

export interface Persisted {
  role: Role
  code: string
  seat: number
  names: string[]
  state: GameState | null
}

export type HostMessage =
  | { type: 'lobby'; lobby: Lobby; seat: number }
  | { type: 'state'; state: GameState }

export type GuestMessage =
  | { type: 'join'; name: string; color: number }
  | { type: 'action'; action: Action }

export function roomCode(): string {
  return Array.from(
    { length: 4 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('')
}

export function peerIdFor(code: string): string {
  return PEER_PREFIX + code.toUpperCase()
}

export function joinUrl(code: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', code)
  return url.toString()
}

export function codeFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get('room')?.toUpperCase() ?? null
}

export function save(p: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // Storage can be full or blocked (private mode); the game still runs.
  }
}

export function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Persisted) : null
  } catch {
    return null
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

interface HostHandlers {
  onLobby: (lobby: Lobby) => void
  onAction: (action: Action, seat: number) => void
  onError: (message: string) => void
}

/** The host: owns the room code, accepts guests, and pushes state to them. */
export class HostSession {
  readonly code: string
  private peer: Peer
  private seats = new Map<number, DataConnection>()
  private names: string[]
  private colors: number[]
  private started = false
  private handlers: HostHandlers

  constructor(code: string, hostName: string, hostColor: number, handlers: HostHandlers) {
    this.code = code
    this.names = [hostName]
    this.colors = [hostColor]
    this.handlers = handlers
    this.peer = new Peer(peerIdFor(code))

    this.peer.on('error', (err) => {
      handlers.onError(
        err.type === 'unavailable-id'
          ? 'That room code is already in use — start a new game.'
          : `Connection problem: ${err.type}`,
      )
    })

    this.peer.on('connection', (conn) => this.accept(conn))
  }

  private lobby(): Lobby {
    return { code: this.code, names: [...this.names], colors: [...this.colors], started: this.started }
  }

  /** A guest's preferred color if free, otherwise the first one nobody has taken. */
  private resolveColor(preferred: number): number {
    if (!this.colors.includes(preferred)) return preferred
    for (let i = 0; i < 4; i++) if (!this.colors.includes(i)) return i
    return preferred
  }

  private accept(conn: DataConnection) {
    conn.on('data', (raw) => {
      const msg = raw as GuestMessage
      if (msg.type === 'join') {
        // A guest returning after a refresh keeps the seat matching its name.
        let seat = this.names.indexOf(msg.name)
        if (seat <= 0) {
          if (this.names.length >= 4) {
            conn.close()
            return
          }
          seat = this.names.length
          this.names.push(msg.name)
          this.colors.push(this.resolveColor(msg.color))
        }
        this.seats.set(seat, conn)
        conn.send({ type: 'lobby', lobby: this.lobby(), seat } satisfies HostMessage)
        this.handlers.onLobby(this.lobby())
        this.broadcastLobby()
      } else if (msg.type === 'action') {
        const seat = [...this.seats.entries()].find(([, c]) => c === conn)?.[0]
        if (seat !== undefined) this.handlers.onAction(msg.action, seat)
      }
    })

    conn.on('close', () => {
      for (const [seat, c] of this.seats) if (c === conn) this.seats.delete(seat)
      this.handlers.onLobby(this.lobby())
    })
  }

  broadcastLobby() {
    for (const [seat, conn] of this.seats) {
      if (conn.open) conn.send({ type: 'lobby', lobby: this.lobby(), seat } satisfies HostMessage)
    }
  }

  broadcastState(state: GameState) {
    this.started = true
    for (const conn of this.seats.values()) {
      if (conn.open) conn.send({ type: 'state', state } satisfies HostMessage)
    }
  }

  get playerNames(): string[] {
    return [...this.names]
  }

  get playerColors(): number[] {
    return [...this.colors]
  }

  destroy() {
    this.peer.destroy()
  }
}

interface GuestHandlers {
  onLobby: (lobby: Lobby, seat: number) => void
  onState: (state: GameState) => void
  onError: (message: string) => void
}

/** A guest: sends its name, then mirrors whatever the host broadcasts. */
export class GuestSession {
  private peer: Peer
  private conn?: DataConnection

  constructor(code: string, name: string, color: number, handlers: GuestHandlers) {
    this.peer = new Peer()

    this.peer.on('error', (err) => {
      handlers.onError(
        err.type === 'peer-unavailable'
          ? 'No game found with that code — check it with the host.'
          : `Connection problem: ${err.type}`,
      )
    })

    this.peer.on('open', () => {
      const conn = this.peer.connect(peerIdFor(code), { reliable: true })
      this.conn = conn
      conn.on('open', () => conn.send({ type: 'join', name, color } satisfies GuestMessage))
      conn.on('data', (raw) => {
        const msg = raw as HostMessage
        if (msg.type === 'lobby') handlers.onLobby(msg.lobby, msg.seat)
        else handlers.onState(msg.state)
      })
      conn.on('close', () => handlers.onError('Lost connection to the host.'))
    })
  }

  send(action: Action) {
    if (this.conn?.open) this.conn.send({ type: 'action', action } satisfies GuestMessage)
  }

  destroy() {
    this.peer.destroy()
  }
}
