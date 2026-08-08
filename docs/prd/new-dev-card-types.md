---
feature: new-dev-card-types
status: shipped
ux-required: true
date: 2026-08-07
---
# New dev card types + fewer knights

See [settings-overview.md](./settings-overview.md) for shared codebase context, sequencing (this item should land before [dev-card-drafting](./dev-card-drafting.md)), and its cross-cutting HUD-indicator/preset requirement.

**Balance status — RESOLVED by the user (2026-08-07), superseding the earlier "hold as-is" note.** The deck ratio is now locked (below), so this PRD is unblocked for Architect feasibility.

**Locked deck composition (25 cards, unchanged total). Revised by the user on 2026-08-08: +3 merit, −1 victory, −2 knight.**

| Kind | Count |
|---|---|
| knight | 7 |
| victory | 3 |
| roadBuilding | 2 |
| monopoly | 2 |
| plenty | 2 |
| merchant | 2 |
| trailblazer | 2 |
| diplomat | 1 |
| merit | 4 |

Rationale: knights drop 14 → 7, so largest army (3+ knights) stays reachable but becomes a real race; new kinds are 36% of the deck (9/25). Merit was originally a single card, which meant most games never drew it — at 4 the half-point VP totals it produces are a normal part of scoring rather than a curiosity nobody sees.

This composition applies **only when the new-dev-card-types setting is enabled**; with the setting off, the deck stays at today's 14/5/2/2/2. **With Santa mode also on**, Diplomat is dropped (it blocks a robber that Santa mode removes) and its slot becomes an 8th knight: 8/3/2/2/2/2/2/0/4.

## Problem

