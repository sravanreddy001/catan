---
feature: public-hand-mode
status: approved
ux-required: true
date: 2026-08-07
---
# Public hand mode

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement — this is the item where the codebase fact matters most.

## Problem

New players and teaching sessions benefit from seeing everyone's hand, but the game has no such mode — opponent hand contents are simply never rendered.

## Users & scenario

Someone teaching a friend the game, or a casual/kids' table, wants full transparency so trades and robber decisions can be reasoned about openly rather than guessed at.

## Scope (what we're building)

- **This is a UI-only change.** Confirmed by reading `net/session.ts`: `HostSession.broadcastState()` already sends the complete `GameState` — every player's full `hand`, the entire dev deck order — to every connected client, always. `Hud.tsx`'s `HandBar` component just happens to only ever be called with the local player's own hand, and `PlayerStrip` shows names/badges/VP only. There is no hidden-information protocol to change; the data is already present on every client (online or offline).
- Add a toggle (lobby, host-only for online games) that, when on, renders a `HandBar`-style breakdown for every player, not just the local one.
- No engine change, no `GameState` schema change, no network change (beyond the shared `settings` object every item in this list now contributes a field to, per the overview's cross-cutting requirement — that's shared plumbing, not specific to this item).
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when public hand mode is active it shows in the top-left settings chip in `Hud.tsx`, visible to every player — distinct from and in addition to the actual hand contents this toggle reveals elsewhere in the Hud.

## Non-goals

- No change to what bots can "see" — bots already read full state today via `chooseAction`/`respondToOffer` regardless of this toggle, since they're not UI-gated in the first place. Public hand mode only affects what *human* players see on screen.

## How this changes game dynamics

- Removes the deduction/bluffing layer entirely: normally, judging what an opponent might need (for a trade, or before moving the robber) requires reading their builds and guessing, sometimes wrongly. With public hands, that guesswork becomes lookup — "I can see you need 1 more brick" replaces "you're probably close to a road."
- Trading stops being a game of information asymmetry and becomes closer to a solved resource-allocation problem between two known hands — good for teaching (a new player can see exactly why a trade is or isn't fair) but a genuine loss of strategic depth for experienced players, which is why this should ship as an explicit toggle rather than a default.
- Robber-driven stealing (`stealFrom` in engine.ts, currently a random card from a random victim on the tile) stops being a gamble in the sense that players know in advance exactly what they might steal, even though the mechanic itself still picks randomly from the visible hand — the suspense of "what did I just take" goes away, only the who/what before the roll becomes known.

## Acceptance criteria

- Given a host enables public hand mode before starting, when the game is in play, then every player's Hud shows every other player's hand contents (not just counts), for both offline and online modes.
- Given the mode is off (default), when the game is in play, then behavior is identical to today.
- Given a game is online, when public hand mode is on, then no additional network messages are needed — this should be implementable with zero changes to `net/session.ts` or `HostMessage`/`GuestMessage` types.
- Given public hand mode is active, when any player views the Hud, then the top-left settings chip reflects that.

## Success metric

No metric — this is a cheap, low-risk teaching-mode toggle; ship and confirm it doesn't require any protocol work (validates the "UI-only" claim above).

## Open questions (need user decision before feasibility)

- None — this item is unusually unambiguous given the broadcast-model finding above.

## Feasibility (Architect fills this in)
