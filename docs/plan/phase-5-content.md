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
- [D11, D12, D20, D21](decisions.md).

## Batch recipe

Every content batch bead follows these steps exactly.

1. **Claim** the bead and create its worktree.
2. **Author the abilities** in each entity's content module, plus the
   amplified variant wherever `amplifiedText` is present. The printed text is
   canonical (D5): read it clause by clause and check that every clause is
   implemented. Replace `pending: true` with the abilities and set
   `verifiedText`.
3. **Add primitives** the batch needs, each with primitive tests that use
   synthetic cards. Update the engine-design catalog table if the primitive is
   general.
4. **Resolve ambiguities** with the ladder. Check the
   [card text clarifications](decisions.md#card-text-clarifications) first:
   an entity named there is implemented exactly as its C-entry says, and the
   notes cite it. Write `docs/rules.md` text and
   entries in `docs/plan/evidence/rules-decisions.md`. Log card problems in
   `docs/plan/evidence/card-issues.md`.
5. **Write scenario specs** only for cards whose behavior exceeds the
   composition of their primitives (D20). Signs a card needs one: unusual
   targeting, interactions between its own abilities, functional zones, nth-in-turn
   counters, or replacement effects.
6. **Fuzz smoke:** `npm run fuzz:engine -- --games 300 --weight-uuids <batch>`.
   Decks are biased to include the batch.
7. **Sweep** the batch in the card-lab:
   `node scripts/qa/card-sweep.mjs --bead <id>`. Cover the base and amplified
   variants, `as=player` and `as=enemy`. Every `fail` is fixed and re-swept.
8. **Judged QA** per D21:
   - every card that introduces a new prompt kind, status indicator, or visual
     effect;
   - plus a random 10% of the rest. Seed the pick with the bead ID so it is
     reproducible.

   Record the verdicts in the ledger.
9. **Validate.** Run `npm run review`. Then do one commit, submit the
    candidate, approve with `--wait`, and close the bead. The bead notes list:
    counts, new primitives, RD and card-issue IDs, sweep and judged totals.
    The commit includes the batch's
    [friction ledger](workflow.md#friction-ledger) line.

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

File one bead per batch, chained in that order. Then file the remaining
Phase 5 task beads (5.3–5.10, including 5.7b) after the last card batch.

**Acceptance:**

- The inventory covers every catalog UUID exactly once.
- The batch beads are filed and chained.
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

### 5.7 Transfigurations

Build:

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

**Sweep sample:** the base and amplified forms of all cards are already swept
in the batches. For each of the other eight transfigurations, sweep at least
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
   the transfiguration and deck-modification samples. This is automated; run it in ≤30-minute
   batches.
3. **Fuzz soak:** 10,000 games, full-pool random decks, random
   transfigurations, random deck-entry modifications, Random and Greedy
   policies. Zero violations.
4. **Journey playthrough** on desktop and mobile against Greedy, with real
   battles for at least three of the seven.
5. **Retrospective:** run the [phase retrospective](workflow.md#retrospectives)
   and land the beads it files.
6. **Independent review:** the full diff of engine and primitives, plus a
   deterministic 10% sample of content definitions, listed for the reviewer.
7. Close the epic.

## Exit gate

- Every entity is implemented and gated.
- The ledger is complete per D21.
- The soak is clean.
- The card issues and RD entries are recorded.
- Every mason bead filed this phase has landed.
- The retrospective's improvement beads have landed.
- The review is resolved.
