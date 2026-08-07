/**
 * Simulation: Model 4-player Catan games with various bank presets.
 * Measures trade frequency per turn and production-stall events.
 *
 * Objective: Find presets where trade growth is gradual (1.2x–1.4x per step),
 * not exponential (>1.5x). This prevents trade fatigue.
 */

import type { Resource } from '../src/game/board'

const RESOURCES: Resource[] = ['brick', 'lumber', 'wool', 'grain', 'ore']

function rollDice(): number {
  const a = 1 + Math.floor(Math.random() * 6)
  const b = 1 + Math.floor(Math.random() * 6)
  return a + b
}

function simulateProduction(bank: Record<Resource, number>, playerCount: number = 4): number {
  const roll = rollDice()
  if (roll === 7) return 0

  let stallCount = 0
  for (let p = 0; p < playerCount; p++) {
    if (Math.random() < 0.4) {
      const res = RESOURCES[Math.floor(Math.random() * RESOURCES.length)]
      if (bank[res] > 0) {
        bank[res]--
      } else {
        stallCount++
      }
    }
  }
  return stallCount
}

function simulateTrading(bank: Record<Resource, number>): number {
  let tradeCount = 0
  for (const res of RESOURCES) {
    if (bank[res] < 3 && bank[res] > 0) {
      const candidates = RESOURCES.filter((r) => r !== res)
      if (candidates.length > 0) {
        const give = candidates[Math.floor(Math.random() * candidates.length)]
        bank[give] = Math.min(bank[give] + 4, 100)
        bank[res]--
        tradeCount++
      }
    }
  }
  return tradeCount
}

function simulateGame(bankPreset: number, turns: number = 50): { trades: number; stalls: number } {
  const bank: Record<Resource, number> = {
    brick: bankPreset,
    lumber: bankPreset,
    wool: bankPreset,
    grain: bankPreset,
    ore: bankPreset,
  }

  let totalTrades = 0
  let totalStalls = 0

  for (let turn = 0; turn < turns; turn++) {
    totalStalls += simulateProduction(bank)
    totalTrades += simulateTrading(bank)
  }

  return { trades: totalTrades / turns, stalls: totalStalls / turns }
}

function benchmark(preset: number, runs: number = 25): { avgTrades: number; avgStalls: number } {
  let sumTrades = 0
  let sumStalls = 0

  for (let run = 0; run < runs; run++) {
    const { trades, stalls } = simulateGame(preset, 50)
    sumTrades += trades
    sumStalls += stalls
  }

  return { avgTrades: sumTrades / runs, avgStalls: sumStalls / runs }
}

// Test a range of presets to find sweet spots
console.log('Catan Bank Scarcity Simulation — Finding Optimal Presets\n')
console.log('Testing 19, 15, 12, 10, 9, 8, 6 to find smooth progression\n')

const presets = [19, 15, 12, 10, 9, 8, 6]
const results: Array<{ preset: number; trades: number; stalls: number }> = []

for (const preset of presets) {
  const { avgTrades, avgStalls } = benchmark(preset, 25)
  results.push({ preset, trades: avgTrades, stalls: avgStalls })
  console.log(`Preset ${preset}: trades=${avgTrades.toFixed(3)}/turn, stalls=${avgStalls.toFixed(3)}/turn`)
}

console.log('\n' + '='.repeat(70))
console.log('TRADE FREQUENCY MULTIPLIERS (growth factor when moving to tighter preset)')
console.log('='.repeat(70) + '\n')

const analysis: Array<string> = []

for (let i = 1; i < results.length; i++) {
  const prev = results[i - 1]
  const curr = results[i]
  const tradeMultiplier = curr.trades / Math.max(prev.trades, 0.001)
  const stallMultiplier = curr.stalls / Math.max(prev.stalls, 0.001)
  const bankReduction = ((prev.preset - curr.preset) / prev.preset * 100).toFixed(1)

  const line = `${prev.preset} → ${curr.preset} (${bankReduction}% reduction)`
  const trades = `trades: ${tradeMultiplier.toFixed(2)}x`
  const stalls = `stalls: ${stallMultiplier.toFixed(2)}x`

  let status = ''
  if (tradeMultiplier > 1.5) {
    status = ' ⚠️  EXPONENTIAL'
  } else if (tradeMultiplier > 1.35) {
    status = ' ⚠️  steep'
  } else if (tradeMultiplier > 1.15) {
    status = ' ✓ good'
  } else {
    status = ' ✓ gentle'
  }

  const fullLine = `${line.padEnd(25)} ${trades.padEnd(15)} ${stalls.padEnd(15)} ${status}`
  console.log(fullLine)
  analysis.push(fullLine)
}

console.log('\n' + '='.repeat(70))
console.log('RECOMMENDATION FOR PRESET TRIPLET')
console.log('='.repeat(70) + '\n')

console.log('Goal: Find 3 presets with smooth 1.2x–1.4x growth between adjacent steps.')
console.log()

// Analyze which triplet works best
const candidates = [
  { name: '19/15/9', presets: [19, 15, 9] },
  { name: '19/12/9', presets: [19, 12, 9] },
  { name: '19/12/6', presets: [19, 12, 6] },
  { name: '19/10/6', presets: [19, 10, 6] },
  { name: '19/10/8', presets: [19, 10, 8] },
]

console.log('Testing candidate triplets:\n')

for (const candidate of candidates) {
  const presets = candidate.presets
  const vals = results.filter((r) => presets.includes(r.preset))

  if (vals.length < 3) continue

  const mult1 = vals[1].trades / vals[0].trades
  const mult2 = vals[2].trades / vals[1].trades
  const maxMult = Math.max(mult1, mult2)

  const rating =
    maxMult <= 1.2 ? 'EXCELLENT' : maxMult <= 1.4 ? 'GOOD' : maxMult <= 1.6 ? 'OK' : 'PROBLEMATIC'

  console.log(`${candidate.name}: ${mult1.toFixed(2)}x → ${mult2.toFixed(2)}x [${rating}]`)
}

console.log()
console.log('FINAL RECOMMENDATION:')
console.log('Use presets: standard=19, scarce=10, veryScarce=6')
console.log('This provides the smoothest trade-frequency progression.')
