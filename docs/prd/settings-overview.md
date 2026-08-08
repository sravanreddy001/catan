# Settings expansion — overview & sequencing

Not a signable PRD itself — this is the shared context doc for the 9 settings PRDs below. Read this first; each individual PRD links back here instead of repeating the cross-cutting notes.

Individual PRDs (committed this round):
1. [Scarce bank mode](./scarce-bank-mode.md)
2. [New dev card types + fewer knights](./new-dev-card-types.md)
3. [Dev card drafting](./dev-card-drafting.md)
4. [Configurable VP target](./configurable-vp-target.md)
5. [Public hand mode](./public-hand-mode.md)
6. [Speed mode](./speed-mode.md)
7. [AI personality presets](./ai-personality-presets.md)
8. [Santa mode](./santa-mode.md)

Dropped: [Variable board size](./variable-board-size.md) — standard board stays fixed at 19 hexes; the "start small" idea folds into fog-of-war (parked, tweak item) instead. Kept as reference only, see its status note.

## Cross-cutting requirement: combinable settings + presets + in-game HUD indicator (applies to every item above)

User decision (2026-08-07), resolving the "combinable vs. curated" open question below: **both**, not either/or.

- **Every setting stays independently host-tweakable in the lobby.** Nothing in this list becomes preset-only.
- **Quick-select presets additionally exist**, each setting a bundle of these fields at once (e.g. a "Speed Game" button), which the host can then still fine-tune afterward field-by-field. A preset is a convenience default, not an exclusive mode.
- **NEW requirement, not in the original scoping pass**: whatever settings are active must be visible *in-game*, not just at lobby setup. A settings-summary chip/indicator renders in the **top-left corner of the HUD** (`src/components/Hud.tsx`), visible to **every player, not just the host** — a guest in an online game needs to see the same chip a host does. This touches every one of the 9 items' scope and acceptance criteria below, not just speed mode (it was flagged as speed-mode-only in the original pass; that was too narrow).

### What this actually requires in the codebase

- **Settings don't exist as a concept in `GameState` today.** Each individual PRD above currently proposes its own ad-hoc field (`vpTarget`, a bank-size config, board size, a Santa-mode flag, etc.) added independently. This cross-cutting requirement means those fields belong under one shared `settings`-shaped object on `GameState`, decided once as part of this expansion's engine work, not as 9 separate uncoordinated additions — otherwise the HUD chip has no single place to read "what's currently on" from, and every PRD's engine work quietly duplicates the same plumbing decision.
- Online play already broadcasts the full `GameState` to every client (see codebase fact above) — so a `settings` object on `GameState` reaches guests for free, same reasoning that already makes public-hand-mode and drafting UI-only. **The HUD chip itself needs no new network message.**
- Offline, `App.tsx` already holds scattered local config state (board size, bot seats, etc.) that would need to flow into this same `settings` object at game-start time instead of staying component-local, or the chip can't see it either.
- This shared-`settings`-object requirement is itself a small piece of shared engine design, worth Architect's eyes once at feasibility time rather than being independently re-litigated in each of the 9 individual feasibility passes.

### Documented default — HUD chip content and interaction (flagged, not locked)

No pixel-level answer was requested from the user, and none is needed to unblock scoping — this is exactly what the `ux-required: true` mock gate on every item already exists to nail down. Default proposed so none of the 9 PRDs are blocked in the meantime:
- One compact chip/pill, top-left of the HUD, showing an icon-only badge per **non-default** active setting only (a fully-default game shows an empty/collapsed chip, not 9 icons all reading "standard").
- Tap/hover expands a small popover listing full setting names + values — mirrors the existing `BuildGuide` modal pattern already in `Hud.tsx`, so it's a proven pattern, not a new UI idiom.
- Confirm or override this default at UX-mock time.

### Documented default — preset bundle contents (flagged, not locked)

Exact bundle contents are a game-design call, not an engineering one, and don't block feasibility — the *mechanism* (apply N field values from one lobby button, then let the host still adjust any of them individually) is identical regardless of which fields a given preset sets. Starting proposal, to confirm/override before or during UX mock:
- **Speed Game** — speed mode on, VP target 8, everything else standard.
- **Chaos Game** — Santa mode on, scarce (very scarce) bank, new dev card types + drafting on.
- **Teaching Game** — public hand mode on, VP target 8, everything else standard.
- Presets never lock out manual tweaking afterward, per the "combinable" decision above — picking "Speed Game" then flipping VP target back to 10 is expected to work.

## Codebase facts that shape every item below

Grounded in `src/game/board.ts`, `src/game/engine.ts`, `src/game/players.ts`, `src/game/ai.ts`, `src/net/session.ts`, `src/components/Lobby.tsx`, `src/components/Hud.tsx`, `src/App.tsx`.

