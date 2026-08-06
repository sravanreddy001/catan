# Changelog

## [1.0.0] - 2026-08-06

First tagged release. The web app has grown from a board UI into a full playable game.

### Added
- Full 4-player Catan ruleset: setup phase, dice production, robber and forced discard on 7, development cards, longest road, largest army, victory at 10 points.
- Offline mode against 1-3 medium-strength AI opponents.
- Online mode over peer-to-peer rooms with a shareable code/link, plus saved-game resume.
- Player-to-player trading alongside bank/harbour trading at correct port rates.
- Random turn order each game, and player color selection (offline and online, with conflict resolution when hosting).
- Dice rendered as real pip-style dice anchored to the board; tiles matching the roll stay highlighted until the next turn.
- A "?" cost guide covering what each piece and development card costs.

### Changed
- Resource hand redesigned as compact square cards with a count badge instead of a stacked pile.
- Build actions show the piece's own shape (matching the board) instead of a text label or emoji.
- Player-to-player trade offers stay open (non-blocking banner) until accepted, cancelled, or every possible responder has declined, instead of disappearing the moment they're sent.
- General UI polish: consistent hover/active/focus states on every button, a distinct color for the trade action, enlarged and outlined tile icons for legibility.

### Fixed
- Longest road was never scored — it's now computed and awarded the 2 VP bonus correctly.
- Discard on 7 previously happened automatically for every player; humans now choose what to discard, bots still decide on their own.
