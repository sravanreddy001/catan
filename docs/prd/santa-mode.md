---
feature: santa-mode
status: approved
ux-required: true
date: 2026-08-07
---
# Santa mode

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement. This is item #8 in the committed list (variable board size, originally item #1, was later dropped).

## Problem

The robber/7-roll mechanic is the game's main form of direct, targeted player-vs-player disruption (block a tile, steal a card). Some groups — casual tables, kids, a holiday-themed session — want a friendlier variant where a 7 is a bonus for whoever rolled it instead of a punishment aimed at an opponent, with the hoarding penalty (discard-over-7) kept as the only consequence.

## Users & scenario

A group wants a lower-conflict, higher-warmth variant for a casual or holiday-themed game — no blocking, no stealing, just a small "roll a 7, get a free resource" bonus, while still discouraging hand-hoarding the way the standard game already does.

## Scope (what we're building)

Santa mode is a **single lobby toggle, mutually exclusive with classic robber play** — a full swap, not a per-hex option and not something that alternates turn to turn. Grounded in the actual engine code paths in `src/game/engine.ts`:

- **Desert hex reskin — cosmetic only.** The desert tile (`TileType`'s `'desert'` value in `board.ts`) is rendered as a "snow mountain" (new label/icon in `Board.tsx`) when Santa mode is on. Recommend keeping the internal `TileType` value as `'desert'` and changing only the display layer — renaming the type value itself throughout `board.ts`/`engine.ts` is a larger, purely cosmetic-motivated diff for no functional gain (flagged as an open question below in case the user wants the rename anyway). No change to the tile's non-production status — it still carries no number token and produces nothing when settled adjacent, exactly as today.
- **The robber piece/blocking mechanic is removed entirely — no piece is ever placed, not even a relocated one.** Concretely, when Santa mode is on:
  - `GameState.robberTile` still exists as a field (avoids a wider type change), but in Santa mode nothing ever sets `mode: 'robber'`, so the `'tile'` action case (engine.ts, the only code that reads `mode === 'robber'` and calls `stealFrom()`) is simply never reached. `stealFrom()` (engine.ts, random-victim-random-card steal) never executes in Santa mode. Neither function needs to be deleted — classic mode still needs both — they just go permanently unreached while Santa mode is active.
  - `Board.tsx`'s robber-rendering layer (the `<g className="robber">` block that draws the piece on `state.robberTile`) must not render at all in Santa mode — not moved onto the snow mountain, not hidden-but-present, genuinely never drawn. This needs an explicit Santa-mode branch in `Board.tsx`, not just "mode never becomes robber so it never gets a target" (today's rendering reads `robberTile` directly and would still draw *something* on the desert tile by default without an explicit guard).
  - `ai.ts`'s `robberTarget()` and its call site (`if (state.mode === 'robber') return { type: 'tile', ... }`) never fire in Santa mode for the same reason — `mode` never becomes `'robber'`.
- **On rolling a 7: the active player picks one resource type and takes 1 free from the bank.** This replaces the robber-move step, not the discard step (see below). Mechanically: this is a Year-of-Plenty-style single-resource bonus, not a steal — no opponent loses anything. Recommended implementation, mirroring the existing `picking: 'monopoly' | 'plenty' | null` state-machine pattern already in `GameState`: extend `picking` with a new mode (e.g. `'santaBonus'`), entered once any owed discards clear, resolved by a new pick action that adds 1 of the chosen resource to the active player's hand and removes it from `state.bank` — no-op if the bank is already at 0 for every resource (same "nothing to give" edge the existing bank-depletion rule in `produce()` already handles elsewhere).
  - This only replaces the branch in the `roll` action's `a + b === 7` handling that currently sets `mode: pending ? null : 'robber'` — the branch that computes `owedDiscards()` and sets `state.discards` is untouched.
