# UX Audit — Screen Use, Element Clarity, Component Placement

date: 2026-08-07
method: played a full offline 4-player setup + first turn in the live dev build, measured every element with `getBoundingClientRect` / SVG `getBBox` at four viewports
viewports tested: 1366×768 (laptop), 880×700 (half-screen window), 390×844 (phone portrait), 844×390 (phone landscape)
scope: layout, screen utilisation, legibility, touch targets, placement. Not game rules, not art direction.

---

## 0. Headline

The board — the only thing a player actually looks at — never gets more than a third of the screen, and on a laptop it gets **13%**. Everything else is chrome that is reserved whether or not it has content to show.

| Viewport | Board painted size | % of viewport | Number pip diameter |
|---|---|---|---|
| 1366×768 laptop | 376 × 364 px | **13.0%** | **3.31 px** |
| 880×700 window | 314 × 304 px | **15.5%** | 2.85 px |
| 390×844 phone | 323 × 313 px | **30.7%** | **2.85 px** |
| 844×390 phone landscape | **29 × 28 px** | **0.2%** | **0.25 px** |

The pips are not "a bit small". They are 2.85 px across on a phone. That is roughly 0.4 mm of physical ink. There is no way to read them, and there is no way to zoom.

---

## 1. Cross-platform root causes

These three lines of code produce most of the findings in both platform sections.

### 1.1 The dock reserves 250 px it does not use — `styles.css:213`

```css
.dock { min-height: 250px; }
```

Measured on the laptop mid-turn, with the fullest dock state the game has (hand + bank + dev bar + all five action buttons):

- dock height: **250 px**
- tallest child: **81 px**
- **169 px (68%) of the dock is permanently empty**

The comment explains the intent — stop the board resizing when rows come and go. That is the right goal, but the mechanism pays for it with a third of the screen at all times. The board should be the stable element and the dock should size to content; a `grid-template-rows` with a fixed board area, or reserving the rows themselves rather than a blanket minimum, gets the same stability for free.

### 1.2 Pinch-zoom is disabled twice — `index.html:7` and `styles.css:122`

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```
```css
.board { touch-action: manipulation; }
```

The meta tag blocks browser zoom; `touch-action: manipulation` independently blocks pinch gestures reaching the board. So a player who cannot read a number token has no recourse at all — not OS zoom, not app zoom, not pan. There is no zoom control anywhere in the UI.

This is also a WCAG 2.1 **1.4.4 Resize Text** failure. `user-scalable=no` is the single highest-impact line to delete in the codebase.

### 1.3 Board typography is specified in SVG user units, so it shrinks with the board

`Board.tsx` sets sizes in viewBox units. The board's viewBox is 630.6 × 593.6, so the effective on-screen size is `unit × scale`, and scale is 0.69 on a laptop, 0.59 on a phone.

| Element | Authored | Laptop (×0.69) | Phone (×0.59) | Comfortable minimum |
|---|---|---|---|---|
| Probability pip | r 2.4 | **3.3 px ⌀** | **2.9 px ⌀** | 6 px ⌀ |
| Number glyph | 20 px | 13.8 px | **11.9 px** | 16 px |
| Number token | r 17 | 23.5 px ⌀ | 20.2 px ⌀ | 32 px ⌀ |
| Port ratio text ("2:1") | 14 px | 9.7 px | **8.3 px** | 12 px |
| Port icon | 17 px | 11.7 px | **10.1 px** | 14 px |
| Terrain icon | 30 px | 20.7 px | 17.8 px | 20 px |
| Vertex tap circle (visual) | r 11 | 15.2 px ⌀ | **13.0 px ⌀** | 20 px ⌀ |
| Vertex hit area (invisible) | r 24 | 33.1 px ⌀ | **28.5 px ⌀** | 44 px ⌀ |

Two consequences:

- **The 6/8 distinction rests entirely on colour.** Red vs black text plus five 3 px dots. Colour-blind players (8% of men — a board-game demographic) have nothing else to go on. The pips are the redundant channel and they are illegible.
- **The tap target is 2.5× the size of the thing you can see.** A 13 px visible circle over a 28.5 px hit area means players aim at a dot and hit a neighbour, or don't realise a spot is tappable at all.

### 1.4 The board is a single opaque image to assistive tech — `Board.tsx:77`

```jsx
role="img" aria-label="Catan board"
```

`role="img"` tells screen readers to ignore every child. Nineteen tiles, 54 vertices, every road, the robber, every port — all collapse to the string "Catan board". The whole game is unplayable without sight, and it would not take much to fix: drop `role="img"`, give the interactive `<circle>`s real `<title>`s.

Related: only **one** `aria-label` exists in the entire app (the trade-dismiss ×). The three primary build buttons carry no accessible name at all — they are bare SVG with a `title` attribute:

```
Road:       innerHTML "<svg …>",  aria-label null,  title "Road: 🧱🌲"
Settlement: innerHTML "<svg …>",  aria-label null,  title "Settlement: 🧱🌲🐑🌾"
City:       innerHTML "<svg …>",  aria-label null,  title "City: 🌾🌾⛰️⛰️⛰️"
```

`title` never appears on touch. On a phone, the three most important buttons in the game are unlabelled shapes with no way to discover what they do or what they cost.

### 1.5 No modal is a dialog

No `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler on any of: lobby, trade, discard, dev-card sheet, dev-card guide, cost guide. Tab escapes behind the overlay.

