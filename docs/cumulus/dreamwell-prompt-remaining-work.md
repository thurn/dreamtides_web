# Dreamwell Prompt Legacy Parity Tasks

This checklist covers Dreamwell prompt paths that the legacy playable battle UI
can resolve and the Cumulus playable battle UI cannot. Dreamwell effects
classified as manual and new rules infrastructure are outside this parity
scope.

## Cumulus resolution blockers

- [x] Generalize the Cumulus `pick-cards` view model and screen so a pending
  prompt can select candidates from either side's hand, void, deck, or
  battlefield. Keep candidate identity keyed by battle-card instance ID and
  preserve required counts, optional skips, highlighted candidates, and the
  empty-target continuation path.
- [x] Cover void-card selection for:
  - `2b23a60c-209c-4c75-b63c-b7f73b2e1a56`
  - `a0fbcbd9-96ee-4392-add7-e1d436f99553`
  - `556057bb-b134-497e-86c2-c6f30049e9e3` after confirmation
  - `fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5` after confirmation
- [x] Cover battlefield-character selection for:
  - `9954cede-8a16-4053-b6e9-da745f4540f5` on the opposing battlefield
  - `20be0fdd-d691-40a9-b4f8-15689ea7ebaa` on the allied battlefield after
    confirmation
- [x] Cover top-of-deck selection for
  `3a4293da-55a1-4094-898a-df402ffa1c92`.
- [x] Add view-model, screen, and battle-flow regression tests for every
  candidate zone, both sides, nested confirmation flows, and empty candidate
  sets. Assert that every pending prompt produces visible resolution controls.
- [x] Log the Dreamwell card UUID, prompt ID, candidate battle-card instance
  IDs and backing card UUIDs, chosen instance IDs, and final resolution so the
  interaction can be reconstructed from production logs.
- [x] Browser-QA each affected UUID in Cumulus at desktop and mobile widths,
  including confirmation-to-picker transitions and successful return to normal
  battle controls.

## Completion gate

- [x] Every authoritative Dreamwell `pendingPrompt` has usable Cumulus controls
  on desktop and mobile, and no valid prompt can leave the battle controls
  disabled without a resolution path.
- [x] Every Dreamwell interaction already supported by the legacy playable
  battle UI completes through normal Cumulus player UI without
  developer-inspector intervention.
