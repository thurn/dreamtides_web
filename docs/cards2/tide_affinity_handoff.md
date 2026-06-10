# Hand-off: affinity-based tide selection for the `tides` draft-pool variant

This document is a self-contained brief for an agent with no prior context on
this problem. It describes the current state of the `?algo=tides` draft-pool
variant, the measured evidence for what to build next, the exact design
constraints the project owner has set, and an ordered implementation plan with
verification gates.

## 1. Problem domain in three paragraphs

Dreamtides is a card game prototype. At the start of a quest run, each
Dreamcaller (a hero the player picks; 32 exist, defined in
`data/tabula/dreamcallers_v2.toml`) gets a 200-copy **draft pool** the player
drafts cards from. Pool construction algorithms are selected by the `?algo=`
URL parameter; each is a `PoolStrategy` registered in
`src/draft/pool/registry.ts`. The best-performing algorithm is `idf3`
(`src/draft/pool/variant-idf3.ts`): it grows each pool from a corpus of ~534
real player decklists (bundled from `docs/draft_records_adapted/` into
`public/decklists-data.json`) by picking one starter deck — steered toward the
Dreamcaller's `signature-cards` via IDF-cosine "anchor" decks — and folding in
that starter's nearest-neighbour decks until ~200 copies (2-copy cap per
card).

Playtest feedback is that `idf3` pools feel "magical" (opaque). The `tides`
variant (`src/draft/pool/variant-tides.ts`) is its human-legible counterpart:
**32 preconstructed decks called "tide decks"**, baked offline from the same
decklist corpus, combined at quest start by a process a player can be told in
one sentence. The decklists are committed in `data/tides.jsonc` (cards keyed
by stable cards_v2 UUID) and rendered for players in
`docs/cards2/tide_decklists.md`. The bake (`npm run bake-tides`,
`scripts/bake-tides.mjs`) is a deterministic pure function of the corpus:
k-medoids clustering under `1 − IDF-cosine` distance, density-balanced so an
archetype's share of tides tracks its share of real decks, plus a baked
per-Dreamcaller "favored tides" list computed with the same signature probe
`idf3` uses for anchors.

Quality is measured two ways. (a) **Similarity to idf3**:
`npm run tides-similarity` (`scripts/tides-similarity-experiment.mjs`)
compares two algorithms across 32 Dreamcallers × N seeds — per-card
inclusion-frequency cosine read against idf3's own seed-split self-similarity
ceiling, best-match pool Jaccard, and pool shape. (b) **Pool quality**:
`npm run pool-metrics` (`scripts/pool-metrics.mjs`)
scores adequacy (do pools carry support for the build-around payoffs they
contain), traps (payoffs a pool cannot support), and diversity
(card-utilization evenness + theme-spread evenness), using per-card metadata
in `data/buildaround_support.json`.

## 2. Current state and measured numbers

The `tides` variant currently works like this (`generateTides` in
`src/draft/pool/variant-tides.ts`): shuffle the Dreamcaller's baked favored
list and take `TIDES.favoredDraw = 1` favored tide as the lead (none for the
12 signatureless "neutral" Dreamcallers); then join further tides **drawn
uniformly at random** until ≥200 copies are dealable under the 2-copy cap;
shuffle the combined bag; deal 200.

Measured against `idf3` (100–200 seeds × 32 Dreamcallers):

| Measure | tides | idf3 |
| --- | --- | --- |
| Card-frequency cosine (raw / idf3 self-ceiling) | 0.937 / 0.958 | — |
| Normalized similarity headline | 97.0 | — |
| Adequacy | 92.9 | 92.9 |
| Expected traps per pool | 2.57 | 2.49 |
| Diversity headline | 89.2 | 94.4 |
| — card-utilization evenness | 99 | 99 |
| — theme-spread evenness | 80 | 90 |
| — survivors buildable rate | 3% | 16% |
| Pool shape (distinct / doubled per 200 copies) | 162 / 38 | 135 / 65 |