---

## 2. Laptop / desktop (1366×768 and 880×700)

The desktop layout is the phone layout stretched. Every problem here is the same problem: the app grows horizontally into empty water while the board stays height-constrained.

### 2.1 The vertical budget is 45% chrome — critical

Measured at 1366×768:

```
topbar    53 px
stage    426 px   ← the board lives here
turnbar   40 px
dock     250 px
```

343 px of 768 (45%) is fixed chrome. The stage gets 426, and inside that the SVG letterboxes to 364 px of painted board.

### 2.2 The board element is 900 px wide and paints 376 px of it — critical

```css
.board-frame { max-width: min(100%, 900px); }
```

Because the board is height-constrained, `preserveAspectRatio` centres the hexes and letterboxes the rest. The `<svg>` measures 900 × 410; the hexes inside measure **376 × 364**. **524 px of the board element is transparent padding**, and either side of it sits another 466 px of empty gradient. Roughly **990 horizontal pixels of a 1366 px screen show nothing but sea.**

The width cap is not the problem — the height starvation is. Reclaim the dock's 169 px of dead space and the board grows to ~530 px tall, a 45% linear increase, with no other change.

**Recommendation.** On `min-width: 1000px`, go two-column: board fills the full column height on the left, and the hand / bank / build / dev / trade stack into a right rail ~320–380 px wide. That converts the wasted horizontal space into the vertical space the board needs. Expected board size: ~700 × 680 px, or **~2× linear scale** — which on its own fixes the pip, port and vertex legibility findings for desktop without touching a single font size.

### 2.3 Every control is on one 51 px line, 1150 px apart — high

The mid-turn dock, left to right: hand (x 24) → bank supply → Buy dev (x 697) → ? → build road / settlement / city (x 922–1171) → Trade (x 1179) → End turn (x 1264).

- No grouping. "End turn" — the one irreversible action in the dock — sits flush against "City", which is 78 px wide and unlabelled.
- Pre-roll, the single "Roll dice" button sits at the far right of a 1366 px screen while the player's attention is on the board centre. That is ~600 px of mouse travel for the most frequent action in the game.
- The three build buttons are 78 px wide with a 26 px glyph and no visible text label or cost. The `.btn__cost` line never renders in this layout.

**Recommendation.** In the right rail, stack the buttons with icon + name + cost on one row each. The horizontal space exists; use it for labels instead of gaps.

### 2.4 The dice are orphaned in open water — medium

```css
.dice { position: absolute; right: 12px; bottom: 12px; }
```

Anchored to `.board-frame`, which is 900 px wide while the hexes are 376. Measured position: dice at x 1047, painted board right edge at x ~871. The dice float **176 px away from the board**, over empty gradient, 34 px tall, ~700 px from the Roll button that produced them. Cause and effect are visually unlinked.

**Recommendation.** Anchor the dice to the painted board bounds (or to the rail, next to the Roll button), and scale them up on desktop.

### 2.5 Lobby wastes 93% of the screen — medium

