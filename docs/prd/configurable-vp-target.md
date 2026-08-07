---
feature: configurable-vp-target
status: approved
ux-required: true
date: 2026-08-07
---
# Configurable VP target

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement.

## Problem

The win condition is a hardcoded `>= 10` check inside `reduce()` in engine.ts, computed once via `victoryPoints()` (players.ts) which sums settlements + 2×cities + VP dev cards + 2 for largest army + 2 for longest road. There's no way to play a shorter or longer game.

## Users & scenario

A group with limited time wants a quick game to 8. A group that wants a longer, more strategic game wants to play to 12 or 15.

## Scope (what we're building)

- Add a `vpTarget` field to `GameState`, set at lobby time (options: 8/10/12/15), defaulting to 10 (today's behavior).
- `reduce()`'s champion check compares against `state.vpTarget` instead of the literal `10`. This is a small, contained change — the win check already lives in exactly one place.
- Hud: show progress toward the configured target (today's `chip__vp` display just shows raw VP with no target context — worth showing e.g. "7 / 12").
- Longest-road (needs ≥5 road segments) and largest-army (needs ≥3 knights) bonus thresholds stay fixed at their standard values regardless of `vpTarget` — see open question below on whether that's actually correct across all targets.
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when a non-default VP target is active it shows in the top-left settings chip in `Hud.tsx`, visible to every player (in addition to the existing per-player VP-vs-target display already scoped above).

## Non-goals

- No new win conditions (Trade Empire / Builder alt paths are parked separately) — but see overview doc: the champion check should stay a single computed function so an alt win condition can plug in later without unwinding this change.

## How this changes game dynamics

- **Lower target (8)**: games run noticeably shorter, which means the opening setup placement (already the highest-leverage decision in the game) becomes proportionally even more decisive — there's less time to recover from a mediocre opening. The longest-road/largest-army bonuses (fixed at 2 VP each) become a much larger fraction of the target — 2 out of 8 is 25% of the win condition from a single bonus, versus 20% at the standard target of 10. A game to 8 is meaningfully more swingy, not just shorter.
- **Higher target (15)**: games run long, city-heavy economies (2 VP each, doubled production) dominate over settlement-spam, and VP-granting dev cards accumulate more value over a longer game since there's more time to draw them. This interacts with scarce bank mode (item 2): a long game with a shrunk bank is more likely to grind toward a resource-starved stalemate where nobody can finish builds — worth a playtest note once both ship, not a blocker now.
- Net effect: VP target isn't just "shorter/longer," it reweights which existing bonuses and card types matter most.

## Acceptance criteria

- Given a host picks a VP target, when the game starts, then `state.vpTarget` is set accordingly and the win check in `reduce()` uses it.
- Given the default target (10) is picked, when the game is played, then behavior is identical to today (regression check).
- Given any target, when a player's `victoryPoints()` reaches or exceeds it, then the game ends and declares them the winner, exactly as today's `>= 10` check does.
- Given a non-default target is active, when any player views the Hud, then the top-left settings chip reflects that.

## Success metric

No metric yet — this is a low-risk, low-effort item; ship and confirm no regression in standard-target games.

## Open questions (need user decision before feasibility)

~~1. Should longest-road/largest-army thresholds scale with VP target, or stay fixed?~~ — **resolved 2026-08-07: stay fixed** (5 roads / 3 knights at every target, matches standard Catan house-rule convention). No open questions remain.

## Feasibility (Architect fills this in)
