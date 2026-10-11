# hv-umm2.373 validation and scope evidence

Base: `886003f7c43e57dbb5c8deadadd387769671f5cc`.

## Contract and failure paths

Eight synthetic contracts run through legal engine actions and the fold adapter.
They cover both controllers and actual normal/Reclaim cost payment; latest-play
provenance survives structural cloning, JSON reload and replacement-flag removal.
Normal and Offering plays reset earlier provenance. A created stack copy takes
the false branch while its original retains its own Reclaim branch. An emblem
and a created source that ceased to exist take the false branch.

The existing additional-cost prompt suspends before any play writes. Cancellation
and invalid, foreign, stale and concurrent input keep the committed state intact.
A later resolution prompt reloads with historical provenance, reproduces the
same provisional points, and commits its writes exactly once after answering.
Duplicate answers after settlement are rejected. A synthetic resolution error
writes score and provenance in its work state, then throws; the original committed
state and its provenance remain intact. The new condition opens no prompt or
writer of its own; it reads the committed source record. Play-time provenance is
assigned after the existing commit point alongside the existing route status.

Existing intent records identify the actual play from the void; card-play and
copy events, prompt records and the existing points events reconstruct the branch
and outcome with physical IDs and UUIDs. The pure condition requires no new host
logging event or presentation surface.

## Authorized fallout

The parent explicitly approved durable latest-play provenance and the one
post-commit assignment in `steps/kinds/play.ts`, plus mechanical CardStatus
fallout. The state type, fresh state, structural clone and structural hash are
engine hubs. Compiler/contract evidence identified these mechanical callers:

- `view/view.test.ts`: add the required false provenance field to the fixture.
- `engine-battle-view-model.ts`: add the explicit null badge mapping for historical provenance; Cumulus skill read, with no visible surface change.
- `engine-battle-presentation.test.ts`: include historical provenance among the exhaustive nonvisual boolean exceptions.
- `rules/replay/fixtures/adversarial.json`: restamp only `finalHash` after the additive persisted field; all genesis/events remain unchanged. The existing generator ran twice with byte-identical output (SHA-1 `217e49847931b52b73b64224ee4053d321b129f3`).

No generator, content, prompt, cost or role code changes. Browser QA is not
required because no prompt, badge, copy, geometry or player workflow changes.
The old cards-07 worktree remains checkpointed for parent-managed resumption.

## Validation

- Focused new condition: 8 cases passed (2.3s test stage).
- Full primitive contract module, content gates and view tests: 371 cases passed; 1.8s test stage, 0.7s preparation, 0.6s restoration.
- Focused mechanical presentation/replay boundary: 49 cases passed; 6.02s elapsed, 7.85s user CPU, 1.56s system CPU.
- Initial review found only the exhaustive nonvisual exception and intentional adversarial hash stamp: 2463 passed, 3 failures. Focused repairs passed before the final aggregate run.
- Initial knip: pass, 3.34s elapsed.

RD: `RD-hv-umm2.373-1`, ladder 4, normative Reclaim clarification.
No pre-existing issue discovered. No image or browser artifact. No long-lived
server, browser session or other runtime writer started.

- Final review: 158 files / 2466 cases passed, 42.45s elapsed, 99.35s user CPU, 10.25s system CPU.
- Final knip: pass, 3.05s elapsed.
- Full review under the machine heavy lock: 216 files / 3105 cases passed, full lint, both typechecks, import-cycle check, knip and production bundle passed. 70.19s elapsed, 173.29s user CPU, 15.44s system CPU. The bundle contains no development-only module.
- Host one-minute loads observed during validation: 12.11, 17.87, 21.44; final 16.75. No heavy-lock wait of consequence observed. Workers fixed at 2.
- Test delta: one discovered synthetic contract module, 201 added lines, zero added jsdom files; the two mechanical test edits have zero net line delta.

Implementation wall time is measured from the initial npm-install-created
`node_modules` directory to final evidence (the dispatch startup precedes this
by about a second). The full run's synthetic lease tests operate on temporary
fixture roots and report cleaned process groups; their expected provider-error
messages are test inputs. All owned commands have completed and no live runtime
writer remains.

## Parent integration and review disposition

Original validated source: `0da8ef598027ad3d21e534550c04a97cf6937a97`.
The full-suite/bundle evidence above belongs to that source on the original
base. Candidate `01a12b13-0515-7310-b832-1b499a2682a9` encountered an
additive rules-document conflict after a peer landed its gained-Reclaim paragraph.
The parent retained the full owned delta, parked only its rules paragraph in an
unsubmitted checkpoint, and used native Tollgate update. Final base:
`1859bf668c1d07b62d8859116176e69ba2548fb2`. Both rules paragraphs are preserved.

Updated-base focused checks passed 420 cases (about 4.6s including preparation
and restoration); review passed 2489 cases in 54.73s, knip in 3.36s.
The first cold Claude provider returned partial advisory evidence because its
access restrictions prevented actual diff and skill reads. Confirmed gaps:
the engine reference now documents the new field and condition, and the
missing-source fixture has true play provenance before that source ceases to
exist. The suggested zone reset conflicts with Dreamtides stable identity and
persistent history across zones; current rules now explicitly describe that
lifetime, and the RD distinguishes the actual-play analogy from zone lifetime.
A fresh final-range review receives a saved exact diff and explicit read access.

After the test/documentation corrections, focused contracts/content/replay
passed in 5.57s; required review passed in 36.77s and knip in 2.69s.
Production implementation and existing hash stamp are unchanged by these review
corrections; no additional full run or browser check is warranted. Both parent
check processes settled and the earlier review provider exited successfully;
its detached snapshot was removed. All changes remain in the single bead commit.
