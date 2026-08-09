---
feature: endless-fog-of-war
status: draft
ux-required: true
date: 2026-08-08
---
# Endless mode & fog of war

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement.

Parked as a "tweak item" through the settings expansion; picked up on 2026-08-08 after VP target 15 was dropped, because the reason 15 was attractive — wanting a long game — belongs to a mode, not to a number.

**Status: draft, not committed.** This document exists to make the design calls explicit before any engine work. Two features are described together because they were asked for together and share one idea (a board that is not fully known at turn one), but they can ship independently and are scoped separately below.

## Problem

Two different complaints, one root cause — the game has exactly one shape:

1. **There is no long game.** Every game ends at a VP target, and the only "longer game" lever was raising that target. Raising it stranded games instead of extending them: 37% of four-player games at target 15 never produced a winner, because the board caps out at 13 VP from pieces and bonuses (4 cities, 1 settlement, longest road, largest army). Pushing a threshold past what the board can supply does not make a longer game, it makes an unfinishable one.
2. **The board holds no surprises.** Every tile, number and port is visible before the first settlement goes down. Opening placement is a solved optimisation over perfect information, which is why strong openings are memorisable and why the first two turns feel like arithmetic rather than exploration.

## Users & scenario

- A group that wants an evening-long game rather than a 40-minute one, and wants it to end because someone won, not because the clock ran out.
- Players who have played enough that the opening is rote, and want the map itself to be something they discover.

## Scope — Endless mode (smaller, ships first)

- New setting `endless: boolean`. When on, `vpTarget` stops being a win condition — the points win check never fires.
- The game ends when **nobody can build anything further**: every player is out of pieces, or no combination of bank and hands can fund any remaining legal build. Highest VP total then wins, ties broken by longest road, then largest army.
- Add an explicit **"End game now"** control that any player may propose and the others accept, for when the table simply wants to stop. Modelled on the existing trade-offer accept/decline flow rather than a new mechanism.
- The HUD scoreboard switches from "7 / 10" to a running total plus the current leader, since there is no target to count towards.
- Piece limits stay as they are. The point is that the game ends when the board fills up, so raising them would defeat it.

**Open question (decide before build):** should endless mode recycle the dev deck? Today a 25-card deck runs out and `buyDev` is dead for the rest of the game. In a game meant to run long, a permanently dead build option is a real problem. Options: (a) leave it dead — an empty deck is itself an endgame signal; (b) reshuffle played non-victory cards back in when it empties. Recommend (b), but this is a game-design call, not an implementation detail.

## Scope — Fog of war (larger, needs its own feasibility pass)

- The board generator already takes a ring count (`ringCoords`, shipped with the 5-8 player board). Fog uses it: the game starts at 1-2 rings and grows.
- Tiles outside a player's explored region render as unknown — no type, no number, no port — and become known when that player builds a settlement or road adjacent to them.
- **Expansion at the edges**: when the outermost ring is fully claimed, a new ring is generated and appended. The generator therefore has to become incremental (add a ring to an existing board) rather than whole-board-only. That is the one real engine change here.
- Robber, longest road and production keep working on known tiles exactly as today. Fog is an information rule, not a rules change.

**The honest caveat:** `HostSession.broadcastState()` sends the whole `GameState` to every client, which is exactly what makes public-hand mode and dev-card drafting free. Fog of war is the first feature where hiding information from a player is the *point*, so a determined guest can read the unexplored map straight out of the broadcast. Offline against bots this does not matter. Online it means fog is a convention among friends, not a guarantee — and making it a guarantee needs per-seat filtered broadcasts, a protocol change touching every message rather than a UI change. **Decide which of those we are building before starting**; they are days apart in cost.

## Non-goals

- No campaign, no persistence between games, no scenario maps.
- No changes to the robber, trading, or dev card rules.
- Endless mode is not "raise the VP target" — the target stops applying entirely.

## Acceptance criteria (endless mode)

- Given endless mode is on, when a player reaches the old VP target, then nothing happens and play continues.
- Given endless mode is on and nobody can legally build anything, when that turn ends, then the game ends and the highest VP total is declared the winner.
- Given endless mode is on, when a player proposes ending the game and every other player accepts, then the game ends and is scored the same way.
- Given endless mode is on, when any player views the HUD, then the settings chip reflects it and the scoreboard shows running totals rather than a target.

## Acceptance criteria (fog of war)

- Given fog is on, when the game starts, then a player sees only the starting ring plus tiles adjacent to their own placements.
- Given a player builds adjacent to an unknown tile, when the build resolves, then that tile's type and number become visible to that player.
- Given the outermost ring is fully claimed, when the next turn begins, then a new ring exists, generated to the same distribution rules, with every existing vertex and edge id unchanged.

## Open questions (need user decision before feasibility)

1. Endless mode's dev deck: recycle when empty, or leave it empty? (Recommend recycle.)
2. Fog online: convention-only (cheap, UI-only) or enforced by per-seat state filtering (expensive, protocol change)?
3. Does fog imply endless, or are they independent settings that happen to combine well? (Recommend independent.)
4. Must bots respect fog — play as if they cannot see unexplored tiles — or is bot omniscience acceptable? A bot that ignores fog will out-place every human in a fog game.

## Feasibility (Architect fills this in)

Not yet run. Question 2 should be answered first — the two answers have materially different verdicts.