The whole remaining gap is **theme spread**, dominated by the survivors
archetype. Root cause, established by measurement: a theme is "buildable"
when its support cards are ≥18% of the pool, and *random* fill tides dilute
the lead tide's theme below that threshold. A read-only diagnostic (Appendix
A) holds the 32 tides fixed and only changes the fill rule — lead tide plus
its *nearest-neighbour* tides (by cosine between tide card vectors) instead
of random tides:

| Theme | leads clearing 18% with ALLY fill | with RANDOM fill |
| --- | --- | --- |
| survivors | 5 of 32 | 0 |
| spirit-animals | 6 | 2 |
| discard | 3 | 1 |
| warriors | 6 | 10 |
| abandon | 18 | 25 |

Ally fill lifts every starved theme AND pulls down the over-represented ones —
exactly what theme-spread evenness rewards. 5/32 survivors leads ≈ idf3's 16%
survivors rate. **The limiting factor is the selection protocol, not the
number of tides** (coverage is already 496/496 draftable cards, and the
survivors region's ~3 tides of 32 match its ~9% share of corpus decks).

## 3. Goal

Replace random tide selection with **affinity-based selection**, reaching at
least parity with `idf3` on adequacy and traps, and meaningfully closing the
diversity gap (survivors buildable at a double-digit percentage), while
keeping the player-facing story fully legible and every relationship
inspectable in committed data.

Target player story:

> "There are 32 preconstructed decks called tides — each has a known decklist
> you can go read. Each tide lists its **allied tides** (decks that work well
> together), and each Dreamcaller has a **tide pool** it draws from. We draw
> a lead tide from your Dreamcaller's pool, shuffle it together with its
> allies until there are enough cards, and deal the first 200 — never more
> than 2 copies of a card."

### Hard constraints from the project owner

1. **No uniformly-random tide selection in the shipped path.** Every tide
   that joins a pool must be justified by a published relationship: the
   Dreamcaller's tide pool (for the lead) or the lead's allied-tides list
   (for the fill). Randomness may only choose *among* those published lists.
2. **`data/buildaround_support.json` may be used exactly once, as a seed
   input** to the initial generation of tide relationships (e.g. to verify or
   repair ally lists so payoff themes are supported). After that, tide
   relationships are **manually curated data owned by a human**. There must
   be NO ongoing dependency: the runtime must never read
   `buildaround_support.json`; the routine re-bake path must not require it;
   nothing may force that file to be maintained at a production quality bar.
3. Cards in committed data files are identified by **cards_v2 UUID, never by
   name** (names may appear as informational fields refreshed at bake time).
4. Per `AGENTS.md`: commit with detailed descriptions and push immediately;
   never write tests that assert specific contents of TOML or baked design
   data (test structure and invariants only); documentation describes the
   current system, never removed behaviour ("X no longer..." is forbidden).

## 4. Design

### 4.1 Two artifacts: generated decklists, curated relationships

Split the data so the one-off seeding and the permanent manual ownership have
clean boundaries:

- **`data/tides.jsonc`** (exists) — the 32 tide decklists. Generated by
  `npm run bake-tides`; regenerating it is a deliberate, infrequent act (e.g.
  when a large batch of new draft records lands). Schema:
  `src/draft/pool/tides-io.ts` (`TideDecksJson`). Keep the
  `favoredTidesByDreamcaller` field it currently carries for backward
  compatibility during the transition, or remove it once relationships move
  to the new file (preferred — one source of truth).
- **`data/tide_relationships.jsonc`** (new) — the curated relationship data:

  ```jsonc
  {
    "version": 1,
    // Per tide: ordered allied-tide ids, best ally first. The runtime fills
    // pools from this list. 4-6 allies each is enough (a pool uses 1-3).
    "alliesByTide": { "tide-01": ["tide-07", "tide-27", ...], ... },
    // Per Dreamcaller UUID: the tide pool its lead tide is drawn from
    // (~8-10 ids). EVERY Dreamcaller gets an entry, including neutral ones.
    "tidePoolByDreamcaller": { "<dreamcaller-uuid>": ["tide-11", ...], ... }
  }
  ```

  Seeded ONCE by a new script (4.2), then **hand-edited and never
  overwritten by tooling**. The seeding script must refuse to overwrite an
  existing file unless passed `--force`, and the routine bake
  (`npm run bake-tides`) must not touch it.

Both files are served to the browser via `scripts/setup-assets.mjs` (copy the
existing `tides.jsonc → public/tides-data.json` block; strip comments). Add
`public/tide-relationships-data.json` to `.gitignore` like the other served
assets.

### 4.2 One-off seeding script: `scripts/seed-tide-relationships.mjs`

This is the only place `buildaround_support.json` may be read, and it is run
once (and re-run only on a deliberate decklist re-bake, which invalidates
curation anyway — see 6.3).

1. **Allies**: for each tide, rank the other 31 by cosine similarity between
   tide card-multiset vectors (reuse the pattern in Appendix A; or
   IDF-weighted cosine via `idfCorpus`/`idfCosine` from
   `src/draft/pool/index.ts` — try both, keep whichever scores better on the
   metric gates). Take the top ~6.
2. **Buildaround-informed repair (the one-off use)**: for each tide as lead,
   form the pool "lead + allies in order until ≥200 dealable copies" and
   compute, per theme in `buildaround_support.json`, the support share and
   the payoffs present (`needs` / `supports` fields; cards keyed by UUID,
   matching tide card ids directly). If the pool contains a payoff whose
   needed theme is under ~`0.35 × tier target` (the trap threshold in the
   metric, default tiers 10%/18%/25% of pool size), repair by promoting an
   ally that carries that theme's support into the joined range (swap within
   the top-6, or substitute the best supporting tide from rank 7-12). Log
   every repair with a human-readable reason — this log is the starting point
   for manual curation.