- **The existing >7-card discard-half rule still triggers normally.** `owedDiscards()`, the `discards` field, the `discards`-non-empty gate at the top of `step()` (which blocks every action except `discard` until all owed discards resolve), and the `'discard'` action itself are all left exactly as-is. Every over-limit player still discards half their hand on a 7, in Santa mode or not — only the block/steal mechanic that follows is replaced.
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when Santa mode is active it shows in the top-left settings chip in `Hud.tsx`, visible to every player.

## Non-goals

- No per-hex or partial application — Santa mode is a full swap for the whole game, confirmed by the user as mutually exclusive with classic robber play, not a hybrid or alternating mode.
- No change to the desert tile's production rules beyond the cosmetic reskin — it's still a dead tile.
- No change to Saboteur (`new-dev-card-types.md`, if it ships) — that's an independent disruption mechanic (removes a road edge, not a hex). The two aren't in conflict and don't need to interact, just worth a shared balance look later since both affect "how disruptive is a turn" from different angles (see settings-overview.md's sequencing notes).

## How this changes game dynamics

Robber/blocking is one of the only genuinely adversarial mechanics in the base game — targeted denial of a tile plus a card steal, both aimed at a specific opponent. Santa mode removes all of that and replaces the 7 with a pure, bank-limited economic bonus for whoever happens to roll it. Rolling a 7 stops being something players can wield strategically against an opponent (no more "sit the robber on the leader's ore tile") and becomes purely swingy-positive for the roller, with the only remaining downside being the unchanged over-hand discard penalty. Net effect: a friendlier, lower-interaction, more chaotic-positive variant — a genuinely different game rather than reskinned classic play, well suited to a casual, kid-friendly, or holiday-themed table, in the same spirit as how speed mode is framed as a different experience rather than a strict subset of standard play.

## Acceptance criteria

- Given Santa mode is on, when the board renders, then the desert hex shows the snow-mountain skin and no robber piece is ever drawn on any tile, at any point in the game.
- Given Santa mode is on, when a 7 is rolled, then every player holding more than 7 cards discards half exactly as in classic mode (unchanged `owedDiscards`/`discard` flow), and no robber-placement step ever occurs afterward.
- Given Santa mode is on, when any owed discards from a 7 have resolved (or there were none), then the active player is prompted to pick one resource type and receives +1 of it from the bank, or 0 if the bank is already dry on every resource.
- Given Santa mode is off (default), when the game is played, then behavior is identical to today, including knight/robber behavior.
- Given Santa mode is on, when a player plays a Knight dev card, then they receive the same "pick 1 free resource from the bank" bonus as rolling a 7 (resolved 2026-08-07, see below), and the card still counts toward Largest Army as normal.
- Given Santa mode is active, when any player views the Hud, then the top-left settings chip reflects that.

## Success metric

No metric yet — this is a low-risk, mechanically-contained variant; ship and confirm via informal playtest that it reads as "friendlier," not just "the robber didn't show up" (i.e. the bank-bonus replacement feels like a real, legible mechanic rather than a missing feature).

## Open questions (need user decision before feasibility)

~~1. What does playing a Knight dev card do in Santa mode?~~ — **resolved 2026-08-07: option (b).** Playing a Knight grants the same "pick 1 free resource from the bank" bonus as a rolled 7 — an on-demand version of the Santa-mode 7 bonus. `playDev`'s `'knight'` case changes from setting `mode: 'robber'` to entering the same `picking: 'santaBonus'` state the 7-roll branch uses. The card still counts toward Largest Army as normal; deck composition is unchanged.

1. **Desert tile internal naming**: keep `TileType`'s `'desert'` value as-is with only the label/icon changed at the display layer (recommended default, smaller diff), or rename the type value itself (e.g. to `'snowMountain'`) throughout `board.ts`/`engine.ts`? Flagging as a real, if small, implementation choice rather than deciding it here — non-blocking, can be settled at feasibility or UX-mock time.

## Feasibility (Architect fills this in)
