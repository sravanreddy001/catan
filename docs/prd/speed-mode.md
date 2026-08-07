---
feature: speed-mode
status: approved
ux-required: true
date: 2026-08-07
---
# Speed mode

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement.

**Double-7 handling, confirmed by user (2026-08-07):** the full discard-over-7 + robber rule applies on **both** dice rolls each turn, with no dampening on the second roll. The added chaos (up to two discard+robber cycles in a single turn) is accepted as intentional, not something to design around.

## Problem

A full game (manual setup phase, standard production pace) takes longer than some groups have time for. There's no fast variant.

## Users & scenario

A group wants a genuinely quick game — skip the ~10-15 minutes of manual opening placement, and speed up production so the game resolves in fewer turns.

## Scope (what we're building)

- **Skip manual setup, auto-place starting settlements+roads.** Today's setup phase (`advanceSetup` in engine.ts) has each player manually place 2 settlements and 2 roads in snake order (`setupOrder`), with the second settlement paying out its adjacent resources (existing rule, kept as-is). Speed mode replaces the manual placement loop with an automated one that still respects the distance rule (`vertexTargets`'s `distanceOk`) and still runs in snake order for fairness — see open question below on the exact placement algorithm.
- **2 dice rolls per turn.** Each turn, roll and resolve production twice before the build phase, instead of once. A 7 on *either* roll triggers the full existing discard-over-7 + robber-move flow (`owedDiscards`, the `discards`-gate, and `mode: 'robber'` in engine.ts's `roll` case) exactly as it does today for a single roll — confirmed, no dampening on the second roll, so a turn can in theory trigger the full 7 sequence twice.
- Lobby toggle, offline and online.
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when speed mode is active it shows in the top-left settings chip in `Hud.tsx`, visible to every player.

## Non-goals

- No change to piece limits, VP target, or costs — speed mode only touches setup and roll cadence.

## How this changes game dynamics

- **Skipping setup removes the single highest-skill-expression phase of the game.** In standard Catan, where you place your first two settlements — reading the board, weighing pip count against resource diversity against port access — is often the most strategically important sequence of decisions in the whole game (the bot's own `vertexScore` heuristic in ai.ts exists specifically to make this decision well). Auto-placing removes that skill entirely in exchange for speed. This is a real trade-off to be explicit about, not just "same game, faster."
- **Two rolls per turn roughly doubles resource production per turn**, which is most of why the game gets shorter — not just the saved setup time. But it also roughly doubles the chance of hitting a 7 in a given turn (from 1-in-6 per roll to a compound ~30% chance of at least one 7 across two rolls), meaning discard-forcing and robber disruption happen much more often per turn than in standard play. **Confirmed intentional**, not dampened — speed mode is meant to read as genuinely more chaotic, not just a faster version of the same experience.
- Net effect: a genuinely shorter, higher-variance, lower-skill-ceiling, *more chaotic* game — good for a quick pickup session, a clearly different experience from standard play rather than a strict subset of it.

## Acceptance criteria

- Given speed mode is on, when the game starts, then both players' opening settlements+roads are placed automatically (respecting the distance rule) and the game enters `phase: 'play'` immediately with no manual setup turns.
- Given speed mode is on, when a player's turn begins, then two dice rolls resolve in sequence, each producing resources per today's `produce()` logic, before the player can build.
- Given a 7 comes up on either roll during a speed-mode turn, then the full discard-over-7 + robber-move flow triggers, exactly as it would for a single-roll turn today — including a second full trigger if the second roll is also a 7 in the same turn.
- Given speed mode is off (default), then behavior is identical to today.
- Given speed mode is active, when any player views the Hud, then the top-left settings chip reflects that (see settings-overview.md's cross-cutting requirement).

## Success metric

Speed-mode games complete in meaningfully fewer real-world minutes than standard games (informal playtest comparison once shipped).

## Open questions (need user decision before feasibility)

1. ~~**Fairness algorithm for auto-placement**~~ — **resolved 2026-08-07: reuse the AI's `vertexScore` heuristic** (pip count + resource-diversity bonus) to assign each player a placement in snake order, same fairness property standard setup has today, just automated instead of manual. No open questions remain.
2. ~~**Double-7 handling**~~ — **resolved 2026-08-07: full flow on both rolls, no dampening, chaos intentional.** See the confirmation note at the top of this document.

## Feasibility (Architect fills this in)
