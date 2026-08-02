# Catan Box Insert — Design Spec

Date: 2026-08-02
Status: draft, pending user review

## 1. Goals

1. **Play any configuration** — base 4-player, base 5-6 player, Seafarers 4-player, Seafarers 5-6 player (not yet owned). Pulling the pieces for tonight's game must be fast and hard to get wrong.
2. **One box.** Confirmed feasible: all parts total ~1,400 cm³ against ~7,330 cm³ of interior. The second-box fallback is not needed.

## 2. Constraints

| Constraint | Value |
|---|---|
| Box interior | 292 × 292 × 86mm (11.5 × 11.5 × 3.4in) |
| Printer build volume | 256 × 256mm (Bambu X1/P1/A1) |
| Edition | Catan 5th edition, oversized components |
| Cards | Bare, not sleeved, no plan to sleeve |
| Storage | Box may be tipped; rulebooks on top provide retention |

## 3. Measured component dimensions

User-measured unless noted.

| Component | Dimensions (mm) | Qty |
|---|---|---|
| Terrain hex, across flats | 80 | 70 total, see §6 |
| Hex thickness | 2.0 (from 10-stack) | — |
| Frame piece, long | 248 × 70 × 2 | 6 base |
| Frame piece, short | 90 × 70 × 2 | 4 extension |
| Resource / development card | 54 × 80 | ~200 |
| Player aid card | 78 × 88, 12mm stacked | 6 |
| Largest Army / Longest Road card | 90 × 80 | 2 |
| Ship-building card | 78 × 32 | 4 (size for 6) |
| Number token | 25 dia × 2 | 18 base + 10 ext + 10 Seafarers |
| Sea port / harbor token | 45 × 35 | 10 Seafarers + 2 Seafarers 5-6 |
| Road | 6 × 6 × 20 | 15 per player |
| Settlement | 10 × 12 × 14 | 5 per player |
| City | 20 × 20 × 10.5 | 4 per player |
| Ship | 18 × 9 × 8 | 15 per player |
| Robber | 15 dia × 33 | 1 |
| Pirate | 10 × 32 × 19 | 1 |
| Die | 16 × 16 × 16 | 2 |
| Rulebooks, all | 3mm stacked | — |

### Verified from published contents

Seafarers 1-4 (5th ed): 60 ships, 1 pirate, 6 frame pieces, 19 sea hexes, 11 region tiles, 10 number tokens, 10 harbor tokens, 50 Catan chits.

Seafarers 5-6: 30 ships, 7 sea tiles, 2 gold fields, 1 desert, 2 frame pieces, 2 harbor tokens, 35 Catan chits. **No number tokens.**

**Discrepancy:** user counted 9 number tokens and 9 harbor tokens; official contents list 10 of each. Design sizes for 10. User to check the box for the missing pieces.

## 4. Tolerance policy

- **Tray to box: 0.8mm gap per side.** Loose fit, chosen deliberately — always easy to lift out, forgiving of print warp and cardboard swelling. Trays can shift slightly; the rulebooks lying on top provide retention.
- **Cavity to component: 0.8mm per side.**
- **Wall thickness: 1.5mm standard.**
- **Every tray 1mm short of its slot depth** so it never vacuum-sticks.
- **Thumb scallops** on all lift-out trays and card slots.

## 5. Architecture

The hexes stand **vertically on edge**, filing-cabinet style, in a full-height partitioned rack. Everything else packs beside the rack in two stacked layers.

This replaces an earlier two-tier design that laid hexes flat in 18 stacking trays. Vertical storage was adopted because it cuts the hex footprint by roughly two thirds, drops the part count from 30 to 13, and — most importantly — allows **partitioning by game instead of by terrain.**

Partitioning by game works even though 5th edition base and extension land hexes are visually identical: whichever 19 tiles occupy the base partition *are* the base set. Setup becomes "lift out the base block." The flat-tray design required counting 4 forest, 4 pasture, 3 hill and so on at every single setup.

