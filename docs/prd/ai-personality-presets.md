---
feature: ai-personality-presets
status: approved
ux-required: true
date: 2026-08-07
---
# AI personality presets

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement (this item's presets are per-bot-seat AI styles — distinct from, and unrelated to, the overview's "quick-select settings bundle" presets, which is an unfortunate naming collision worth flagging so the two aren't conflated during design).

## Problem

There is exactly one bot personality today — `ai.ts`'s heuristics (`vertexScore`, `robberTarget`, `tradeTowardsGoal`, `respondToOffer`) are fixed weights with no parameterization, and `botSeats: number[]` in `App.tsx` (not the engine) has no concept of per-seat behavior. Every offline AI opponent plays identically.

## Users & scenario

A solo player wants varied, more interesting offline opponents — some that play aggressively and disrupt the human, some that turtle and build steadily, rather than N copies of the same bot.

## Scope (what we're building)

- Confirmed by reading `App.tsx`: bots are purely a client-side concern (`botSeats` local state, not part of `GameState`), and `chooseAction`/`chooseDiscard`/`respondToOffer` in ai.ts take no config today. This means presets are containable to `ai.ts` (parameterize the heuristics) + `App.tsx` (track a profile per bot seat instead of just a flat seat list) + `Lobby.tsx` (a new per-bot picker step in the offline flow, which today only asks opponent count then the human's color — bot names are auto-generated "Bot 1", "Bot 2" with no per-bot configuration at all).
- Three presets, as a concrete starting proposal grounded in today's actual heuristic hooks (not final — flagged as an open question for the user to confirm or adjust):
  - **Aggressive** — `robberTarget`'s existing "hitsLeader" bonus weighted higher (targets the leader harder and more often), plays knights proactively rather than only when convenient, `respondToOffer`'s accept threshold tightened (trades less generously with the human).
  - **Economic** — `vertexScore`'s resource-diversity/pip weighting increased, prioritizes city upgrades over new settlements once one is available, `tradeTowardsGoal` loosened (trades more readily to complete the next build).
  - **Turtle** — favors settlement/road spread for longest-road over city upgrades, `robberTarget` biased away from picking fights (avoids tiles touching whoever's already ahead unless forced), holds resources rather than trading (raises `respondToOffer`'s accept bar further).
- Lobby: after picking opponent count, a new step lets the host assign a preset per bot seat (default: random assignment if skipped, so this never blocks a quick offline start).
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when any bot has a non-default personality assigned it shows in the top-left settings chip in `Hud.tsx`. Since this is offline-only, "every player" here means the local human — there's no guest to broadcast to.

## Non-goals

- No difficulty levels (easy/hard) — this is about play style, not strength. Today's single bot is "medium-strength" per its own code comment; presets should stay roughly comparable in strength to avoid quietly becoming a difficulty selector in disguise.
- No online/networked bots — bots only exist offline today and this doesn't change that.

## How this changes game dynamics

- Today, every offline game plays against N identical opponents with predictable, uniform behavior once you've learned the bot once. Presets make each offline game distinct: an aggressive bot makes the robber and knight-play threatening and forces the human to hedge board position against being targeted; an economic bot races for city upgrades and out-produces rather than disrupts; a turtle bot is a slow, low-risk opponent that mostly ignores confrontation, which changes how urgently the human needs to contest the board early.
- Net effect: offline replay value goes up (mixing presets across opponents produces meaningfully different games), and it gives the human a way to practice against different opponent archetypes deliberately (e.g. "I want to practice defending against an aggressive robber player").

## Acceptance criteria

- Given a host assigns presets to bot seats, when the game runs, then each bot's `chooseAction`/`robberTarget`/`respondToOffer` decisions visibly reflect its assigned preset's weighting (verifiable via distinct behavior in a scripted playtest — e.g. an aggressive bot's robber lands on the human's best tile measurably more often than a turtle bot's).
- Given no presets are assigned (host skips the step), when the game starts, then bots default to today's single behavior (or a random preset per bot — pick one, flag as a small open decision, not blocking).
- Given a preset is active, when the bot's strength is compared to today's single bot across a full game, then it should not be strictly stronger or weaker overall — presets are a style axis, not a difficulty axis (informal playtest check).
- Given at least one bot has a non-default personality, when the human views the Hud, then the top-left settings chip reflects that.

## Success metric

No hard metric — qualitative "bots feel different from each other" from playtesting once shipped.

## Open questions (need user decision before feasibility)

1. ~~Confirm the 3 proposed presets and their behavior deltas, or specify different ones~~ — **resolved 2026-08-07: confirmed as proposed**, no changes. No open questions remain.

## Feasibility (Architect fills this in)
