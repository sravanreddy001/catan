---
feature: scarce-bank-mode
status: approved
ux-required: true
date: 2026-08-07
---
# Scarce bank mode

See [settings-overview.md](./settings-overview.md) for shared codebase context and its cross-cutting HUD-indicator/preset requirement.

**Approved by user (2026-08-07), with two conditions attached before ship (not before feasibility/design):**
1. **Simulation validation.** Before this ships, run a simulation (not just informal playtest) measuring trade volume per turn at each bank-scarcity preset. Watch specifically for whether trade frequency jumps *exponentially* rather than gradually as the bank tightens — that would signal trade fatigue (players forced into constant, tedious trading) rather than the intended "riskier trading" dynamic. If a preset shows exponential-looking trade volume, that preset's number needs raising, not just a UX warning. This also directly informs open question 1 below (the actual scarce/very-scarce numbers) — the simulation should set those numbers, not a guess.
2. **In-UI help text on the toggle.** The lobby control for this setting must carry short help text warning players that scarce bank means trading more often — this is a behavior change, not just a number change, and hosts picking it blind should know what they're opting into before the game starts.

## Problem

The bank starts with a fixed 19 of each resource (`BANK_PER_RESOURCE` in engine.ts) regardless of player count or preference. There's no way to make trading more cutthroat by tightening supply. Separately: the "if demand exceeds bank supply, nobody gets the resource" rule (`produce()` in engine.ts) already exists and already fires today whenever the bank runs dry — but the bank's remaining supply is never shown anywhere in the UI, so when this rule fires it looks like a bug ("I rolled an 8 and got nothing") rather than an intentional scarcity mechanic.

## Users & scenario

Players who've played enough standard games want a scarcer-resource variant where trading is riskier and hoarding a monopoly of one resource is more punishing, without changing anything else about the rules.

## Scope (what we're building)

- Make `BANK_PER_RESOURCE` a per-game config value instead of a constant, set at lobby time. Expose as a small set of presets (e.g. standard 19 / scarce 12 / very scarce 9) rather than a free-form number input — flagged as an open question below on the exact values.
- Add a bank-supply indicator to the Hud so players can see when a resource is running low, before it hits zero and their production silently disappears. This is not optional polish — without it, scarce mode reads as broken.
- No change to the "if demand exceeds bank supply, split among nobody unless there's exactly one claimant" rule itself — scarce mode just makes it trigger more often, which is the point.
- **HUD indicator**: per settings-overview.md's cross-cutting requirement, when a non-standard bank preset is active it shows in the top-left settings chip in `Hud.tsx`, visible to every player (distinct from the per-resource bank-supply indicator described above, which shows remaining counts, not that scarce mode is on).

## Non-goals

- No change to dev-card bank cost or trade rates (ports, 4:1) — scarcity only affects the resource pool size, not the price of anything.

## How this changes game dynamics

- Production becomes unreliable much earlier in the game: a well-rolled number can pay out nothing if the bank is dry on that resource and more than one player was owed it. This punishes players who lean on a single resource type (e.g. an ore-heavy city rush) far harder than in standard play, because the exact rule that already exists (`produce()`) starves *everyone* claiming a scarce resource, not just the "loser" of the roll.
- Bank trades (4:1, or 3:1/2:1 via ports) become a double-edged tool: every card you drain from the bank via trade brings the whole table closer to a dry resource, so bank trades stop being a "free" way to convert surplus and start being a lever you can also use to starve an opponent who needs that resource next.
- Monopoly (dev card) becomes significantly more dangerous to play into, since it's already pulling cards out of circulation from opponents' hands rather than the bank — but in scarce mode, opponents have less slack to give up before their own production dries up too.
- Net effect: more variance, more value placed on resource diversity (touching more resource types via corner placement) over raw pip count, and player skill shifts toward tracking approximate bank depletion — which is exactly why the UI indicator above is load-bearing, not decorative.

## Acceptance criteria

- Given a host picks a scarce bank preset, when the game starts, then `state.bank` starts at the chosen value per resource instead of 19, and all downstream logic (produce, bankTrade, buyDev, discard refunds) works unchanged since they already read `state.bank` rather than the constant.
- Given the bank is low on a resource, when a player views the Hud, then they can see roughly how much of that resource remains (exact display TBD with UX mock).
- Given the standard preset is picked, when the game starts, then behavior is identical to today (regression check).
- Given a non-standard preset is active, when any player views the Hud, then the top-left settings chip reflects that.
- Given a host is choosing a bank preset in the lobby, when they view the control, then help text explains that scarce bank means trading more often (approval condition 2, above).
- Given the simulation (approval condition 1, above) has run, when its results show exponential rather than gradual trade-volume growth for a preset, then that preset's number is raised before ship, not just flagged in UI.

## Success metric

No qualitative complaints along the lines of "I rolled my number and got nothing, is this broken" once the bank indicator ships — informal signal from playtesting, not a hard metric. Simulation results (approval condition 1) are the quantitative backstop for the actual preset numbers.

## Open questions (need user decision before feasibility)

1. What are the actual scarce/very-scarce numbers, and are they uniform across all 5 resource types or weighted (e.g. ore/brick scarcer since they gate cities/roads more tightly)? Proposing uniform presets (19/12/9) as a starting default — confirm or override.

## Feasibility (Architect fills this in)
