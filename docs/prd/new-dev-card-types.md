---
feature: new-dev-card-types
status: approved
ux-required: true
date: 2026-08-07
---
# New dev card types + fewer knights

See [settings-overview.md](./settings-overview.md) for shared codebase context, sequencing (this item should land before [dev-card-drafting](./dev-card-drafting.md)), and its cross-cutting HUD-indicator/preset requirement.

**Balance status, confirmed by user (2026-08-07): hold as-is.** The deck-ratio question stays open pending a dedicated design/balance pass — this document scopes the *mechanism* (what new card kinds exist, how they resolve, what engine surfaces they touch) deliberately without locking a strawman ratio. That balance pass needs to happen before this PRD goes to Architect feasibility; feasibility is being asked to evaluate buildability of the mechanism, not to bless a set of numbers that haven't been decided yet.

## Problem

The dev card deck is a closed set — `DevKind = 'knight'|'victory'|'roadBuilding'|'monopoly'|'plenty'`, 25 cards (14/5/2/2/2), all resolved through an explicit `switch` in engine.ts's `playDev`. It's entirely personal-economy focused (nothing lets a player directly interfere with another's board). The specific new cards and their balance need a dedicated brainstorming/playtest pass before numbers are locked — this PRD scopes the mechanism, not the final numbers.

## Users & scenario

Players who've exhausted the standard dev-card variety want more texture in the deck — including some direct player-vs-player interaction, which the current five card kinds don't offer at all.

## Scope (what we're building)

**Final card set, triaged by the user (2026-08-07) across two rounds of brainstorming** — Saboteur, Scout, Harbor Master, and Artisan were all considered and cut. Four new `DevKind` values ship:

  - **Merchant** — one-time bank trade at 1:1 rate, capped at 3 resources per use (trade up to 3 of one type for 3 of another, single transaction). Revised from an original 2:1-any-resource strawman per user feedback (too generous at 2:1, and "up to 3 max" caps the swing). No new picking state — inline resolution like the existing trade action, card consumed after use.
  - **Trailblazer** — grants 1 free road (a lighter Road Building, which grants 2). Cheap filler for closing a single gap without committing to two segments. Resolution mirrors the existing `roadBuilding` case in `playDev`, minus the second placement.
  - **Diplomat** — one-time shield: blocks the next robber placement targeted at the holder. Needs new state (e.g. a `shielded: PlayerId[]` or a per-player flag) checked wherever the robber's target is set (the `'tile'` action in engine.ts, and `ai.ts`'s `robberTarget()` must respect it too so bots don't waste a placement on a shielded player).
  - **Merit** — worth +0.5 VP, **and** grants 1 free resource of the player's choice from the bank when played (tweaked by the user from a plain half-VP card). Two Merit cards' VP combines to a full point. This is the one card here with a real engine cost beyond a new switch case: `victoryPoints()` (players.ts) sums integers today, so VP tracking needs to move to a fixed-point representation (e.g. store as half-points internally, `×2`, floor for display/win-check purposes) rather than a naive float. The resource-grant half of the card reuses the same bank-deduction pattern Year of Plenty already has.
- Reduce the knight count in the 25-card deck to make room for these four kinds, exact ratio deliberately not decided here — see the confirmed "hold as-is" note above and the open question below.
- Each new kind needs: an engine resolution path in `playDev`, an AI decision in `ai.ts` (today's bot plays "any ready non-victory card" indiscriminately — Merit in particular needs a resource-choice decision, not a random pick), and a Hud icon/label (`DEV_LABEL`/`DEV_ICON` in players.ts).
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when new dev card types are enabled it shows in the top-left settings chip in `Hud.tsx`, visible to every player.

## Non-goals

- Locking exact deck composition numbers in this document — confirmed on hold pending a dedicated balance/design pass, not something this scoping PRD decides.
- Saboteur, Scout, Harbor Master, Artisan — all considered and cut by the user. Not being built. Listed here only so they aren't re-proposed without a reason to revisit.

## How this changes game dynamics

- **No new adversarial mechanic ships here.** With Saboteur cut, none of these four cards let a player directly damage an opponent's board — the game's only targeted-disruption mechanic stays the robber/knight (and Santa mode, if that ships instead, removes even that). Diplomat is defensive, not offensive — it blunts disruption rather than adding any.
- **Merchant** is low-risk and low-drama — a capped, one-time personal trade boost, mostly helps players stuck on a bad resource mix or away from good harbours, without being a repeatable port.
- **Trailblazer** softens the "Road Building is all-or-nothing" problem — today a player either draws the 2-road card or doesn't; a 1-road option gives a cheaper, more targeted way to close a single gap (reach a coveted intersection, extend toward a port) without needing two segments' worth of a route.
- **Diplomat** introduces the game's first defensive dev card — it changes robber-play calculus for whoever holds one, since a would-be attacker who doesn't know the holder has it (or does know, and avoids wasting a turn) has to factor in the possibility of a wasted robber placement. Adds a small bluffing/information layer to robber targeting.
- **Merit** is a slow-burn VP card, similar in spirit to today's plain victory-point cards but with an immediate resource payoff attached, making it feel less "dead" in hand while waiting to combine two of them into a real point.
- **Fewer knights** means largest army (needs 3+ knights, `largestArmyHolder` in players.ts) becomes harder to claim, and the robber gets played less often overall — which also means the AI's existing robber-avoidance heuristics (`robberTarget` in ai.ts) matter less, and games lean more economic/less disruptive by default. With Saboteur cut, there's no card picking up the "disruption" slack this time — the game leans more purely economic than the original strawman set would have.

## Acceptance criteria

- Given the new deck composition (once numbers are set), when a player buys a dev card, then it can be any of the enabled kinds, in the configured ratio.
- Given Merchant is played, when the player selects give/get resources up to 3 units, then the trade executes at 1:1 exactly once, and the card is consumed.
- Given Trailblazer is played, when the player selects a valid road edge, then one road is added to their network (not two), and the card is consumed.
- Given Diplomat is held, when any player (bot or human) attempts to target its holder with the robber, then that placement is rejected/redirected and the Diplomat shield is consumed.
- Given Merit is played, when it resolves, then the holder's fixed-point VP total increases by 0.5 and they receive 1 resource of their choice from the bank (or 0 if the bank is dry on every type), and the win-check correctly reads two held/played Merits as a full VP.
- Given a bot holds any of these cards, when it's the bot's turn to act, then it makes a real decision for cards that need one (Merchant's resource choice, Merit's resource choice), not a random or no-op play.
- Given new dev card types are enabled, when any player views the Hud, then the top-left settings chip reflects that (see settings-overview.md's cross-cutting requirement).

## Success metric

No metric yet — this is a design/balance item that needs a playtest pass before any success criterion is meaningful.

## Open questions (need user decision before feasibility)

1. ~~Does the user want to lock a strawman deck ratio now... or hold this whole PRD until a dedicated brainstorming pass on card balance happens first?~~ **Resolved 2026-08-07: hold.** No strawman ratio is being locked in this document; a dedicated design/balance pass happens before this item goes to Architect feasibility. This question stays listed only as a pointer to that pending pass, not as an open decision this document is asking the user to make right now.
2. ~~Should Saboteur have any restriction to manage kingmaker risk?~~ — **moot, resolved 2026-08-07: Saboteur cut entirely.** No targeting-restriction design needed.
3. Merit's fixed-point VP representation: does the Hud display half-points anywhere (e.g. "7.5 / 10"), or only round numbers with the 0.5 invisible until it combines into a full point? Not addressed by the card's approval — a UI/UX-mock-time question, not a blocker for feasibility.

## Feasibility (Architect fills this in)
