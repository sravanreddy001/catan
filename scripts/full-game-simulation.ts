/**
 * Headless playthrough smoke test: drives N complete 4-player games end to
 * end using the real reducer and the real bot brain (no UI, no mocks) to
 * catch reducer/AI bugs — infinite loops, thrown exceptions, games that
 * never reach a winner — before they ship.
 *
 * Run: npx tsx scripts/full-game-simulation.ts [gameCount]
 */

import { createGame, currentPlayerId, longestRoadHolder, reduce, type GameState } from '../src/game/engine'
import { chooseAction, chooseDiscard } from '../src/game/ai'
import { largestArmyHolder, victoryPoints, type PlayerId } from '../src/game/players'

const GAME_COUNT = Number(process.argv[2]) || 20
const MAX_ACTIONS_PER_GAME = 20000

interface GameResult {
  ok: boolean
  winner?: string
  turns?: number
  actions?: number
  error?: string
}

function playOneGame(index: number): GameResult {
  let state: GameState = createGame(4, undefined, undefined, {})
  let actions = 0

  try {
    while (state.winner === null) {
      if (actions++ > MAX_ACTIONS_PER_GAME) {
        return { ok: false, error: `exceeded ${MAX_ACTIONS_PER_GAME} actions without a winner (stuck?)` }
      }

      const owedSeats = Object.keys(state.discards) as unknown as PlayerId[]
      if (owedSeats.length > 0) {
        const seat = Number(owedSeats[0]) as PlayerId
        const cards = chooseDiscard(state, seat)
        state = reduce(state, { type: 'discard', playerId: seat, cards })
        continue
      }

      const seat = currentPlayerId(state)
      const action = chooseAction(state, seat)
      state = reduce(state, action ?? { type: 'endTurn' })
    }

    const winner = state.players[state.winner!]
    const largestArmy = largestArmyHolder(state.players)
    const longestRoad = longestRoadHolder(state.board, state.players)
    const vp = victoryPoints(winner, largestArmy, longestRoad)
    if (vp < state.settings.vpTarget) {
      return { ok: false, error: `game ${index}: winner ${winner.name} has ${vp} VP, below target ${state.settings.vpTarget}` }
    }

    return { ok: true, winner: winner.name, turns: state.turn, actions }
  } catch (err) {
    return { ok: false, error: `game ${index}: threw — ${(err as Error).message}\n${(err as Error).stack}` }
  }
}

const results: GameResult[] = []
for (let i = 0; i < GAME_COUNT; i++) {
  results.push(playOneGame(i))
}

const failures = results.filter((r) => !r.ok)
const successes = results.filter((r) => r.ok)

console.log(`\n${successes.length}/${GAME_COUNT} games completed cleanly.\n`)

if (successes.length > 0) {
  const avgTurns = successes.reduce((s, r) => s + (r.turns ?? 0), 0) / successes.length
  const avgActions = successes.reduce((s, r) => s + (r.actions ?? 0), 0) / successes.length
  console.log(`Average turns: ${avgTurns.toFixed(1)}`)
  console.log(`Average actions: ${avgActions.toFixed(0)}`)
  console.log(`Turn range: ${Math.min(...successes.map((r) => r.turns!))}–${Math.max(...successes.map((r) => r.turns!))}`)
}

if (failures.length > 0) {
  console.log(`\n${failures.length} FAILURE(S):`)
  for (const f of failures) console.log(`- ${f.error}`)
  process.exit(1)
} else {
  console.log('\nNo bugs found.')
}