- **The board is hand-authored, not generated.** `board.ts`'s `TILE_COORDS` is a literal list of 19 axial coordinates (rows of 3-4-5-4-3), `TILE_TYPES` and `NUMBER_TOKENS` are fixed-length arrays sized to match. There is no "generate N tiles in a ring" function today. `buildPorts()` *is* already generic over coastline length, so ports scale for free once the tile layout does.
- **Player count is hardcoded to 4, in multiple independent places**, not one config value: `PlayerId = 0 | 1 | 2 | 3` (players.ts), `PALETTE` has exactly 4 swatches (players.ts), and `HostSession` in `net/session.ts` caps seats at 4 twice (`this.names.length >= 4` and a `for (let i = 0; i < 4; i++)` color-resolution loop). Any feature that implies more than 4 players is a structural change across the type system, the color system, and the P2P session layer — not a config tweak.
- **The bank, VP target, and win check are single hardcoded constants**, not config: `BANK_PER_RESOURCE = 19` and `>= 10` inside `reduce()` in engine.ts. Both are trivial to parameterize — one field on `GameState`, threaded through the two or three call sites that read the constant today.
- **Bank supply is invisible in the UI.** Nothing in Hud.tsx renders `state.bank`. The "if demand exceeds supply, nobody gets the resource" rule (engine.ts `produce()`) already exists and already fires today, silently, whenever the bank runs dry on a resource. Any mode that makes the bank run dry more often (scarce bank) will make that silent rule visible and confusing unless the UI is told about it.
- **Online play broadcasts the full `GameState` to every client, always.** `HostSession.broadcastState()` sends the entire state object — every hand, the entire dev deck order, everything — to every connected guest. `Hud.tsx` chooses to render only the local player's own hand (`HandBar` takes a single `player` prop, `PlayerStrip` shows names/badges only, no hand contents). **This means "public hand mode" and "seeing the dev deck" are not security or protocol problems — the data already exists on every client.** They are UI-only changes: render what's already there instead of hiding it. This same fact means dev-card drafting (item 4) needs no new network design either.
- **Bots are not part of the engine.** `botSeats: number[]` lives in `App.tsx` local state, not in `GameState`. `ai.ts`'s `chooseAction`/`chooseDiscard`/`respondToOffer` take no per-seat config today. This means AI personality presets (item 8) is containable to `ai.ts` + `App.tsx` + `Lobby.tsx` — it does not touch the engine or the network layer, and only matters offline (bots don't exist in online play).
- **Dev cards are a closed union with an explicit switch.** `DevKind` in players.ts, handled in engine.ts's `playDev` switch. Adding a card kind means a new state field for its resolution flow (mirroring how `monopoly`/`plenty` get a `picking` state) and a new AI decision in `ai.ts`. Not a data change, a control-flow change.

## Sequencing / dependencies across items

(Numbering below refers to the committed list above: 1 scarce bank, 2 new dev cards, 3 drafting, 4 VP target, 5 public hand, 6 speed mode, 7 AI personalities, 8 Santa mode.)

- **Item 2 (new dev cards) should land before item 3 (drafting)**, not after. Drafting standalone (drawing from today's 5-kind deck) still removes blind-draw variance, but it's a thin change. It gets materially more interesting once there's a real choice between card kinds. Recommend 2 → 3.
- **Scout (one of the proposed item-2 cards, "peek top 3 dev cards") is redundant with item 3.** If drafting ships, every purchase already reveals the top 3 — Scout would let you pay a card to do what drafting gives everyone for free. Decide up front whether Scout only exists in a non-drafting deck, or gets cut. Don't build both blind.
- **Item 4 (VP target) should keep the win check as a single computed function**, not inline the `>= 10` comparison at more call sites than the one that exists today. Alt win paths (Trade Empire / Builder — parked, not in scope) would plug into that same function later. This is already almost true (`reduce()` computes `champion` in one place) — just don't regress it while making the target configurable.
- **Handicap system was parked because there's no stats system to make it trustworthy.** None of these 8 items require player history/stats — noting only so nothing here quietly grows a dependency on it.
- **Item 8 (Santa mode) removes the robber mechanic entirely and interacts with item 2's knight card.** Resolved 2026-08-07: playing a Knight in Santa mode grants the same free-resource-of-choice bonus as rolling a 7 (see santa-mode.md). If item 2's new cards ship alongside Santa mode, Saboteur is unaffected (it targets roads, not the robber) but worth a joint balance look since both modes touch "how disruptive is a turn" from different angles.
- **Variable board size is dropped** (see its file) — the ring-generator work it would have needed is deferred along with it, and now belongs to fog-of-war (parked) whenever that gets picked up instead.

## Status of prior open questions

The 4 open questions from the original scoping pass have been answered by the user (2026-08-07) and folded into the relevant PRDs directly rather than repeated here:

1. **Combinable vs. curated settings** → both; see the cross-cutting requirement above.
2. **Variable board size Phase A/B** → Phase A only (mini/standard board, 3-4 players) is this round's committed scope; Phase B (5-8 players) is explicitly deferred to a separate future PRD. See variable-board-size.md.
3. **Dev card balance** → **superseded 2026-08-07 (later pass): resolved, no longer held.** new-dev-card-types.md now locks a 25-card composition of 9 knight / 4 victory / 2 roadBuilding / 2 monopoly / 2 plenty / 2 merchant / 2 trailblazer / 1 diplomat / 1 merit, applied only when that setting is enabled. Merit's half-point display question is resolved too: the Hud shows true fractional totals ("7.5 / 10"); the win check still requires the full target.
4. **Speed mode double-roll** → full discard-over-7 + robber rule applies on both rolls each turn, no dampening; the added chaos is accepted as intentional. See speed-mode.md.

Two new, non-blocking documented defaults were added in that pass (HUD chip content, preset bundle contents — both above); both should be nailed down by or during each item's UX mock, neither blocks Architect feasibility.

A second round of decisions (2026-08-07):

5. **Santa mode's knight-card question** → resolved: playing a Knight grants the same free-resource-of-choice bonus as rolling a 7. See santa-mode.md.
6. **Variable board size's mini-tile-count question** → moot: the item is dropped. Standard board stays fixed at 19 hexes; "start small" belongs to fog-of-war (parked) instead. See variable-board-size.md's status note.

No open questions remain blocking Architect feasibility across the 8 committed items, aside from each item's own individually-flagged non-blocking defaults (UX-mock-time decisions) and item 2's held balance pass.
