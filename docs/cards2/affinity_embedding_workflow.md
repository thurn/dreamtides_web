# Authoring the `embedded` pool variant

The `?algo=embedded` draft-pool variant grows pools exactly like `sigseed` — a
random subset of a Dreamcaller's signature cards expanded by pick-affinity — but
reads its synergy from a **committed card embedding** instead of rebuilding it
from the draft records in the browser. The embedding is editable: new and changed
cards are authored as text recipes and folded into the embedding at bake time.

Full design and validation evidence:
[`affinity_corpus_distillation_design.md`](affinity_corpus_distillation_design.md).

## Files

| File | Role |
|---|---|
| `data/affinity_overlay.jsonc` | **The file you edit.** Recipes for new/changed cards. |
| `data/affinity_embedding.jsonc` | Committed embedding (JSONC: a provenance header over the JSON body), baked from the records + overlay. The source of truth. Generated — do not hand-edit the vectors; the header comments are preserved across re-bakes. |
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

2. Re-bake the embedding (run on demand; **not** run by `setup-assets`, so the
   committed file stays authoritative like a lockfile):
   ```bash
   npm run bake-affinity-corpus            # rank 32 (default)
   npm run setup-assets                    # copy the embedding to public/
   ```

3. Commit **both** `data/affinity_overlay.jsonc` and the regenerated
   `data/affinity_embedding.jsonc`. A re-bake rewrites every vector wholesale (the
   SVD basis rotates), so review the embedding for size/sanity and metric parity,
   not line-by-line — the human-meaningful diff lives in the overlay.

## Making a card count in the quality metric

The affinity overlay governs how a card **drafts**; the build-around quality
metric reads a separate metadata system. To give an added or changed card metric
credit, also add its theme entry (`needs`/`supports`) to
`data/buildaround_support.json`.

## Validating a change

```bash
npm run affinity-corpus-parity            # 25 seeds × 32 Dreamcallers
```

This asserts three things and exits non-zero on any failure:

1. **Bake-pipeline fidelity** — `embedded` on the in-memory record matrix is
   byte-identical to the official `sigseed` generator (the SVD is the only
   approximation in the chain).
2. **Embedding metric parity** — adequacy ≥ 97.5, traps ≤ 1.0, themeEvenness
   ≥ 95.0, #cards ≥ 460, measured against the live generator.
3. **Negative controls** — a synergy-shuffled and a prior-only corpus score
   materially worse, proving the metric still discriminates.

You can also inspect the variant directly with the existing quality metric:
```bash
npm run buildaround-metric -- --variant embedded
npm run buildaround-metric -- --compare        # embedded alongside every algorithm
```

## Re-baking after new drafts

When fresh records land in `docs/draft_records_adapted/`, re-run
`npm run setup-assets && npm run bake-affinity-corpus` to refit the embedding from
the larger record set. The overlay recipes re-apply automatically — they are
stored as recipes, not latent vectors, precisely so they survive a re-fit in any
SVD basis.
