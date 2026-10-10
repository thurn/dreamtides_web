# hv-n5lj.37: card models for copies with different deck-entry modifications

Reproduced. `createEngineCardModels` indexed dealt card definitions by card
UUID and transfiguration, first wins, so every copy of a card shared the first
dealt copy's text, Fast flag, and Reclaim cost whatever its deck-entry
modifications (D39).

## Evidence

- Unit: `engine card models` in
  `src/screens/cumulus_adapters/engine-battle-view-model.test.ts`. Against
  the base card model, a hand of a plain, a Reclaim 2, and a Fast copy of one
  synthetic card shows the plain definition's text, Fast flag, and Reclaim
  cost on all three.
- Browser (`artifacts/qa/hv-n5lj.37/two-copies.mjs`, run by the scenario
  runner): the Layer 1 battle (`?goto=battle&seed=1&debug=1`) with the deck
  reduced through the journey debug editor to two copies of card
  `5a980eff-6ec7-44d8-9977-b98e66bbc2c8`, one with Fast and Reclaim 2. The
  opening hand holds both engine variants (`window.__engineProbe`).
  - Base (`before.result.json`, `before-desktop-hand.png`,
    `before-desktop-plain.png`, `before-desktop-modified.png`): the plain
    copy's face shows the modified copy's Reclaim line and Fast icon.
  - Fixed (`two-copies.result.json`, `after-desktop-*.png`,
    `after-mobile-*.png`): each copy shows its own face; `__caps` empty.

## Fix

Definitions are indexed by display variant: the transfiguration and the Fast,
Reclaim, and type changes, read from a definition through the same
`deckModsOf` that builds the engine deck entry. The spark bonus and cost
reduction stay out of the key: the model takes spark and cost from the
engine's characteristics, and the engine's cost reduction also carries the
next-battle discount, which the definition's deck-entry modification does
not. A card in a variant no deck entry dealt (a debug or effect-created
copy) shows the first dealt definition of its transfiguration when
transfigured, else the catalog card.