3. **Dreamcaller tide pools**: for the 20 signatured Dreamcallers, seed with
   the top ~8 tides by signature-probe IDF-cosine (this code exists in
   `scripts/bake-tides.mjs`, `probeTideCosine`; signatures are card *names*
   from `public/dreamcallers-v2-data.json`, ~20 of 32 have them). For the 12
   neutral Dreamcallers, seed a ~10-tide pool by farthest-point sampling over
   the tide similarity matrix (a diverse, representative spread), so neutral
   pools draw from a published list rather than "all 32". Different neutral
   Dreamcallers should get different (overlapping is fine) pools so they have
   personality — e.g. rotate the sampling start point per Dreamcaller index.
4. Write `data/tide_relationships.jsonc` with a provenance comment header
   stating it was seeded by this script on the current corpus and is
   thereafter manually curated. Print summary stats (ally overlap, repair
   count, per-theme coverage of leads).

### 4.3 Runtime change: `src/draft/pool/variant-tides.ts`

Current flow (keep): validate data presence → choose lead → join tides until
`dealable ≥ dealSize` (counting copies under the 2-copy cap) → one
Fisher-Yates shuffle of the bag → deal. Change only the selection:

- **Lead**: shuffle a copy of the Dreamcaller's `tidePoolByDreamcaller` entry
  and take the first id. A missing entry (unknown id, stale data) falls back
  to a shuffled draw over all tides — keep this fallback for robustness but
  it should never fire in production (validation should flag missing
  Dreamcaller entries at load time as a warning).
- **Fill**: walk the lead's `alliesByTide` list. For run-to-run variety,
  shuffle the ally list *lightly* (e.g. shuffle the top 6 and join in that
  order) rather than always joining in baked order — measure both; if
  always-in-order scores fine on per-Dreamcaller pool variety (the
  within-algorithm Jaccard baseline in the similarity script shows this),
  prefer it for simplicity. If allies are exhausted before the pool is full
  (possible with small tides), continue with the *allies' allies* (breadth-
  first through `alliesByTide`) — still a published relationship, never a
  uniform-random draw.
