---
feature: variable-board-size
status: dropped
ux-required: true
date: 2026-08-07
scope-confirmed: folded-into-fog-of-war
---
# Variable board size

See [settings-overview.md](./settings-overview.md) for shared codebase context and sequencing notes, and its cross-cutting HUD-indicator/preset requirement.

**Dropped as a standalone item (2026-08-07).** User call: the standard 3-4 player board stays fixed at 19 hexes — no "mini" variant is wanted. The only place a smaller-starting-board idea still applies is fog-of-war's "start small, expand at the edges" mechanic, which is itself parked (tweak item, not committed this round). This document is kept for its Phase B / mega-board context (still relevant background if 5-8 player support is ever picked up), and for the ring-generator reasoning fog-of-war will eventually need — but nothing in this file is scheduled work right now.

Everything below is retained as reference only, not active scope.

## Problem

The board is a single hardcoded 19-hex layout (`board.ts` `TILE_COORDS`), sized for the standard 3-4 player game. Players who want a shorter game (fewer tiles, faster contention) or who want more than 4 people at the table have no option — the layout, the tile/number distributions, and the player-count type itself (`PlayerId = 0|1|2|3`, 4-swatch `PALETTE`, 4-seat cap in `HostSession`) are all fixed.

## Users & scenario

A group of 2-3 friends wants a tighter, quicker board than the standard one. Separately, a group of 6-8 wants to play together on one board instead of splitting into two games. These are two different asks with very different implementation cost — see scope split below.

## Scope (what we're building)

**Phase A — mini/standard board, 3-4 players. This is the entirety of this PRD's committed scope for this round; Phase B below is reference context only, not scheduled work:**
- Rewrite `board.ts` tile placement from the hardcoded `TILE_COORDS` array to a ring-based generator: given a ring count, produce axial coordinates, tile-type distribution (scaled proportionally from the standard 4/4/4/3/3/1 lumber/wool/grain/brick/ore/desert mix), and number tokens (avoiding 6/8 adjacency, same constraint the standard board already respects informally via its fixed `NUMBER_TOKENS` order).
- Add a "mini" size: fewer tiles than standard (open question — see below on exactly how many).
- `buildPorts()` already generalizes over coastline length — no change needed there.
- Lobby: a board-size picker in the offline/host setup flow, before color selection.
- `PIECE_LIMITS` (5 settlements / 4 cities / 15 roads per player) stay fixed regardless of board size — a smaller board with the same piece supply per player is itself part of what makes it play faster (less room before pieces run out).
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when a non-standard board size is active it shows in the top-left settings chip in `Hud.tsx`, visible to every player.

**Phase B — mega board, 5-8 players (explicitly deferred, separate future PRD, not committed now):**
Kept here only as context for why Phase A is scoped the way it is — this section is not a commitment to build it, has no target date, and should be re-scoped as its own PRD (with its own feasibility pass) whenever it's actually prioritized:
- Everything in Phase A, plus lifting the 4-player ceiling: widen `PlayerId`, extend `PALETTE` to 8 colors, remove the two hardcoded seat caps in `net/session.ts`'s `HostSession`, rework `Lobby.tsx`'s offline/online seat-count screens, and re-check `Board.tsx` viewport/zoom and `PlayerStrip` layout at 8 chips instead of 4.
- Decide whether to adopt any of the official 5-6 player expansion's turn-structure rules (e.g. special building phase) or purely scale the tile count while keeping today's turn structure — this changes pacing, not just board size, and is a real design call, not implied by "bigger board."

## Non-goals

- Fog-of-war map expansion (parked separately) — not built here, but Phase A's generator is written so it doesn't block that work later (see overview doc).
- Phase B (mega board / 5-8 players) — confirmed out of scope for this PRD (see scope note above). Not a "maybe later this round," a firm separate-PRD deferral.

## How this changes game dynamics

- **Mini board**: same piece counts, fewer tiles → corners are scarcer, resource contention starts on turn 1 instead of once players expand, the robber is more disruptive (fewer alternate tiles to sit on), and games run shorter because players run out of room to expand, not just because they hit the VP target faster. This is a materially different, more confrontational game, not just "the same game with less setup."
- **Mega board** (if built): more tiles means production is spread thinner per player relative to board size, ports/harbours become more contested since there are proportionally more players chasing them, and the robber becomes a much weaker tool (more places to hide from any single player's reach). Game length increases unless VP target or piece limits are also raised — flagged as an interaction with item 5.

## Acceptance criteria

- Given a host picks "mini" board size, when the game starts, then the board renders with fewer tiles than standard, ports are placed automatically around the new coastline, and setup/play proceed exactly as today (snake order, distance rule, etc.) with no engine changes beyond board size.
- Given the standard board size is picked, when the game starts, then the board is pixel-identical in distribution to today's board (regression: the generator must reproduce the existing 19-tile game when ring count = today's value).
- Given any board size, when `vertexTargets`/`edgeTargets`/`longestRoadLength` run, then they behave correctly with no assumption of exactly 19 tiles (audit these functions for hardcoded tile-count assumptions).

## Success metric

Mini-board games complete in noticeably fewer turns than standard (informal playtest comparison, no hard number yet — revisit once Phase A ships).

## Open questions (need user decision before feasibility)

1. Does "mini" mean a genuinely smaller tile count (e.g. 13 tiles instead of 19), or is "mini" just relabeling the existing standard board since it already supports 3-4 players? These are very different amounts of work. (Still open — not addressed by the Phase A/B scope confirmation, which only settled *whether* to build a mega board this round, not the mini board's exact size.)

~~2. Is 5-8 player support (Phase B) wanted now, or should this PRD ship Phase A only~~ — **resolved 2026-08-07: Phase A only, this round.** See scope note at top of this document.

## Feasibility (Architect fills this in)