Organization is otherwise **hybrid**: player wood split by color (one tray each, all their pieces together), board pieces grouped by function.

## 6. Hex rack

- External: **204 × 114 × 50mm**
- Internal channel: 94mm deep (92.4mm hex point-to-point + clearance)
- **Long side walls are 10mm**, matching the dividers, so the rack is a rigid box section rather than a thin-walled tray.
- Hexes stand on a **flat edge**, so standing height is 80mm — not 92.4mm. Standing on a point does not fit the box.
- Rack walls are 50mm tall against an 80mm tile, so tiles protrude ~30mm. Intentional: it saves filament and gives you something to grip. The snug channel keeps them upright.
- **Floor 1.5mm — a hard ceiling, not a choice.** 80mm tile + 1.5mm floor + 3mm rulebooks + 1mm clearance = 85.5mm of an 86mm interior. Any thicker and the lid stops closing. Stiffness comes from the 10mm walls and dividers: the floor never spans more than 66mm unsupported, and the rack carries ~550g of cardboard when full, which 1.5mm of PLA in an eggcrate handles comfortably.
- Total occupied height 81.5mm.
- Position: x 0-204, y 0-114

### Partitions

| Partition | Contents | Tiles | Stack | Slot width |
|---|---|---|---|---|
| 1 | Base 4-player land | 19 | 38mm | 42mm |
| 2 | 5-6 extension land | 11 | 22mm | 24mm |
| 3 | Seafarers 1-4 — 19 sea + 11 region | 30 | 60mm | 66mm |
| 4 | Seafarers 5-6 — 7 sea, 2 gold, 1 desert | 10 | 20mm | 22mm |
| | **Tiles** | **70** | **140mm** | **154mm** |

Slot widths carry 10% slack so blocks are never jammed.

**Length budget:** 154mm of slots + 5 dividers × 10mm = **204mm external.**

**Dividers are 10mm wide**, including both end walls — five in total. Chosen over the structurally sufficient 2mm so there is somewhere to put fingers on either side of a block. Full channel depth, 50mm tall.

Tiles stand 80mm and protrude 30mm above every divider, so tiles are gripped directly rather than fished out of a slot.

**Block names are embossed into the divider top faces** — `BASE 4P`, `5-6 EXT`, `SEAFARERS`, `SF 5-6`. A 10mm top face is wide enough to read, and it removes any need to remember which block is which.

Partition 4 stays empty until Seafarers 5-6 is bought. If its counts differ from published, move a divider rather than reprinting.

**Setup by configuration:**

| Game | Take |
|---|---|
| Base 4-player | Partition 1 |
| Base 5-6 player | Partitions 1 + 2 |
| Seafarers 4-player | Partitions 1 + 3 |
| Seafarers 5-6 player | Partitions 1 + 2 + 3 + 4 |

## 7. Floor plan

Two regions beside the rack.

**Region A** — x 0-292, y 114-292 (292 × 178mm), two stacked layers
**Region B** — x 206-292, y 0-114 (86 × 114mm), full height

### Region A, lower layer (0-42mm)

| Part | External (mm) | Position |
|---|---|---|
| Frame tray | 254 × 76 × 42 | x 0-254, y 114-190 |
| Token / dice tray | 100 × 90 × 40 | x 0-100, y 192-282 |
| Reference card tray | 96 × 94 × 32 | x 102-198, y 192-286 |

Spare: x 200-292, y 192-292.

### Region A, upper layer (42-82mm)

| Part | External (mm) | Position |
|---|---|---|
| Card modules ×2, stacked | 173 × 85 × 20 each | x 0-173, y 114-199 |
| Player trays ×6, two sub-layers of 3 | 95 × 60 × 20 each | x 0-285, y 201-261 |

Spare: x 175-292, y 114-199, and a 29mm strip at y 263-292.

### Region B

Ports + chits tray, 86 × 94 × 20mm, at x 206-292, y 0-94. Remaining height above it (~60mm) is spare.

