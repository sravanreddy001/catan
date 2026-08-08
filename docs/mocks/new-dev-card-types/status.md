feature: new-dev-card-types
status: approved
approved-version: mock-v2.html
feedback:
- v1: Merchant logic was wrong — it is three independent 1:1 swaps (give any 3
  cards, take any 3 cards), not 3 of one type for 3 of another. Also: every dev
  card must show what it means in-app, so the deck is easy to explain.
- v2: approved 2026-08-07, as mocked and with no further changes requested.

v2 is frozen as the design input for build. The four sub-questions it raised
were not separately answered, so the mocked behaviour stands as approved:
- the confirm sheet appears on every play, not only the first play of a kind;
- the nine rule strings in frame 3 ship verbatim as `DEV_RULE`;
- Merchant is capped at 3 cards out with the same number back;
- the guide is reachable from the dev bar (❓) and from the lobby.