Every lobby step is a 360 px panel centred in 1366 × 768. The settings step already needs a scroll-ish column of eleven controls squeezed into that width while 1000 px sit empty either side.

Also in the lobby:

- **Contrast bug.** `.lobby__count:hover` sets the background to `#f3c969`, but the `small` subtitle inside keeps `var(--muted)` `#9db4c7` (`styles.css:721`). Contrast on hover ≈ **1.4:1** — the subtitle disappears. Visible in the very first screenshot of the audit.
- **Unstyled native controls.** Checkboxes are 13 px OS defaults and the `<select>`s render in OS grey against the navy panel — clearly foreign to a UI that styles everything else. Checkbox rows are also left-aligned inside a `text-align: center` panel, so nothing lines up.
- **Redundant text.** The AI-personality step prints the selected option verbatim underneath each select ("Default (today's usual bot)" twice).

### 2.6 The 900 px breakpoint leaves a bad middle — medium

At 880 × 700 (a normal half-screen window) the dock has already flipped to `flex-direction: column` but still holds its 250 px floor, so the board drops to **314 × 304 px — 15.5% of the window** with 566 px of empty water beside it. The `min-width: 900px` rule and the `min-height: 250px` floor need to move together.

---

## 3. Mobile (390 × 844 portrait, 844 × 390 landscape)

Portrait is the best-proportioned layout in the app — the responsive rules at `max-width: 560px` are doing real work. The problems are legibility, the hidden player list, and landscape.

### 3.1 Landscape is unplayable — critical

At 844 × 390:

```
topbar 53 + turnbar 40 + dock 250 = 343 of 390 px
stage: 48 px tall
board painted: 29 × 28 px   (0.2% of the screen)
pip diameter: 0.25 px
```

The board is a speck the size of a favicon. The page does not scroll (`scrollHeight` 390), so there is no way to reach it. There is no rotate prompt and no landscape-specific layout. Anyone who turns their phone sideways — which people do with board games — sees a broken app with no explanation.

**Recommendation.** Below ~500 px of height, switch to a side-by-side layout (board left, controls in a scrollable right column) and drop the dock floor entirely. Failing that, ship a "rotate to portrait" interstitial, which is a one-hour fix and infinitely better than a 29 px board.

### 3.2 Half the player list is invisible — critical

```css
.strip { overflow-x: auto; scrollbar-width: none; }
.strip::-webkit-scrollbar { display: none; }
```

Measured at 390 px wide: `scrollWidth 406` vs `clientWidth 218`. **46% of the player strip is off-screen**, and the scrollbar is explicitly hidden with no fade edge, no arrow, and no other affordance. In a 4-player game you can see yourself and one bot. Bots 2 and 3 — their colour, their score — simply do not exist on screen.

Compounding it, `max-width: 560px` hides `.chip__name` for everyone except the active player, so the two chips you *can* see are an anonymous coloured dot and "2 / 10".

Opponent victory points are the primary strategic signal in Catan. Right now, on the platform the game was designed for, you cannot see them.

**Recommendation.** Give the strip its own row below the topbar and let it wrap to a 2 × 2 grid; there is room. Move "?" and "New game" behind a single overflow button to buy back the 190 px they occupy.

### 3.3 Board legibility — critical

The numbers from §1.3 at phone scale: pips **2.85 px**, number glyph **11.9 px**, port ratio **8.3 px**, port icon **10.1 px**. These are the smallest text in the app and they carry the most decision weight.

Note that the board is **width**-bound on the phone, not height-bound: the `<svg>` is 374 × 352 inside a 451 px stage, so **99 px of the stage is empty letterbox** above and below the hexes. Widening the board is not possible; the answer is to scale the tokens rather than the board.

**Recommendation, in priority order:**
1. Delete `user-scalable=no` and let people pinch (§1.2). Cheapest fix in the report.
2. Decouple token size from board scale — draw the number token with a size floor (e.g. `r = max(17, 24 / scale)` in user units) so tokens stay ≥ 32 px on screen regardless of board size.
3. Replace the pip dots with a small filled probability bar, or thicken the pips to r 4 and space them 8 units apart, so the 6/8 signal survives without colour.
4. Add a second non-colour cue for 6 and 8 — a ring on the token, or a bold weight — so the red/black distinction is redundant rather than load-bearing.

