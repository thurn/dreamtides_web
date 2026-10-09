# Phase 5: Content

**Goal:** every catalog entity behaves as printed. That covers:

- 521 cards and their 244 amplified variants;
- 33 Dreamwell cards;
- the figment catalog;
- 32 avatars;
- 153 dreamsigns (battle and journey effects);
- Nightmare;
- all nine transfigurations ([F6](decisions.md#established-facts));
- exploration deck-entry modifications and next-battle effects
  ([D39](decisions.md#d39-deck-entry-modifications-and-next-battle-effects));
- Apollyon's ten incarnations (designed new; D6).

No content entry is left `pending`; every one has abilities or `vanilla: true`.

**Read first:**

- [engine-design § Ability DSL](engine-design.md#ability-dsl-and-content-modules), plus
  [§ Transfigurations](engine-design.md#transfigurations) and
  [§ Content gates](engine-design.md#content-gates);
- [workflow § Card QA](workflow.md#card-qa-phases-47), plus
  [§ Rules ambiguity](workflow.md#rules-ambiguity-protocol) and
  [§ Card issues](workflow.md#card-issues-protocol);
- [D11, D12, D19, D20, D21](decisions.md).

## Earliest start and task graph

Each task depends on the tasks listed after its arrow:

- 5.1 ← Phase 3.4 and the Phase 2 gate
- 5.6 ← 5.1, Phase 4.1 (C12 needs the deck-entry variant plumbing).
  Journey effects use their own registry (P8), so they run alongside the
  end of Phase 4.
- 5.7a ← 5.6, the Phase 3 gate. 5.6 owns the journey-modifier hooks; 5.7a
  wires the transforms into them.
- **Card batches** ← 5.1, the Phase 3 gate, Phase 4.6, Phase 4.7 (batches
  read `legacy-behavior.md`).
  - Every batch after the first also depends on batch 1, which validates the
    recipe.
  - Between later batches, add an edge only where a batch needs a primitive
    that an earlier batch introduces. The inventory derives these edges.
    Otherwise batches run in inventory order.
- 5.3 ← Phase 4.7, the energy-and-points batch
- 5.4 and 5.5 ← the batches that introduce the primitives they need, per the
  inventory
- 5.7 (sweep sample) and 5.7b ← 5.7a and every card batch
- 5.8 ← every card batch, 5.4, 5.5, Phase 7.1 (its sanity matrix uses the
  tournament runner). 5.8 adds the Apollyon decks to the frozen deck pool,
  and logs why.
- 5.9 ← every task above; 5.10 ← 5.9 and the Phase 4 gate

Content batches run one at a time, in inventory order
([D43](decisions.md#d43-orchestrated-sequential-execution)). Batches touch
disjoint entity modules, and new primitives are new files under
`effects/primitives/` (Phase 3.4), so each batch builds on the landed
primitives of the batches before it.

## Batch recipe

Every content batch bead follows these steps exactly.

1. **Dispatch.** The orchestrator claims the bead, creates its worktree, and
   briefs a subagent ([workflow](workflow.md#dispatch)).
2. **Author the abilities** in each entity's content module, plus the
   amplified variant wherever `amplifiedText` is present. The printed text is
   canonical (D5): read it clause by clause and check that every clause is
   implemented. Replace `pending: true` with the abilities and set
   `verifiedText`.
3. **Add primitives** the batch needs, each with primitive tests that use
   synthetic cards, in the primitive group's test file. The registry index
   is the catalog (Phase 3.4).
4. **Resolve ambiguities** with the ladder. Check the
   [card text clarifications](decisions.md#card-text-clarifications) first:
   an entity named there is implemented exactly as its C-entry says, and the
   notes cite it. Write `docs/rules.md` text and
   RD files under `docs/plan/evidence/rules-decisions/`. Log card problems in
   `docs/plan/evidence/card-issues/<uuid>--<bead-id>.md`.
5. **Write scenario specs** only for cards whose behavior exceeds the
   composition of their primitives (D20). Signs a card needs one: unusual
   targeting, interactions between its own abilities, functional zones,
   nth-in-turn counters, or replacement effects. All of a batch's specs go in
   **one file**, `src/content/specs/<batch-slug>.spec.ts`, in the `node`
   environment (D19).
6. **Fuzz smoke:** `npm run fuzz:engine -- --games 300 --weight-uuids <batch>`.
   Decks are biased to include the batch. It is heavy (D17).
7. **Sweep** the batch in the card-lab, on the bead's port:
   `node scripts/qa/card-sweep.mjs --bead <id> --port <port>`. Cover the base
   and amplified variants, `as=player` and `as=enemy`. Every `fail` is fixed
   and re-swept.
8. **Judged QA** per D21, by the implementing subagent or a QA subagent:
   - every card that introduces a new prompt kind, status indicator, or visual
     effect;
   - plus a random 10% of the rest. Seed the pick with the bead ID so it is
     reproducible.

   Record the verdicts in `docs/plan/evidence/qa-ledger/<bead-id>.jsonl`.
9. **Validate and commit.** Run `npm run review`, then make one commit with
   the batch's [friction file](workflow.md#friction-ledger). The orchestrator
   submits, approves without waiting, and closes the bead when it lands. The
   bead notes list:
   - counts;
   - new primitives;
   - RD and card-issue IDs;
   - sweep and judged totals.

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

1. the Starter cards (10), the Tutorial card, Nightmare, and Contemplation
   ([C1](decisions.md#c1-contemplation)), added here as new `Special` data;
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

When 5.1 lands, the orchestrator files one bead per batch from the inventory.
Each gets an `Areas:` line naming its entity modules, its new primitive
modules, its spec file, `engine hubs`, and the fallout areas its
[fallout listing](workflow.md#listing-fallout-before-dispatch) calls for. Add batch-to-batch
edges only where the inventory shows a primitive dependency. File the
remaining Phase 5 task beads (5.3–5.10, including 5.7a and 5.7b) with the
edges in the [task graph](#earliest-start-and-task-graph).

**Acceptance:**

- The inventory covers every catalog UUID exactly once.
- The inventory lists, for each batch, its entities, areas, and the batches
  whose primitives it needs, so the orchestrator can file the batches with
  their edges.
- No batch exceeds 30 entities.

### 5.2 Card batches

Each batch follows the recipe. The first batch (Starter, Tutorial, Nightmare)
also validates the recipe end to end. Fix any tooling friction it reveals
before the second batch: the sweep, the audit, and the lab solver.

This phase has the most beads, so its
[retrospectives](workflow.md#retrospectives) after every 10th bead also review
the recipe itself: batch size, the sweep's wall time, judged-QA cost, lab
overrides, and primitives that batches keep reworking. Improvement beads that
change the recipe or its tooling run before the next batch.

### 5.3 Dreamwell cards (33)

Port the behavior recorded in `docs/plan/evidence/legacy-behavior.md`
(written in Phase 4.7) into abilities. The batches that cover the prototype's
semantically automated cards read the same file. Keep `energy_added` and the tier
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
batches by family. Dreamsigns named in
[C2–C4, C10, C11, and C17](decisions.md#card-text-clarifications) follow those
entries. The card-lab gains `?goto=card-lab&dreamsign=<uuid>`.
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
- "when you gain this dreamsign" one-shots;
- the type remap of dreamsign `3d86f8ce-42ac-43dc-96d5-121e6d1a6167`
  ([C12](decisions.md#c12-the-type-remap-dreamsign-rewrites-selectors-and-figments)),
  stored with the run and applied to battle selectors and figment types
  through the deck-entry variant.

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

### 5.7a Transfiguration transforms

The code half of 5.7. It runs as soon as the engine is complete, ahead of the
card batches.

### 5.7 Transfigurations

5.7a builds:

- the transforms and eligibility predicates for all nine types
  ([engine-design § Transfigurations](engine-design.md#transfigurations));
- the journey integration: the Transfiguration site, its home specialty, and
  the dreamsigns and exploration effects that transfigure;
- displayed modified text, from the existing text transforms in
  `src/transfiguration/transfiguration-logic.ts` and the existing tint
  presentation (D5).

Tests: transform contract tests on synthetic definitions, plus a test that
the ability transforms and the text transforms agree on eligibility. Fuzz decks include
random transfigurations.

**Sweep sample** (5.7, after every card batch): the base and amplified forms
of all cards are already swept in the batches. For each of the other eight transfigurations, sweep at least
20 eligible cards, stratified across mechanic families, plus every
Resonant-eligible card. Then judge a sample of 3 per transfiguration.

### 5.7b Deck-entry modifications

Prove [D39](decisions.md#d39-deck-entry-modifications-and-next-battle-effects)
end to end. Phase 4.1 built the plumbing; this task proves behavior on real
content.

- **Exhaustive mapping.** Every exploration effect kind that changes a deck
  entry or the next battle maps to an engine `Variant` field or a
  `BattleInit` field. A TypeScript exhaustive switch over the exploration
  effect union enforces it, so a new effect kind fails `tsc`.
- **Contract tests** on synthetic definitions, one per modification kind:
  spark bonus, cost reduction, Fast, granted and overridden Reclaim, subtype
  change (including typal selectors and synergies), card-type change, and
  each stacked with a transfiguration in the prototype's order.
- **Rules decisions.** Settle the open interactions through the ladder, each
  with an RD entry: the spark of an Event turned into a Character, and a
  granted Reclaim on a card that already has one.
- **Fuzz.** Fuzz decks include random deck-entry modifications.
- **Card-lab.** Add `&mods=<encoded deckMods>` to the card-lab URL.
- **Sweep sample.** For each modification kind, sweep at least 20 eligible
  cards stratified across mechanic families, `as=player` and `as=enemy`.
  Judge one per kind.
- **Journey QA.** One browser check per next-battle effect: take the
  encounter through `?goto=exploration&card=<encounter card UUID>`, then confirm the
  battle starts with the effect applied. `__caps` is empty.

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

Run `mason` over `src/engine/`, `src/content/`, the journey-modifier
registry, and the fold and UI adapters. It files bounded
refactor beads (label `mason`) for:

- simplifications revealed by ~750 definitions;
- missing type constraints in the DSL;
- duplicated primitives;
- adapter leaks.

This is the phase's [mason pass](workflow.md#mason-passes). Chain every filed
bead before the gate and implement all of them. The fuzz smoke and the
coverage gate must stay green after each one.

### 5.10 Phase gate

1. **Nothing pending:** no entry is `pending` and the coverage gate passes.
2. **Full re-sweep** of every card (base and amplified) on the final code, plus
   the transfiguration and deck-modification samples. This is automated. Run
   it in ≤30-minute batches, split across two QA subagents on separate ports.
3. **Fuzz soak:** 10,000 games, full-pool random decks, random
   transfigurations, random deck-entry modifications, Random and Greedy
   policies. Zero violations.
4. **Journey playthrough** on desktop and mobile against Greedy, with real
   battles for at least three of the seven.
5. **Retrospective:** run the [phase retrospective](workflow.md#retrospectives)
   and land the beads it files.
6. **Independent review:** the full diff of engine and primitives, plus a
   deterministic 10% sample of content definitions, listed for the reviewer.
7. Update `metrics.md`, including the D19 suite budgets. In staged mode,
   confirm `release == staging`.
8. Close the epic.

## Exit gate

- Every entity is implemented and gated.
- The ledger is complete per D21.
- The soak is clean.
- The card issues and RD entries are recorded.
- Every mason bead filed this phase has landed.
- The retrospective's improvement beads have landed.
- The review is resolved.
