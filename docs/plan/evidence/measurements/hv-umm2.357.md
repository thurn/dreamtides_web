# hv-umm2.357 measurements

## Registration hubs

`registration hubs` ([workflow § Hub areas](../../workflow.md#hub-areas))
grants additive registration entries in these files, each present at base
`97b63be39`:

- `src/engine/effects/registry.ts`
- `src/battle/components/presentation-items.ts`
- `src/runtime/battle-prompt-messages.ts`
- `src/engine/policy/prompts.ts`
- `src/screens/cumulus_adapters/prompt-host-view-model.ts`
- `src/screens/cumulus_adapters/engine-battle-view-model.ts`
  (`CARD_STATUS_BADGES`)
- `src/screens/cumulus_adapters/engine-battle-view-model.test.ts` (role
  expectation)
- `src/screens/cumulus_adapters/engine-battle-presentation.test.ts`
  (`UNLOGGED`)
- `src/engine/testing/prompt-lab.ts` (also under `engine hubs`)

Outside these files, the landed primitive beads hv-umm2.60, .62, .63, and
.64 registered only in `engine hubs` files (`src/engine/prompts/types.ts`,
`src/engine/events/index.ts`, `src/engine/testing/redaction.ts`,
`docs/plan/engine-design.md`) and in `docs/rules.md`, its own area.

## Inventory

The generator plans `engine hubs` and `registration hubs` for every bead that
introduces a primitive or a prompt kind, in place of the five explicit
prompt-registration files. All 67 planned primitive beads carry both; no
other bead does.

- Fresh generation before and after the change is identical except for
  those Areas entries and four projected serialization edges on
  `src/engine/policy/prompts.ts` (`prim-banish-cards` after
  `prim-value-card-stats`, `prim-return-from-void` after
  `prim-banish-cards`, `prim-move` after `prim-return-from-void`,
  `prim-choose-subtype` after `prim-move`), which the additive hub does not
  project.
- `--refresh-registration-areas` on the tracked base inventory adds
  `registration hubs` to its 71 primitive and prompt-bearing records and
  changes nothing else. On the regenerated inventory it is a no-op.
- Baseline catalog drift is recorded in
  `docs/plan/evidence/pre-existing/hv-umm2.357.md`.

| Check | Wall s | Host load (1/5/15 min) | Result |
| --- | ---: | ---: | --- |
| generator (write) | 0.66 | { 4.76 7.77 8.22 } | 1,209 entities, 237 beads |
| generator `--check` | 0.61 | { 4.76 7.77 8.22 } | current |
| `--refresh-registration-areas --check` | 0.57 | { 4.76 7.77 8.22 } | current |
| `npm run review` | 14.5 | { 3.77 7.25 8.01 } | pass (no related tests) |
| `npm run knip` | 2.8 | { 3.46 7.01 7.91 } | pass |

## Monitor

Follow-up check for the `bead-areas-incomplete` cause hv-umm2.64 recorded:
the next 5 primitive beads dispatched with `registration hubs` in their
Areas record no `bead-areas-incomplete` friction for a registration file
this hub covers. A registration-file widening stop among them reopens the
cause through the friction triggers.