### 3.4 Touch targets are below the platform minimum — high

| Target | Measured | iOS HIG | WCAG 2.2 AA |
|---|---|---|---|
| Board vertex (hit) | 28.5 px | 44 px ✗ | 24 px ✓ |
| Board vertex (visible) | 13.0 px | ✗ | ✗ |
| Resource mini-card | 36 × 36 px | ✗ | ✓ |
| Build buttons | 67 × 51 px | ✗ (width ok, height short) | ✓ |
| Player chip | 89 × 36 px | ✗ | ✓ |

Everything clears the WCAG floor and nothing clears Apple's. The vertex is the worst case because the visible dot is less than half the tappable area, so misses feel like the game ignored you rather than like you missed.

### 3.5 The dock outweighs the board — high

Dock 301 px vs board 313 px on an 844 px screen. The panel that shows five mostly-empty card slots and a supply readout gets as much screen as the game. "Your hand" showed **one** card in a 5-slot row of 36 px cards with a "4:1" caption under every empty one — four of the five slots are pure noise, each carrying a trade rate for a resource the player does not have.

**Recommendation.** Collapse empty resource slots, or show the hand as a single row of only the cards held with a total count. Move "Bank supply" behind the existing "?" guide — it is reference data, not a per-turn decision input.

### 3.6 Trade panel model is unclear — high

Four rows of five identical resource icons stacked vertically, labelled `THEIRS` / `WANT` / `GIVE` / `YOURS` in **11 px uppercase** — the smallest type in the densest panel in the app.

- `THEIRS` and `YOURS` have bordered cells; `WANT` and `GIVE` are borderless icons at **0.25 opacity** (`.trade-cell--empty`). Empty baskets read as *disabled*, not as *drop zones waiting to be filled*.
- Nothing connects the pairs. There is no arrow, no "you give → you get", nothing that says tapping `THEIRS` fills `WANT`. A first-time player is looking at twenty identical icons.
- The `Propose` button with an empty offer renders as a muted olive — `.btn--primary:disabled` is `opacity: 0.4` over `#f3c969`, which reads as an unusual-but-active button rather than a disabled one.

**Recommendation.** Two labelled columns side by side ("You give" / "You get") with a `⇄` between them, drop the separate picker rows and let players tap directly in the basket, and give the disabled primary a genuinely flat treatment.

---

## 4. Prioritised backlog

| # | Fix | Platform | Effort | Impact |
|---|---|---|---|---|
| 1 | Delete `user-scalable=no` + `maximum-scale=1.0` | both | trivial | unblocks every legibility complaint |
| 2 | Landscape phone layout, or a rotate prompt | mobile | S | fixes a 0.2%-board dead end |
| 3 | Remove `.dock { min-height: 250px }`, reserve rows instead | both | S | +169 px to the board |
| 4 | Player strip: wrap to a grid, always show all 4 scores | mobile | S | restores the core strategic signal |
| 5 | Desktop two-column layout (board left, rail right) | laptop | M | board 13% → ~45% of screen |
| 6 | Token/pip size floor, decoupled from board scale | both | M | 6-vs-8 becomes readable |
| 7 | `aria-label` on the three build buttons | both | trivial | they are currently nameless |
| 8 | Drop `role="img"` from the board, title the vertices | both | S | board becomes navigable at all |
| 9 | Vertex visual circle r 11 → r 16, hit r 24 → r 30 | both | trivial | aim matches target |
| 10 | Trade panel: two labelled columns with a `⇄` | both | M | first-run comprehension |
| 11 | Non-colour cue for 6 and 8 | both | S | colour-blind accessibility |
| 12 | Anchor dice to the painted board, scale up on desktop | laptop | S | reconnects cause and effect |
| 13 | Lobby: fix `:hover` subtitle contrast, style checkboxes/selects | both | S | first impression |
| 14 | `role="dialog"` + focus trap + Escape on all modals | both | S | keyboard usability |
| 15 | Collapse empty hand slots, move bank supply into the guide | mobile | S | reclaims ~90 px |

Items 1, 3, 4, 7 and 9 together are perhaps half a day and address the two things named in the brief — screen utilisation and pip legibility — before any redesign work starts.