- Plumb the relationships data exactly like the tide decks: new field
  `tideRelationships?` on `PoolData` (`src/draft/pool/types.ts`), a
  `loadTideRelationships()` in `src/data/cards-v2-database.ts`, gated fetch in
  `src/data/quest-content.ts` (`POOL_VARIANTS_NEEDING_TIDES` already exists),
  the same in `src/draft_test/DraftTestApp.tsx`, and direct file reads in
  `scripts/pool-metrics.mjs` (`loadContext`) and
  `scripts/tides-similarity-experiment.mjs` (`loadContext`). Follow the
  existing `tideDecks` plumbing line-for-line; it was built as the template.
- Schema/validation: new `tide-relationships-io.ts` (mirror
  `src/draft/pool/tides-io.ts`): every ally id and every tide-pool id must
  name an existing tide; `alliesByTide` must cover every tide id; reject
  self-allies. The runtime throws via `missingPoolData("tides", ...)` when
  relationships are absent — no silent fallback (project convention).
- `selected` labels on the result already carry the joined tide ids; keep
  that (it is the debug surface).

The RNG contract: `generatePoolFromData` seeds mulberry32 from
`hash(questSeed:dreamcallerId)`; all draws must come from the passed `rng` in
a fixed call order so pools stay reproducible per (seed, Dreamcaller).

### 4.4 Tuning dials (expect to iterate)

In the variant: number of allies shuffled into the join order. In the seeder:
ally count, repair aggressiveness, Dreamcaller pool width (wider = more
per-Dreamcaller variety, narrower = stronger identity; the current baked
favored list is 4 wide with 1 drawn). In the existing bake (only if needed —
prefer not to re-bake decklists): `tideSize` 160, `doubleShare` 0.35,
`minClusterMembers` 6, all in the `TUNING` block of `scripts/bake-tides.mjs`.

## 5. Implementation order

1. `tide-relationships-io.ts` schema + validation + unit tests (structural
   invariants only — synthetic data, never assertions on the committed
   artifact's contents).
2. `scripts/seed-tide-relationships.mjs` + `package.json` script
   (`seed-tide-relationships`). Run it; commit `data/tide_relationships.jsonc`
   and the repair log summary in the commit message.
3. Runtime: `variant-tides.ts` selection change + plumbing (4.3) + test
   updates. The existing tests in `src/draft/pool/variant-tides.test.ts`
   cover determinism, deal size/cap, favored-presence, missing-data throw,
   UUID mapping — port them to the new selection (lead-from-pool presence,
   ally-only fill, breadth-first fallback).
4. Update the rendered doc: `bake-tides.mjs`'s `renderMarkdown` (or a small
   separate renderer reading both files) should add each tide's allied tides
   and each Dreamcaller's tide pool to `docs/cards2/tide_decklists.md` — the
   player-facing "you can go read it" artifact must show the relationships,
   since they are now part of the algorithm's story. Also update the
   one-sentence story in `variant-tides.ts`'s header comment, the `HEADER`
   in `bake-tides.mjs`, and `docs/quest_prototype/url_parameters.md`
   (`algo=tides` bullet).
5. Measure, iterate dials (4.4), lock.

## 6. Verification gates

### 6.1 Mechanical

```bash
npm install                # fresh worktree only
npm run setup-assets       # builds public/ inputs; copies served artifacts
npm run lint && npm run typecheck && npm test
node scripts/seed-tide-relationships.mjs --force   # determinism: run twice, diff output
```

### 6.2 Metric gates (the actual acceptance criteria)

```bash
npm run tides-similarity -- --seeds 100
npm run pool-metrics -- --variant tides --seeds 200                    # adequacy
npm run pool-metrics -- --variant tides --seeds 200 --metric traps
npm run pool-metrics -- --variant tides --seeds 100 --metric diversity
# and the same three with --variant idf3 for the side-by-side
```

Targets (idf3 reference values at these seed counts: adequacy 92.9, traps
2.49/pool, diversity 94.4 with theme evenness 90 and survivors 16%):

