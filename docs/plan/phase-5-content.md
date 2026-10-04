# Phase 5: Content

**Goal:** every catalog entity behaves as printed. That covers:

- 521 cards and their 244 amplified variants;
- 33 Dreamwell cards;
- the figment catalog;
- 32 avatars;
- 153 dreamsigns (battle and journey effects);
- Nightmare;
- all eight transfigurations;
- Apollyon's ten incarnations (designed new; D6).

No content entry is left `pending`; every one has abilities or `vanilla: true`.

**Read first:**

- [engine-design § Ability DSL](engine-design.md#ability-dsl-and-content-modules), plus
  [§ Transfigurations](engine-design.md#transfigurations) and
  [§ Content gates](engine-design.md#content-gates);
- [workflow § Card QA](workflow.md#card-qa-phases-47), plus
  [§ Rules ambiguity](workflow.md#rules-ambiguity-protocol) and
  [§ Card issues](workflow.md#card-issues-protocol);
- [D11, D12, D20, D21](decisions.md).

## Batch recipe

Every content batch bead follows these steps exactly.

1. **Claim** the bead and create its worktree.
2. **Author the abilities** in each entity's content module, plus the
   amplified variant wherever `amplifiedText` is present. Replace
   `pending: true` with the abilities and set `verifiedText`.
3. **Add primitives** the batch needs, each with primitive tests that use
   synthetic cards. Update the engine-design catalog table if the primitive is
   general.
4. **Resolve ambiguities** with the ladder. Write `docs/rules.md` text and
   entries in `docs/plan/evidence/rules-decisions.md`. Log card problems in
   `docs/plan/evidence/card-issues.md`.
5. **Write scenario specs** only for cards whose behavior exceeds the
   composition of their primitives (D20). Signs a card needs one: unusual
   targeting, interactions between its own abilities, functional zones, nth-in-turn
   counters, or replacement effects.
6. **Audit:** `npm run audit:abilities -- --uuids <batch>` must report zero
   unexplained mismatches. Explain an exception in
   `src/content/render-exceptions.ts` only when the wording difference is
   cosmetic.
7. **Fuzz smoke:** `npm run fuzz:engine -- --games 300 --weight-uuids <batch>`.
   Decks are biased to include the batch.
8. **Sweep** the batch in the card-lab:
   `node scripts/qa/card-sweep.mjs --bead <id>`. Cover the base and amplified
   variants, `as=player` and `as=enemy`. Every `fail` is fixed and re-swept.
9. **Judged QA** per D21:
   - every card that introduces a new prompt kind, status indicator, or visual
     effect;
   - plus a random 10% of the rest. Seed the pick with the bead ID so it is
     reproducible.

   Record the verdicts in the ledger.
10. **Validate.** Run `npm run review`. Then do one commit, submit the
    candidate, approve with `--wait`, and close the bead. The bead notes list:
    counts, new primitives, RD and card-issue IDs, sweep and judged totals.

**Batch size:** 15–30 entities. Split a batch whose definitions need more than
~3 new primitives.

## Tasks

### 5.1 Content inventory and batching

Write `scripts/content-inventory.mjs`. It emits
`docs/plan/evidence/content-inventory.json`, with one record per entity:

- UUID and kind;
- cost, speed, and subtype;
- printed and amplified text;
- mechanic tags, from regex rules over the text plus manual corrections kept
  in the script;
- required primitives;
- prompt kinds.

Cluster the entities into batches by mechanic family. Order the batches by
primitive dependency and frequency:

1. the Starter cards (10), the Tutorial card, and Nightmare;
2. vanilla and keyword-only bodies (Awakened, Vengeful, Veil, Offering,
   Ephemeral, Reclaim);
3. card flow: draw, discard, foresee, discover, erode, look-at-top
   distributions;
4. energy and points;
5. removal: dissolve, banish, abandon;
6. materialize and recursion: rematerialize, return, void recursion,
   Phasing;
7. figments and Legionnaire synergies;
8. spark, Support, anthems, and base-spark setting;
9. counters (⧗);
10. movement and position;
11. Prevent and other Interrupts;
12. copies (D15);
13. gain control;
14. cost modifiers and nth-in-turn triggers;
15. type and subtype synergies (Warriors, Spirit Animals, Survivors, …);
16. the remaining unique cards.

File one bead per batch, chained in that order. Then file the remaining
Phase 5 task beads (5.3–5.9) after the last card batch.

**Acceptance:**

- The inventory covers every catalog UUID exactly once.
- The batch beads are filed and chained.
- No batch exceeds 30 entities.

### 5.2 Card batches

Each batch follows the recipe. The first batch (Starter, Tutorial, Nightmare)
also validates the recipe end to end. Fix any tooling friction it reveals
before the second batch: the sweep, the audit, and the lab solver.

### 5.3 Dreamwell cards (33)

Port the behavior recorded from the deleted `dreamwell-effects-table` (see
Phase 4.7 notes) into abilities. Keep `energy_added` and the tier
construction rules from the Dreamwell content module exactly. Sweep through a card-lab
variant that forces the next Dreamwell draw.

### 5.4 Avatars (32)

Avatar abilities run as emblem abilities (P4). That includes ☾ activated
abilities with avatar exhaust, ❖/❖❖ speeds, first-turn triggers ("At the
start of your first turn…"), and once-per-turn. Respect opponent progression:
`ability_active_from_layer` in the opponents data module. The card-lab gains
`?goto=card-lab&avatar=<uuid>`.

### 5.5 Dreamsigns: battle effects

Every dreamsign ability that acts in battle, run as an emblem ability, in
batches by family. The card-lab gains `?goto=card-lab&dreamsign=<uuid>`.
Dreamsigns with both battle and journey text are split across 5.5 and 5.6.

### 5.6 Dreamsigns: journey effects (P8)

Build a typed journey-modifier registry keyed by dreamsign UUID, with hooks
consumed by the journey rules:

- essence gains, including site rewards and "20% of your essence";
- shop offers, pricing, restocks, and duplication of purchases;
- the Dream Bazaar;
- draft choice counts;
- purge permissions and payouts;
- duplication counts;
- transfiguration counts, plus random and forced transfigurations;
- site enhancement and site rerolls;
- essence-site alternatives (forgo essence → purge 2, or offer a dreamsign
  instead);
- pre- and post-battle purge or transfigure windows;
- "when you gain this dreamsign" one-shots.

New player choices use existing Cumulus patterns and plain English copy in
the UI copy module:

- Sickle's forgo option;
- Curled Tail's reroll;
- Scorpion's and Slug's purge windows;
- Green Slime's transfigure window.

Every modifier application is logged.

**Acceptance:**

- Each hook has contract tests on synthetic journeys.
- Browser QA covers each affected site type with a representative dreamsign,
  via `?goto=<site>` scenes plus a debug-granted dreamsign.
- Every journey-effect dreamsign is in the ledger, as judged or swept through
  the site.

### 5.7 Transfigurations

Build:

- the transforms and eligibility predicates for all eight types
  ([engine-design § Transfigurations](engine-design.md#transfigurations));
- the journey integration: the Transfiguration site, its home specialty, and
  the dreamsigns and exploration effects that transfigure;
- rendered modified text, using the existing tint presentation.

Tests: transform contract tests on synthetic definitions. Fuzz decks include
random transfigurations.

**Sweep sample:** the base and amplified forms of all cards are already swept
in the batches. For each of the other seven transfigurations, sweep at least
20 eligible cards, stratified across mechanic families, plus every
Resonant-eligible card. Then judge a sample of 3 per transfiguration.

### 5.8 Apollyon incarnations (D6)

1. **Extend the content type.** Extend the `ApollyonIncarnation` type in
   `src/content/apollyon/` with:
   - an Aspect ability, defined in the DSL as an emblem ability;
   - a deck recipe: a deck archetype bias plus up to 10 signature card UUIDs;
   - 1–2 dreamsign UUIDs.
2. **Author all ten incarnations** to fit their `description` and
   `deck_archetype`.
3. **Wire the boss battle init.** It uses the run's incarnation.
4. **Write the Apollyon section of `docs/design.md`** describing the
   implemented incarnations. Mark them **provisional** and list their design
   rationale.
5. **Sanity-check** with 50 Greedy-vs-Greedy games per incarnation against
   layer-6 decks. Record win rates in `docs/plan/evidence/ai/apollyon.md`.
   Phase 7 re-runs this with the champion.

### 5.9 Mason audit of the engine

Run `mason` over `src/engine/` and the fold and UI adapters. It files bounded
refactor beads (label `mason`) for:

- simplifications revealed by ~750 definitions;
- missing type constraints in the DSL;
- duplicated primitives;
- adapter leaks.

Chain the top-ranked beads, at most ~8, before the gate, and implement them.
The fuzz smoke and the coverage gate must stay green after each one. Chain
the rest after the Phase 7 report.

### 5.10 Phase gate

1. **Nothing pending:** no entry is `pending` and the coverage gate passes.
2. **Full re-sweep** of every card (base and amplified) on the final code, plus
   the transfiguration sample. This is automated; run it in ≤30-minute
   batches.
3. **Fuzz soak:** 10,000 games, full-pool random decks, random
   transfigurations, Random and Greedy policies. Zero violations.
4. **Journey playthrough** on desktop and mobile against Greedy, with real
   battles for at least three of the seven.
5. **Independent review:** the full diff of engine and primitives, plus a
   deterministic 10% sample of content definitions, listed for the reviewer.
6. Close the epic.

## Exit gate

- Every entity is implemented and gated.
- The ledger is complete per D21.
- The soak is clean.
- The card issues and RD entries are recorded.
- The review is resolved.
