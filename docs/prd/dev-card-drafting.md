---
feature: dev-card-drafting
status: approved
ux-required: true
date: 2026-08-07
---
# Dev card drafting

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement. Recommended to ship after [new-dev-card-types](./new-dev-card-types.md), not before — see that doc's Scout note and the sequencing section in the overview.

## Problem

Buying a dev card today (`buyDev` in engine.ts) takes the top card of `state.deck` blind — pure luck. There's no way to make a choice about which card to get.

## Users & scenario

Players who want dev-card purchases to be a decision rather than a coin flip — see 3 options, pick the one that fits their current need, accept that the other 2 go back into circulation rather than being denied to opponents outright.

## Scope (what we're building)

- Change the buy flow: instead of `buyDev` immediately granting a card, it reveals the top 3 cards of `state.deck` to the buying player (new state, e.g. `draftOptions: DevKind[] | null`, following the same pattern as the existing `picking: 'monopoly' | 'plenty'` flow). A new action (e.g. `draftPick`) lets the player choose one; the other two go to the bottom of the deck in their original relative order.
- Payment (the `DEV_COST` resources) is deducted at the moment of purchase, same as today — drafting only changes what you get, not what it costs.
- No network/protocol work needed: the host already broadcasts the full `state.deck` to every client (confirmed in `net/session.ts`), so revealing 3 cards to the picking player is a UI change (show the 3 options to whoever's `currentPlayerId`), not a new data-visibility mechanism.
- AI: `chooseAction` in ai.ts needs a drafting decision (today it just calls `buyDev` when it decides to buy) — pick the most useful of the 3 revealed kinds given its current goal, mirroring the existing `tradeTowardsGoal`-style goal check.
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when drafting is enabled it shows in the top-left settings chip in `Hud.tsx`, visible to every player.

## Non-goals

- No permanent removal of cards from the deck — "rest go to bottom" means delayed, not denied. Don't build a discard-forever variant unless asked.

## How this changes game dynamics

- Removes blind-draw variance from dev-card purchases — a player who buys 4 cards across a game no longer just hopes for a useful mix, they get to steer toward what they need (e.g. skip a monopoly they can't use well, take the knight instead).
- Because "rejected" cards go to the bottom rather than vanishing, this isn't a way to deny opponents specific cards long-term — it only delays what they might draw, and a canny opponent can start tracking (via repeated draft reveals) roughly what's left in the deck and where in it. That's a new form of information a skilled player can extract that doesn't exist today; casual players won't bother and won't be worse off.
- Combined with [new dev card types](./new-dev-card-types.md), this is where the choice gets real texture — deciding between Saboteur (disrupt an opponent) and a knight (defend your own tile) is a much richer decision than choosing among today's five kinds, most of which are already narrowly useful (monopoly/plenty are situational, victory-point cards aren't really a "choice").

## Acceptance criteria

- Given a player buys a dev card, when the purchase resolves, then they see exactly 3 candidate cards (or fewer if the deck has fewer than 3 left — handle the edge case explicitly) and must pick one before their turn can continue.
- Given a player picks one of the 3, when the pick resolves, then the chosen card is added to their `devCards` (not ready until next turn, same rule as today), and the other 2 are appended to the bottom of `state.deck` in their original order.
- Given fewer than 3 cards remain in the deck, when a draft is triggered, then the player is shown however many remain (1 or 2) rather than the flow breaking.
- Given a bot buys a dev card, when the draft triggers, then the bot picks a card via a real decision (not the first option by default) and the game continues without a human needing to intervene.
- Given drafting is enabled, when any player views the Hud, then the top-left settings chip reflects that.

## Success metric

No metric yet — qualitative "does drafting feel like a meaningful choice" from playtesting once shipped alongside item 3.

## Open questions (need user decision before feasibility)

- None specific to this item beyond the sequencing dependency on new dev card types (see overview) and the Scout redundancy already flagged there.

## Feasibility (Architect fills this in)