- Similarity: normalized headline ≥ 95 (it is 97.0 today; the ally fill
  should not regress it below idf3's own noise band).
- Adequacy ≥ 93 (i.e. ≥ idf3 — the repair pass should buy a point or more).
- Traps ≤ 2.4/pool (< idf3 — same reasoning).
- Diversity ≥ 92, with survivors buildable ≥ 10% and no standalone theme
  (survivors, spirit-animals, discard, warriors, abandon) under 8%.
- Shape: mean pool copies 200; distinct cards trending toward idf3's ~135
  (ally overlap should pull the current 162 down naturally).
- Per-Dreamcaller variety: the similarity script's within-algorithm
  best-match Jaccard for tides should stay below ~0.85 (pools must not
  become near-identical run to run for a given Dreamcaller).

If a gate fails, iterate the dials in 4.4; the diagnostic in Appendix A
(adapted to the new selection) is the fast way to see *why* a theme misses
the threshold before paying for a full metric run.

### 6.3 The independence caveat (report this honestly)

After step 2, adequacy/traps are no longer fully independent validation —
the seeder used the same metadata to repair ally lists. State this in the
final report. The similarity metric and the diversity metric's
card-utilization half remain independent. This is the agreed, deliberate
trade: a one-off seed, after which the relationships file is human-owned.
Consequently: if `data/tides.jsonc` is ever re-baked (tide ids/contents
change), the relationships file must be re-seeded and re-curated — add a
validation that throws on dangling tide ids so a stale combination cannot
ship silently, and say so in both files' comment headers.

### 6.4 Browser QA

Per `AGENTS.md`: start a QA Vite server on a port other than 5173 (5174 was
occupied last time; 5179 worked: `npx vite --port 5179 --strictPort`,
record the PID, kill only that PID afterward — never a broad `pkill -f
vite`). Copy `.env` from the main checkout into the worktree first. Then with
`agent-browser` (`/opt/homebrew/bin/agent-browser`): open
`http://localhost:<port>/?algo=tides` → Create Game → pick a *signatured*
Dreamcaller (e.g. Rael or Kell Tarn) → close the starting-deck modal → enter
a Draft site → pick a card. Verify: 4-card offers render and advance; the
console log line `draft_pool_constructed` shows `"algo":"tides"` and
`poolSize` 200 (the console buffer may hold lines from other sessions —
match on the newest); zero console errors; screenshot the draft screen for
layout coherence. Repeat once with a neutral Dreamcaller (e.g. Threxan) to
exercise the neutral tide-pool path.

## 7. Domain gotchas (each of these cost time once)

- **Names vs UUIDs**: the pool pipeline is name-keyed in memory (decklists,
  `counts` maps, `resolvePool`); committed artifacts are UUID-keyed. The
  variant maps UUIDs → current names via `poolData.cardNameById` and skips
  unknown UUIDs. Dreamcaller `signatureCards` are NAMES; Dreamcaller `id` is
  a UUID and is threaded to strategies as `PoolGenerationRequest.dreamcallerId`.
- **"Tides" is an overloaded word**: legacy card metadata (`card.tides`,
  `cards_v2.tides.toml`, `TIDE_TO_ARCHETYPE`) is mechanic-archetype tagging
  and per `AGENTS.md` must be ignored entirely. Only "tide decks" /
  `TideDecksJson` relate to this work. `public/tides/` is an *images*
  directory — unrelated.
- **`dealable` accounting**: when deciding whether enough tides have joined,
  count copies under the 2-copy cap (`min(2, total copies of card across
  joined tides)`), not raw bag size — overlapping allies make these diverge
  by 50+ copies. The current `joinTide` closure does this correctly; keep it.
- **Determinism**: bake/seed scripts must use no randomness (sorted
  tie-breaks everywhere: score desc, then frequency desc, then id/name asc);
  runtime randomness only via the seeded `rng`. The bake was verified
  byte-identical across runs — keep that property for the seeder.
- **Public assets**: a fresh worktree has no `public/*-data.json`; run
  `npm run setup-assets` before anything that reads them. Served artifacts
  are gitignored; committed sources live in `data/*.jsonc` (JSONC = comment
  header over a JSON body; `stripJsonComments` from
  `scripts/lib/card-refs.mjs` parses them in node scripts).
- **Metric runtimes**: diversity at 100 seeds ≈ 1–2 min; adequacy/traps at
  200 seeds ≈ 2–4 min each; `--compare` runs all 17 registered variants and
  is slow — use `--variant tides` / `--variant idf3` individually while
  iterating.
- **The buildable threshold math**: standalone-theme "buildable" requires a
  payoff present AND support ≥18% of pool ≈ 36 copies — a tide that is 40%
  on-theme must be ≳45% of the pool to clear it alone. This is why lead
  concentration and ally coherence matter more than tide count.

## 8. Appendix A — the ally-fill diagnostic (read-only, ~seconds)

Reproduces the table in §2; adapt the fill rule to test new selection ideas
cheaply before full metric runs.

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const data = JSON.parse(strip(readFileSync('data/tides.jsonc','utf8')));
const meta = JSON.parse(readFileSync('data/buildaround_support.json','utf8'));
const byId = new Map(Object.entries(meta.cards));
const THEMES = ['survivors','spirit-animals','discard','warriors','abandon'];
const vec = new Map(data.tides.map(t => [t.id, new Map(t.cards.map(c => [c.id, c.copies]))]));
const norm = new Map(data.tides.map(t => { let s=0; for (const v of vec.get(t.id).values()) s+=v*v; return [t.id, Math.sqrt(s)]; }));
const cos = (a,b) => { let dot=0; const [va,vb]=[vec.get(a),vec.get(b)];
  const [sm,lg] = va.size<=vb.size?[va,vb]:[vb,va];
  for (const [c,v] of sm) { const w=lg.get(c); if (w) dot+=v*w; }
  return dot/(norm.get(a)*norm.get(b)); };
const copiesOf = id => data.tides.find(x=>x.id===id).cards.reduce((s,c)=>s+c.copies,0);
function shares(ids) {
  const counts = new Map();
  for (const id of ids) for (const c of data.tides.find(x=>x.id===id).cards)
    counts.set(c.id, Math.min(2,(counts.get(c.id)??0)+c.copies));
  let total=0; for (const v of counts.values()) total+=v;
  return Object.fromEntries(THEMES.map(th => { let sup=0;
    for (const [cid,v] of counts) if (byId.get(cid)?.supports?.includes(th)) sup+=v;
    return [th, sup/total]; }));
}
const wins = Object.fromEntries(THEMES.map(t=>[t,0]));
for (const lead of data.tides) {
  const ranked = data.tides.filter(t=>t.id!==lead.id)
    .map(t=>({id:t.id,s:cos(lead.id,t.id)})).sort((a,b)=>b.s-a.s);
  const chosen=[lead.id]; let d=copiesOf(lead.id);
  for (const r of ranked){ if (d>=200) break; chosen.push(r.id); d+=copiesOf(r.id); }
  const s = shares(chosen);
  for (const th of THEMES) if (s[th]>=0.18) wins[th]++;
}
console.log('leads (of 32) whose ally-filled pool clears 18%:', JSON.stringify(wins));
"
```

## 9. Out of scope / do NOT do

- Do not add `buildaround_support.json` reads to the runtime, to
  `bake-tides.mjs`, or to any path that runs routinely. The seeder is its
  only consumer, and only on explicit invocation.
- Do not change `DEFAULT_POOL_VARIANT` (currently `sigseed`); `tides` stays
  opt-in via `?algo=tides`.
- Do not increase the tide count past 32 in this iteration — §2 shows it is
  not the binding constraint, and 32 readable decklists is part of the
  product story. (A finer-grained 48-64-tide experiment composes with allies
  later if wanted.)
- Do not write tests that pin the contents of `data/tides.jsonc`,
  `data/tide_relationships.jsonc`, or any TOML — design data changes at any
  time; test invariants on synthetic fixtures only.
