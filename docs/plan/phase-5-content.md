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

Phase 5 runs as about 240 small beads planned by
`scripts/content-inventory.ts` ([§ Bead sizing](#bead-sizing)); the
inventory's `beads` list is the graph. Its edges:

- **Primitive edges.** A bead depends on the primitive bead that introduces
  each new primitive its entities need.
- **Pilot.** The three pilot beads (Starter, Tutorial, Nightmare, and
  Contemplation, plus the one primitive they need) validate the recipe. Every
  bead outside 5.6 that has no other planning edge depends on them; Phase 3.4,
  the Phase 2 gate, Phase 4.6, and Phase 4.7 precede the pilot.
- **Fixed task edges:**
  - 5.3 Dreamwell beads also wait for Phase 4.7.
  - 5.6 journey beads wait only for 5.1 and Phase 4.1. Journey effects use
    their own registry (P8), so they run alongside the end of Phase 4.
  - 5.7a beads wait for the 5.6 bead that builds the transfiguration hook,
    and for the Phase 3 gate.
  - The **card checkpoint** waits for every 5.2 bead. 5.7 (sweep sample) and
    the 5.7b foundation wait for it and for every 5.7a bead; each 5.7b
    modification bead waits for the foundation.
  - The 5.8 design bead has no Phase 5 prerequisite. Each 5.8 implementation
    bead waits for the design, the card checkpoint, and every 5.4 and 5.5
    bead; the sanity bead waits for the implementation beads and Phase 7.1
    (its matrix uses the tournament runner). 5.8 adds the Apollyon decks to
    the frozen deck pool, and logs why.
  - 5.9 waits for every bead above; 5.10 waits for 5.9 and the Phase 4 gate.
- **Serialization edges** follow
  [workflow § Serialization edges](workflow.md#serialization-edges). The
  inventory lists them per bead (`serializedAfter`): a bead that changes an
  entity module or an engine logic file another bead also changes waits for
  the previous one. Appending to `primitives/index.ts`, `dsl/types.ts`,
  `dsl/builders.ts`, `dsl/triggers.ts`, `specs/index.ts`, or a primitive
  group test file is additive and needs no edge.

Content beads are claimed in inventory order, and several run at once when
several executor sessions run ([D43](decisions.md#d43-peer-executor-sessions)).
Beads other than the serialized pairs touch disjoint entity modules, and new
primitives are new files under `effects/primitives/` (Phase 3.4), so each
bead builds on the landed primitives of the beads its edges name.
Registering a primitive, a DSL union member, or a scenario module is an
additive edit that needs no edge; beads that substantively change the same
engine logic file carry a
[serialization edge](workflow.md#serialization-edges).

## Bead sizing

In the decisions (D20, D21, and the card text clarifications), a "content
batch" is one Phase 5 content bead.

Phase 5 beads are sized like the rest of the run: about 30–60 minutes of
implementation each. The inventory plans three kinds:

- **Primitive beads** introduce exactly one new primitive or DSL form, with
  primitive tests on synthetic cards, plus up to three entities that need
  only it. They are core-review beads, as is any bead that introduces a new
  prompt kind.
- **Composition beads** implement 1–6 entities whose primitives all exist by
  the time the bead runs. Entities are ordered by mechanic family and tags,
  so similar entities share a bead.
- **Task beads** split the fixed tasks: the card checkpoint, 5.7, the 5.7b
  foundation and one bead per modification kind, and 5.8.

A bead's weight is the sum of its entities' weights: one unit, plus one per
120 characters of printed text, 0.4 for amplified text, and 0.2 for each tag
past the third. Composition beads stop at weight 9 or 6 entities. The
constants live in `scripts/content-inventory.ts`.

A composition bead whose entity needs a primitive the tags missed adds it
when the change is a small extension of an existing primitive, widening its
Areas line through the executing session. Otherwise the session files a
primitive bead, makes the composition bead depend on it, and moves on.

## Bead recipe

Every content bead follows these steps exactly. Primitive beads do step 3;
composition beads skip it.

1. **Dispatch.** A session claims the bead, creates its worktree, and
   briefs a subagent ([workflow](workflow.md#dispatch)).
2. **Author the abilities** in each entity's content module, plus the
   amplified variant wherever `amplifiedText` is present. The printed text is
   canonical (D5): read it clause by clause and check that every clause is
   implemented. Replace `pending: true` with the abilities and set
   `verifiedText`.
3. **Add the primitive** a primitive bead introduces, with primitive tests
   that use synthetic cards, in the primitive group's test file. The registry index
   is the catalog (Phase 3.4).
4. **Resolve ambiguities** with the ladder. Check the
   [card text clarifications](decisions.md#card-text-clarifications) first:
   an entity named there is implemented exactly as its C-entry says, and the
   notes cite it. Write `docs/rules.md` text and
   RD files under `docs/plan/evidence/rules-decisions/`. Log card problems in
   `docs/plan/evidence/card-issues/<uuid>--<bead-id>.md`.
5. **Write scenario specs** only for entities whose behavior exceeds the
   composition of their primitives (D20). Signs a card needs one: unusual
   targeting, interactions between its own abilities, functional zones,
   nth-in-turn counters, or replacement effects. All of a bead's specs go in
   **one scenario module**, `src/content/specs/<bead-key>.scenarios.ts` (the
   inventory's `scenarios` path), a plain module rather than a test file
   (D19). A bead with no specs adds no module.
   - **Export:** a default export `{ slug: "<bead-key>", scenarios: [...] }
     satisfies ScenarioModule`. Each scenario is a `NamedScenario`: a `name`
     that starts with the subject entity's UUID, a `spec` for `runScenario`,
     and a `check` that asserts on the result with vitest's `expect`. Both
     types come from `src/engine/testing/scenario.ts`.
   - **Registration:** in `src/content/specs/index.ts`, one default import,
     `import <beadKey> from "./<bead-key>.scenarios";`, and one entry in
     `SCENARIO_MODULES`, in slug order.
   - **Run:** `npm test -- src/content/specs/specs.test.ts`. That one test
     file runs every registered scenario as its own case, named
     `<bead-key> > <scenario name>`, on the content catalog plus the
     synthetic cards, in the `node` environment. Its registry case fails on
     a module file that is not registered, a slug registered twice, a module
     with no scenarios, or a scenario name used twice.
6. **Fuzz smoke:** `npm run fuzz:engine -- --games 300 --weight-uuids <bead entities>`.
   Decks are biased to include the bead's entities. It is heavy (D17).
7. **Sweep** the bead's entities in the card-lab, on the bead's port:
   `node scripts/qa/card-sweep.mjs --bead <id> --port <port>`. Cover the base
   and amplified variants, `as=player` and `as=enemy`. Every `fail` is fixed
   and re-swept.
8. **Judged QA** per D21, by the implementing subagent or a QA subagent:
   - every entity that introduces a new prompt kind, status indicator, or
     visual effect;
   - plus the D21 10% sample, drawn per entity so it holds across small
     beads: an entity is sampled when the first byte of the SHA-256 of its
     UUID is below 26.

   Record the verdicts in `docs/plan/evidence/qa-ledger/<bead-id>.jsonl`.
9. **Validate and commit.** Run `npm run review`, then make one commit with
   the bead's [friction file](workflow.md#friction-ledger). The session
   submits, approves without waiting, and closes the bead when it lands. The
   bead notes list:
   - counts;
   - new primitives;
   - RD and card-issue IDs;
   - sweep and judged totals.

## Tasks

### 5.1 Content inventory and bead plan

`scripts/content-inventory.ts` emits
`docs/plan/evidence/content-inventory.json`, with one record per entity:

- UUID and kind;
- cost, speed, and subtype;
- printed and amplified text;
- mechanic tags, from regex rules over the text plus manual corrections kept
  in the script;
- required primitives;
- prompt kinds.

Entities are grouped by mechanic family, in this order of primitive
dependency and frequency:

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

The inventory then plans the Phase 5 beads ([§ Bead sizing](#bead-sizing)),
family by family within each section, and lists each bead's key, kind,
entities, weight, introduced primitive, new prompt kinds, planning edges,
serialization edges, scenario module, and `Areas:` files. The Areas name the
entity modules, the new primitive's module and group test file, the
scenario module and `specs/index.ts`, `engine hubs` for primitive beads, and
the fallout areas its
[fallout listing](workflow.md#listing-fallout-before-dispatch) calls for.

Bead 5.1b (`hv-umm2.48`) files one bead per inventory record under the Phase
5 epic, with the inventory's edges, and records each serialization edge in
the dependent bead's notes. Bead titles carry the inventory key.

**Acceptance:**

- The inventory covers every catalog UUID exactly once.
- Every pending entity is routed to a bead; every primitive bead introduces
  exactly one primitive; no composition bead exceeds 6 entities.
- The planned graph has no cycles.

### 5.2 Card beads

Each card bead follows the recipe. The pilot beads (Starter, Tutorial,
Nightmare, and Contemplation) also validate the recipe end to end. Fix any
tooling friction they reveal before the beads that wait for them: the sweep,
the audit, and the lab solver.

The **card checkpoint** closes 5.2. It confirms that no card or figment is
`pending`, runs `npm run fuzz:engine -- --games 1000` over the full card pool,
and re-sweeps a stratified 10% of cards on the current code. Every `fail` it
finds is fixed in its own bead before the checkpoint closes.

This phase has the most beads, so it runs its
[retrospective](workflow.md#retrospectives) after every 25th closed bead
rather than every 10th. Each one also reviews the recipe itself: bead
weights, the sweep's wall time, judged-QA cost, lab overrides, primitives
that later beads keep reworking, and primitives the tags missed. Improvement
beads that change the recipe or its tooling get edges ahead of the beads
they affect.

### 5.3 Dreamwell cards (33)

Port the behavior recorded in `docs/plan/evidence/legacy-behavior.md`
(written in Phase 4.7) into abilities. The card beads that cover the prototype's
semantically automated cards read the same file. Keep `energy_added` and the tier
construction rules from the Dreamwell content module exactly. Sweep through a card-lab
variant that forces the next Dreamwell draw, added by the `dreamwell-lab`
bead that every other 5.3 bead waits for.

### 5.4 Avatars (32)

Avatar abilities run as emblem abilities (P4). That includes ☾ activated
abilities with avatar exhaust, ❖/❖❖ speeds, first-turn triggers ("At the
start of your first turn…"), and once-per-turn. Respect opponent progression:
`ability_active_from_layer` in the opponents data module. The card-lab gains
`?goto=card-lab&avatar=<uuid>`, added by the `avatar-lab` bead that every
other 5.4 bead waits for.

### 5.5 Dreamsigns: battle effects

Every dreamsign ability that acts in battle, run as an emblem ability, in
beads by family. Dreamsigns named in
[C2–C4, C10, C11, and C17](decisions.md#card-text-clarifications) follow those
entries. The card-lab gains `?goto=card-lab&dreamsign=<uuid>`, added by the
`dreamsign-lab` bead that every other 5.5 bead waits for.
Dreamsigns with both battle and journey text are split across 5.5 and 5.6;
a serialization edge orders the two beads that share the module.

### 5.6 Dreamsigns: journey effects (P8)

The `journey-registry` bead builds a typed journey-modifier registry keyed by
dreamsign UUID, with modifier logging; every other 5.6 bead waits for it.
Each hook is then one primitive bead, consumed by the journey rules:

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

The code half of 5.7, as a primitive bead for the activated-ability cost
modifier plus composition beads for the nine transforms. It runs as soon as
the engine and the 5.6 transfiguration hook are complete, ahead of most card
beads.

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

**Sweep sample** (5.7, after the card checkpoint): the base and amplified forms
of all cards are already swept in the card beads. For each of the other eight transfigurations, sweep at least
20 eligible cards, stratified across mechanic families, plus every
Resonant-eligible card. Then judge a sample of 3 per transfiguration.

### 5.7b Deck-entry modifications

Prove [D39](decisions.md#d39-deck-entry-modifications-and-next-battle-effects)
end to end. Phase 4.1 built the plumbing; this task proves behavior on real
content.

The `deck-mods-foundation` bead builds the exhaustive mapping, the card-lab
`&mods` parameter, and the fuzz deck modifications. Then one bead per
modification kind, each waiting for the foundation, adds that kind's
contract tests, rules decisions, sweep sample, and journey QA.

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

The `apollyon-design` bead does steps 1, 3, and 4 and designs all ten
incarnations together, so the set stays coherent. Five implementation
beads each author two incarnations (step 2). The `apollyon-sanity` bead
does step 5.

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
   confirm `release` contains every commit of the phase.
8. Close the epic.

## Exit gate

- Every entity is implemented and gated.
- The ledger is complete per D21.
- The soak is clean.
- The card issues and RD entries are recorded.
- Every mason bead filed this phase has landed.
- The retrospective's improvement beads have landed.
- The review is resolved.
