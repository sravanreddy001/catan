---
feature: bot-initiated-trades
status: parked
ux-required: false
date: 2026-08-07
---
# Bots never propose player-to-player trades

## Problem

Raised during triage of a live-multiplayer bug report ("I was never asked for trades"): even setting the WebRTC bug aside, bots never initiate a trade with a human or another bot in the first place. `chooseAction` in [ai.ts](../../src/game/ai.ts) only ever returns `bankTrade` (via `tradeTowardsGoal`) when it needs a resource — it never constructs a `{ type: 'propose', offer }` action, so `state.offer` is only ever set by a human using the Trade panel. Bots will happily *respond* to an offer aimed at them (`respondToOffer`), but they never make one.

## Users & scenario

A human playing against bots (offline) or alongside bots (online) never gets a trade offer *from* a bot — all bot resource-acquisition happens invisibly via the bank, even when a player-to-player trade would be the better (or only) move once the bank is dry on what the bot needs.

## Scope sketch (not yet designed)

- `ai.ts`: `chooseAction` would need a new branch — likely after `tradeTowardsGoal`'s bank-trade attempt fails or is unavailable (e.g. bank dry on the wanted resource, per the just-fixed dry-bank guard) — that proposes a `TradeOffer` (see `players.ts`) to a specific seat or `'any'`.
- Needs a give/want selection heuristic (what's a bot willing to give up, what ratio is "fair" from the bot's perspective) — likely reusable from `respondToOffer`'s existing gain/loss scoring, run in reverse.
- Needs a decision on offer *frequency* (a bot proposing every turn it's short a resource would be spammy) and whether preset personalities (`AIPreset`) should affect willingness to initiate, mirroring how they already affect `respondToOffer`.

## Non-goals (proposed, not confirmed)

- Not attempting bot-vs-bot negotiation chains or counter-offers — a bot proposing once per turn at most, accept/decline only, matches today's human-facing offer model.

## Status

Parked — logged for later, not scheduled. No feasibility or acceptance criteria drafted yet; needs a Product pass when picked up.