## 8. Part specifications

### Frame tray
External 254 × 76 × 42mm, cavity 250 × 72 × 38mm. Holds all 18 frame pieces stacked: 6 base long (248 × 70), 4 extension short (90 × 70), 6 Seafarers, 2 Seafarers 5-6 — 36mm of stack. Short pieces stack on top of long ones; there is no floor width to sit them side by side.

### Card modules ×2
Mirrors the original box: two modules of three slots, stacked. Five resource types plus development = six slots exactly.

External 173 × 85 × 20mm each, stacked to 40mm. Slot cavity 55.6 × 81.6mm, 12mm deep, three per module.

**Access:** rear 40% of the slot floor is raised 4mm, tilting the stack forward, plus a 25mm-wide thumb scallop in the front wall with the floor undercut 2mm beneath it. A full 15° ramp was rejected: across an 84.6mm slot it rises 22.7mm, which does not fit two stacked modules inside 40mm.

### Reference card tray
External 96 × 94 × 32mm, single well 93 × 91 × 30mm. Holds player aids ×6 (12mm), Largest Army and Longest Road ×2 (4mm), ship-building cards ×6 (12mm). One shared well because they all come out at setup together.

### Player trays ×6
External **95 × 60 × 20mm**, one per color. Wells in two columns: roads 51 × 27 × 14 (15 roads, two layers) above cities 43 × 22 × 12 · ships 40 × 30 × 18 (two layers) above settlements 28 × 26 × 16.

Re-proportioned from an earlier 61 × 98 when the rack's 10mm side walls pushed Region A 17mm shallower. Same wells, same capacity, different arrangement.

### Token / dice tray
External 100 × 90 × 40mm. Coin-roll troughs: semicircular channels 27mm wide, cradling token stacks laid horizontally so each token stands on edge. Finger relief in each side wall so a whole row lifts out at once.

| Feature | Length |
|---|---|
| Trough — base tokens ×18 | 40mm |
| Trough — 5-6 extension tokens ×10 | 24mm |
| Trough — Seafarers tokens ×10 | 28mm |
| Dice pockets ×2, 17mm cubes | 38mm |
| Robber socket, lying down (16.6 dia × 34.6 long) | 35mm |
| Pirate socket, lying down (11.6 × 33.6 × 20.6 deep) | 34mm |

### Ports + chits tray
External 86 × 94 × 20mm. One well 48 × 38mm for 12 sea ports (45 × 35) stacked flat; the remainder is an open bin for the 85 Catan chits. The chit bin is deliberately unsorted — see §10.

## 9. Validation

Two gates, in order.

**Gate 1 — the lid test. PASSED** (user-verified 2026-08-02). A terrain hex standing on its flat edge clears the closed lid.

The margin is half a millimetre: 80mm tile + 1.5mm rack floor + 3mm rulebooks + 1mm clearance = 85.5mm against an 86mm interior. Because the margin is this thin, the rack floor must not exceed 1.5mm and the rack must not gain a lid.

**Gate 2 — the test coupon.** A short section of hex channel plus one partition, ~15 minutes and a few grams. Check that a hex slides in and out easily and stands upright.

The 80mm across-flats measurement is the number the whole rack depends on, and it initially looked inconsistent with the 70mm frame width. The oversized road (6 × 6mm) and city (20 × 20mm) later corroborated it, but this is cheap insurance.

Nothing else goes on the plate until both gates pass.

## 10. Open items

1. **Missing pieces.** User has 9 number tokens and 9 harbor tokens; official contents list 10 of each. Check the box.
2. **Catan chits.** 85 pieces across too many varieties to sort usefully. Deferred by decision: an open bin for now, refine later.
3. **Seafarers 5-6 frame piece dimensions.** Assumed no larger than 248 × 70mm. Verify on purchase.
4. **Neat arrangement of wood within player trays.** Raised and deferred by the user. Current well sizes are capacity-driven, not aesthetics-driven.