The dev card deck is a closed set — `DevKind = 'knight'|'victory'|'roadBuilding'|'monopoly'|'plenty'`, 25 cards (14/5/2/2/2), all resolved through an explicit `switch` in engine.ts's `playDev`. It's entirely personal-economy focused (nothing lets a player directly interfere with another's board). The specific new cards and their balance need a dedicated brainstorming/playtest pass before numbers are locked — this PRD scopes the mechanism, not the final numbers.

## Users & scenario

Players who've exhausted the standard dev-card variety want more texture in the deck — including some direct player-vs-player interaction, which the current five card kinds don't offer at all.

## Scope (what we're building)

**Final card set, triaged by the user (2026-08-07) across two rounds of brainstorming** — Saboteur, Scout, Harbor Master, and Artisan were all considered and cut. Four new `DevKind` values ship:

  - **Merchant** — one-time bank trade at 1:1 rate, capped at 3 resources per use. **Clarified by the user 2026-08-07: this is a mixed basket, not one type for another.** The player hands back any 3 cards they choose (which may be 3 different resources) and takes any 3 cards they choose — effectively three independent 1:1 swaps resolved as a single transaction. Revised from an original 2:1-any-resource strawman per earlier user feedback (too generous at 2:1, and the 3-card cap limits the swing). No new picking state — inline resolution like the existing trade action, card consumed after use.
  - **Trailblazer** — grants 1 free road (a lighter Road Building, which grants 2). Cheap filler for closing a single gap without committing to two segments. Resolution mirrors the existing `roadBuilding` case in `playDev`, minus the second placement.
  - **Diplomat** — one-time shield: blocks the next robber placement targeted at the holder. Needs new state (e.g. a `shielded: PlayerId[]` or a per-player flag) checked wherever the robber's target is set (the `'tile'` action in engine.ts, and `ai.ts`'s `robberTarget()` must respect it too so bots don't waste a placement on a shielded player).
  - **Merit** — worth +0.5 VP, **and** grants 1 free resource of the player's choice from the bank when played (tweaked by the user from a plain half-VP card). Two Merit cards' VP combines to a full point. This is the one card here with a real engine cost beyond a new switch case: `victoryPoints()` (players.ts) sums integers today, so VP tracking needs to move to a fixed-point representation (e.g. store as half-points internally, `×2`, floor for display/win-check purposes) rather than a naive float. The resource-grant half of the card reuses the same bank-deduction pattern Year of Plenty already has.
- Reduce the knight count in the 25-card deck to make room for these four kinds, exact ratio deliberately not decided here — see the confirmed "hold as-is" note above and the open question below.
- **Every dev card explains itself in-app (added by the user 2026-08-07, applies to the original five kinds too).** Today `DEV_LABEL` gives a bare name and playing is a single tap — nothing states what a card does. Two additions: a one-line rule string per kind (a `DEV_RULE` record beside `DEV_LABEL`/`DEV_ICON` in players.ts), shown in a confirm step when a card is tapped; and a dev-card guide listing every kind in the deck with icon, name, rule and remaining count — mirroring the existing `BuildGuide` modal pattern in `Hud.tsx`. This makes the deck explainable to a new player without a rulebook, which matters far more once nine kinds exist instead of five.
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
- Given Merchant is played, when the player fills a give basket and a get basket of up to 3 cards each — freely mixed across resource types — then the trade executes once at 1:1 with both baskets holding the same total, and the card is consumed. Confirm is blocked while the totals differ, while either basket is empty, or while the bank cannot cover the get basket.
- Given any dev card is in hand, when the player taps it, then a confirm step names the card and states in one plain sentence what it does before it is played — no card resolves on a single tap.
- Given a player opens the dev-card guide, when it renders, then every kind currently in the deck is listed with its icon, name, one-line rule and remaining count, so the deck can be explained without outside reference.
- Given Trailblazer is played, when the player selects a valid road edge, then one road is added to their network (not two), and the card is consumed.
- Given Diplomat is held (resolved 2026-08-07, replaces the earlier "placement is rejected/redirected" wording), when the robber is placed on a tile touching its holder and the holder would be stolen from, then the steal is cancelled and the Diplomat shield is consumed. The placement itself is always legal — the rule fires at resolution, so no bot behaviour reveals who holds a shield.
- Given Santa mode is on (which removes the robber entirely), when the deck is built, then Diplomat is excluded and its slot becomes a 10th knight — no dead cards.
- Given Merit is played, when it resolves, then the holder's fixed-point VP total increases by 0.5 and they receive 1 resource of their choice from the bank (or 0 if the bank is dry on every type), and the win-check correctly reads two held/played Merits as a full VP.
- Given a bot holds any of these cards, when it's the bot's turn to act, then it makes a real decision for cards that need one (Merchant's resource choice, Merit's resource choice), not a random or no-op play.
- Given new dev card types are enabled, when any player views the Hud, then the top-left settings chip reflects that (see settings-overview.md's cross-cutting requirement).

## Success metric

No metric yet — this is a design/balance item that needs a playtest pass before any success criterion is meaningful.

## Open questions (need user decision before feasibility)

1. ~~Does the user want to lock a strawman deck ratio now, or hold until a dedicated balance pass?~~ **Resolved 2026-08-07 (second pass): ratio locked** at 9/4/2/2/2/2/2/1/1 — see the locked composition table at the top of this document. The earlier "hold" answer is superseded; nothing here blocks feasibility any more.
2. ~~Should Saboteur have any restriction to manage kingmaker risk?~~ — **moot, resolved 2026-08-07: Saboteur cut entirely.** No targeting-restriction design needed.
3. ~~Merit's fixed-point VP representation: does the Hud display half-points?~~ **Resolved 2026-08-07: show halves.** The Hud renders the true fractional total (e.g. "7.5 / 10") rather than hiding the 0.5 until it pairs into a full point — a played Merit must not look like a no-op. Win check still requires reaching the full target (a 9.5 does not win at a target of 10).

## Feasibility (Architect fills this in)

verdict: feasible-with-changes

latency: No user-facing latency risk. This is a local, in-browser reducer app — the relevant metric is per-action reducer time, currently sub-millisecond. The additions are O(players) or O(hand) at worst (`victoryPoints` already runs per player on every action via `reduce()`'s champion check; adding half-point arithmetic changes no complexity class). Online play sends no new messages: `HostSession.broadcastState()` already ships the whole `GameState`, so `settings.newDevCards`, the Diplomat shield field, and the Merchant credit reach guests for free. State payload grows by a few bytes per broadcast.

schema: No database exists in this project — "schema" here means the `GameState`/`Player` shape, and it does change:
- `DevKind` union gains `'merchant' | 'trailblazer' | 'diplomat' | 'merit'`, plus matching `DEV_LABEL`/`DEV_ICON` entries (players.ts).
- `GameSettings` gains `newDevCards: boolean` (default false); `createDevDeck()` takes that flag and returns 14/5/2/2/2 when off, the locked 9/4/2/2/2/2/2/1/1 when on.
- `Player` gains a Diplomat shield flag (`shielded: boolean`), consumed on the first robber placement targeting that player.
- `GameState.picking` union gains `'meritBonus'` (Merit's free resource — mirrors the existing `'santaBonus'` flow exactly).
- `GameState` gains a Merchant credit, e.g. `merchant: { give: Resource | null; left: number } | null`, so the existing `bankTrade` action can resolve at rate 1 for up to 3 units of one chosen resource in a single transaction (`ratesFor()` override) instead of needing a whole new action + UI.
- **VP moves to half-point units.** `victoryPoints()` and `scoreBreakdown()` should return half-points internally (integers, `×2`) and the win check compares against `vpTarget * 2`; display divides by 2. Keeping the champion check inside `reduce()`'s single computed site is a hard requirement (settings-overview sequencing note) — don't fan the comparison out.

risks:
1. **VP representation is the one genuinely invasive change.** Every reader of `victoryPoints()`/`scoreBreakdown()` — Hud, the end-game score breakdown, AI evaluation in `ai.ts`, the win check — must be updated together, or scores silently double. Mitigation: keep the internal unit change behind named helpers (`victoryPointsHalves()` + a `formatVP()` for display) rather than letting raw halves leak into components; add a unit test pinning a Merit-holding player's total and the win threshold.
2. **Diplomat's shield is hidden information that the AI can see.** `ai.ts`'s `robberTarget()` runs on the full state, so a bot could "know" about a shield a human player couldn't. Decide explicitly: either bots respect the shield (skip the target — the PRD's acceptance criterion, but that leaks the shield's existence through bot behavior) or bots ignore it and waste the placement (preserves the bluffing layer the PRD says it wants). Recommend bots ignore it, and note the acceptance criterion needs rewording — this is the required scope change.
3. **Santa mode interaction.** With `santaMode` on there is no robber placement at all, so Diplomat is a dead card. **Resolved 2026-08-07: exclude Diplomat when Santa mode is on**, its slot becoming a 10th knight.

Both of the above are now decided (see the acceptance criteria) — the verdict stays `feasible-with-changes` only because those changes are baked into the criteria rather than the original text.

notes (required scope changes):
- Acceptance criterion 4 currently says bots must respect the shield. Per risk 2, that conflicts with the "bluffing/information layer" the dynamics section wants. Pick one; recommended wording: "when the robber is placed on a shielded player, the steal is cancelled and the shield is consumed" — applies uniformly to humans and bots, no hidden-info leak, no AI change needed at all.
- Merit's half-point VP display is settled (show "7.5 / 10"); confirm at UX-mock time that opponents' half-points are also visible in `PlayerStrip`, since a hidden Merit is hidden information but a *played* Merit is public.
- Deck composition applies only when `settings.newDevCards` is true — with it off, nothing about today's deck, VP math display, or robber flow changes.

date: 2026-08-07
