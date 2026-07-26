# Authoring the `embedded` pool variant

The `?algo=embedded` draft-pool variant grows pools exactly like `sigseed` — a
random subset of a Dream Avatar's signature cards expanded by pick-affinity — but
reads its synergy from a **committed affinity corpus** instead of rebuilding it
from the draft records in the browser. The committed corpus IS the same
record-derived affinity matrix `sigseed` builds (rounded to the precision at which
it reproduces `sigseed` byte-for-byte), so `embedded` draws the same pools as
`sigseed` — but from an editable card set: new and changed cards are authored as
text recipes and folded into the corpus at bake time.

Design background and the evaluation that led here:
[`affinity_corpus_distillation_design.md`](affinity_corpus_distillation_design.md).

## Files

| File | Role |
|---|---|
| `data/affinity_overlay.jsonc` | **The file you edit.** Recipes for new/changed cards. |
| `data/affinity_corpus.jsonc` | Committed affinity corpus (JSONC: a provenance header over the JSON body) — a play-rate `prior` plus a sparse `affinity` matrix in index space, baked from the records + overlay. The source of truth. Generated — do not hand-edit it; the header comments are preserved across re-bakes. |
| `public/affinity-corpus-data.json` | Served copy the browser loads (gitignored; written by `setup-assets`, which strips the JSONC comments so it is valid JSON). |
| `data/buildaround_support.json` | Independent theme metadata the quality metric reads. |

## Editing how a card drafts

1. Add a recipe to `data/affinity_overlay.jsonc`:
   - **New card** (absent from the historical records):
     ```jsonc
     "add": [
       { "id": "<new-card-uuid>", "resembles": ["<uuidA>", "<uuidB>", "<uuidC>"], "priorScale": 1.0 }
     ]
     ```
   - **Re-point or rescale an existing card**:
     ```jsonc
     "edit": [
       { "id": "<uuid>", "resembles": ["<uuidX>", "<uuidY>"], "priorScale": 0.8 },
       { "id": "<uuid>", "priorScale": 0.5 }
     ]
     ```
   A card placed `resembles` A, B, C inherits the neighbour-mean of their synergy
   rows and columns, so it lands next to them in the affinity geometry. UUIDs are
   lowercase cards_v2 ids; `resembles` may reference any base card or an earlier
   overlay `add`. `priorScale` defaults to `1.0`.

2. Re-bake the corpus (run on demand; **not** run by `setup-assets`, so the
   committed file stays authoritative like a lockfile):
   ```bash
   npm run bake-affinity-corpus            # rewrites data/affinity_corpus.jsonc
   npm run setup-assets                    # copy it to public/ (comments stripped)
   ```

3. Commit **both** `data/affinity_overlay.jsonc` and the regenerated
   `data/affinity_corpus.jsonc`. The diff is meaningful: only the rows for cards
   the overlay touched (plus any whose columns reference them) change, so review
   the corpus alongside the overlay.

## Making a card count in the quality metric

The affinity overlay governs how a card **drafts**; the build-around quality
metric reads a separate metadata system. To give an added or changed card metric
credit, also add its theme entry (`needs`/`supports`) to
`data/buildaround_support.json`.

## Validating a change

```bash
npm run affinity-corpus-parity            # 25 seeds × 32 DreamAvatars
```

This asserts three things and exits non-zero on any failure:

1. **Corpus fidelity** — `embedded` on the committed corpus produces pools
   byte-identical to the official `sigseed` generator, across the whole
   simulation. This is the guarantee: `embedded` IS `sigseed`, from an editable
   committed corpus.
2. **Metric parity** — adequacy ≥ 97.5, traps ≤ 1.0, themeEvenness ≥ 95.0,
   #cards ≥ 460, measured against the live generator.
3. **Negative controls** — a synergy-shuffled and a prior-only corpus score
   materially worse, proving the metric still discriminates.

You can also inspect the variant directly with the existing quality metric:
```bash
npm run pool-metrics -- --variant embedded
npm run pool-metrics -- --compare        # embedded alongside every algorithm
```

## Re-baking after new drafts

When fresh records land in `docs/draft_records_adapted/`, re-run
`npm run setup-assets && npm run bake-affinity-corpus` to rebuild the corpus from
the larger record set. The overlay recipes re-apply automatically — they are
stored as declarative "resembles" recipes, not as raw matrix rows, so they fold
cleanly into the updated matrix.
