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
`scripts/content-inventory.ts` ([§ Bead sizing](#bead-sizing)). The
inventory's `beads` list is the current planning projection. Filed native
beads' Entities, Areas, acceptance criteria, and dependency graph determine
execution scope. Read current inventory `entities` records by those explicit
UUIDs. A filed key identifies its original filing and scenario slug; current
positional keys do not determine its entities, Areas, or prerequisites.
Regeneration refreshes planning data; scope changes follow the native filing
and Areas procedures in [workflow](workflow.md#filing-a-phase).

The adopted native decomposition in [hv-umm2.606](evidence/parallelism/hv-umm2.606.md)
separates a semantic capability prerequisite, serialization for an exact shared
body, and the original task's full acceptance join. Preparation children
`hv-umm2.629`–`hv-umm2.644` deliver real mapping, cost, contract or Aspect
modules; the original tasks retain every filed UUID, recipe and final check.
Their complete native Areas govern each writer. Bare engine/fold hubs carry
full authority unless their native scope explicitly limits them to additive
entries or read-only inspection. Conditional candidates grant no current
write permission.

The capability tasks `hv-umm2.610`–`hv-umm2.628` have bounded public forms and
explicit consumer joins. The source-only cohorts `hv-umm2.124`, `.126`–`.129`,
`.132`, `.133` and `.179` retain all 37 original authoring UUIDs, private
scenarios and complete recipes; their engine/UI/shared QA/config consumers
are read-only. A proven missing capability becomes a separate prerequisite.
Native status and current claims determine dispatch, with D17 capacity applied
separately from dependency readiness.

The planning projection carries these edges:

- **Primitive edges.** A bead depends on the primitive bead that introduces
  each new primitive its entities need.
- **Pilot.** The three pilot beads (Starter, Tutorial, Nightmare, and
  Contemplation, plus the one primitive they need) validate the recipe. Every
  bead outside 5.6 that has no other planning edge depends on them; Phase 3.4,
  the Phase 2 gate, Phase 4.6, and Phase 4.7 precede the pilot.
- **Original full-acceptance joins:**
  - 5.3 Dreamwell beads also wait for Phase 4.7.
  - 5.6 journey beads wait only for 5.1 and Phase 4.1. Journey effects use
    their own registry (P8), so they run alongside the end of Phase 4.
  - 5.7a beads wait for the 5.6 bead that builds the transfiguration hook,
    and for the Phase 3 gate.
  - The **card checkpoint** waits for every 5.2 bead. Original 5.7 sweep
    acceptance and 5.7b foundation acceptance wait for it and every 5.7a
    bead; each original modification acceptance joins the full foundation.
    Preparation `.629` and contract children `.631`–`.639` use their own
    delivered APIs/body orders below, before those final validation joins.
  - The 5.8 design bead has no Phase 5 prerequisite. Each original 5.8 full
    implementation/acceptance joins the design, the card checkpoint and all
    5.4/5.5 beads. Aspect pair preparations `.640`–`.644` have their exact
    source prerequisites before those full joins. The sanity bead waits for
    the original implementation beads and Phase 7.1
    (its matrix uses the tournament runner). 5.8 adds the Apollyon decks to
    the frozen deck pool, and logs why.
  - 5.9 waits for every bead above; 5.10 waits for 5.9 and the Phase 4 gate.
- **Serialization edges** follow
  [workflow § Serialization edges](workflow.md#serialization-edges). The
  inventory lists them per bead (`serializedAfter`): a bead that changes an
  entity module or an engine logic file another bead also changes waits for
  the previous one. Appending to `primitives/index.ts`, `dsl/types.ts`,
  `dsl/builders.ts`, or `dsl/triggers.ts` is additive and needs no edge, and a
  scenario module needs no registration. Each engine primitive or DSL form newly introduced by a
  Phase 5 engine bead gets its own contract module. Existing coherent joint
  contracts cover coupled forms (`exhaust` in `awaken.contracts.ts`, `grant`
  in `cannot-be-targeted.contracts.ts`). Builders, journey hooks, and the
  journey-owned `typeRemap` use their owning paths rather than engine
  contract modules. Beads that change the same contract module carry a
  serialization edge.

Sessions claim dependency-ready native content beads in
[workflow selection order](workflow.md#selection-order), and several run at
once when several executor sessions run
([D43](decisions.md#d43-peer-executor-sessions)).
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

- **Primitive beads** introduce exactly one new primitive or DSL form, plus
  up to three entities that need only it. Newly introduced engine forms have
  synthetic contracts in
  `src/engine/effects/primitives/contracts/<primitive-kebab>.contracts.ts`;
  builder and journey forms use tests at their owning paths. They are
  core-review beads, as is any bead that introduces a new prompt kind.
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

1. **Dispatch.** A session claims the native bead, creates its worktree,
   and briefs a subagent with its filed Entities, Areas, acceptance criteria,
   and dependencies ([workflow](workflow.md#dispatch)). Read inventory
   `entities` records by each filed UUID to inspect the current catalog data.
   When `npm run bead:entities -- <filed UUIDs>` lists a
   `requiredPrimitives.new` entry that neither the bead itself introduces nor
   a closed prerequisite supplies, the session stops before dispatch and
   records the missing primitive in the bead notes.
   Before writing the brief, match each entity's printed text against the
   mechanic families below. For every listed file the bead's `Areas:` line
   does not already cover, add it with
   [serialization edges](workflow.md#serialization-edges) against unfinished
   beads whose Areas name it, unless an in-progress bead holds it
   non-additively, in which case the bead waits behind that one. Record the
   check, matches or none, in the bead notes. These files stay out of
   `engine hubs` because their edits change logic, not registration entries.

   This routing is an inspection/admission audit. The adopted source-only
   cohorts' excluded engine/UI bodies remain read-only; the table grants no
   permission to reacquire them. A proven capability gap is a separately
   bounded native prerequisite with exact Areas and serialization before any
   source write. Other proposed behavioral additions require fresh explicit
   native admission; a foreign active owner is preserved.

   | Mechanic family in the printed text | Files it routes through |
   | --- | --- |
   | A granted or changed cost, or a new way to play a card (from the void, a hand, the deck, for a different cost) | `src/engine/rules/timing.ts` (`routeCosts`, `playRoutes`), `src/engine/steps/kinds/play.ts`, `src/engine/rules/legality.ts` |
   | A card entering or leaving a zone, or the stack, with an announcement or a remembered move | `src/engine/rules/zones.ts` (`relocate`), `src/engine/rules/stack.ts` |
   | A number read from the board (counts, bounds on spark or cost, "for each") | `src/engine/dsl/selectors.ts`, `src/engine/dsl/values.ts`, `src/engine/effects/interpreter.ts`, `src/engine/continuous/layers.ts` |
   | A condition ("if", "unless", "while", an intervening "if you control") | `src/engine/dsl/conditions.ts` (`conditionHoldsWith`); resolving wrapper: `src/engine/effects/interpreter.ts` (`conditionHolds`); static reader: `src/engine/continuous/layers.ts` |
   | A continuous grant or permission ("gains", "can", "until end of turn") | `src/engine/continuous/layers.ts`, `src/engine/rules/floating.ts`, `src/rules/battle/fold.ts` |
   | A void or pile card that shows a new status or play affordance | `src/cumulus/components/card/CardChoiceGrid.tsx`, `src/cumulus/components/battle/CardPile.tsx`, `src/cumulus/screens/MobileBattleScreen.tsx` (`SideZones`) |

2. **Author the abilities** in each entity's content module, plus the
   amplified variant wherever `amplifiedText` is present. The printed text is
   canonical (D5): read it clause by clause and check that every clause is
   implemented. Replace `pending: true` with the abilities and set
   `verifiedText`.
3. **Add the primitive** a primitive bead introduces. For a newly introduced
   engine primitive or DSL form, write synthetic engine contracts in
   `src/engine/effects/primitives/contracts/<primitive-kebab>.contracts.ts`
   (the introduced form name in kebab case). Builder forms, journey hooks,
   and `typeRemap` use tests at their owning paths.
   `contracts.test.ts` eagerly discovers the plain engine contract modules
   through `import.meta.glob`; a new engine form needs only its contract
   module. Modules use real engine code and synthetic fixtures and do not
   call `vi.mock` or `vi.doMock`: the shared runner is not a module-mock
   isolation boundary. Preserve coherent contracts under 500 lines, with
   small shared synthetic fixtures when needed. A cost primitive, a new
   cost change mode, or a new play route adds its rows to the cost-composition
   table in `cost-composition.contracts.ts`, whose mode and route tables are
   exhaustive over `CardCostMode`, its player cost change shapes, and
   `PlayRoute`, with expected payments derived from the settled rulings. Run
   `npm test -- src/engine/effects/primitives/contracts.test.ts`.
   When the inventory marks the bead's capability `pending`, the bead runs
   `npx tsx scripts/content-inventory.ts` and retires or corrects that marker
   in `scripts/content-inventory.ts` in its own commit, with the regenerated
   `content-inventory.json`.
   The registry index is the catalog (Phase 3.4). Every primitive bead, and
   every bead that introduces a prompt kind or floating change kind, takes the
   [`registration hubs`](workflow.md#hub-areas) area with `engine hubs`,
   whatever the inventory predicts about its event and prompt kinds. It
   grants these additive registration entries without widening and without
   serialization edges; any other edit to these files needs its own area and
   edges:
   - every primitive: its getter in `src/engine/effects/registry.ts`, whose
     `satisfies` clause makes a missing one a type error;
   - every new engine event kind: its `EVENT_PRESENTATION` entry in
     `src/battle/components/presentation-items.ts`, its fixture in
     `src/engine/testing/prompt-lab.ts` (the tooling test checks every event
     kind has one), and its battle-log line in
     `src/runtime/battle-prompt-messages.ts` or, for a kind with no line, its
     reasoned `UNLOGGED` entry in
     `src/screens/cumulus_adapters/engine-battle-presentation.test.ts`;
   - every new keyword or card status: its badge copy in
     `src/runtime/battle-prompt-messages.ts`, and for a status its
     `CARD_STATUS_BADGES` entry in
     `src/screens/cumulus_adapters/engine-battle-view-model.ts`;
   - every new floating change kind: its saved-state validator in
     `FLOATING_CHANGE_VALIDATORS` in `src/rules/battle/fold.ts`, its `LAYER`
     entry in `src/engine/continuous/layers.ts` when it is continuous, its
     status copy and `effectStarted` log line in
     `src/runtime/battle-prompt-messages.ts`, and its duration badge in
     `engineStatuses` in
     `src/screens/cumulus_adapters/engine-battle-view-model.ts`. Both tables
     require every kind in their respective unions. A continuous kind made
     only by static abilities, such as `reclaimNotBanished`, has an explicit
     rejecting saved-floating validator;
   - every new prompt role: its UI copy in
     `src/runtime/battle-prompt-messages.ts`, its exhaustive Greedy strategy in
     `src/engine/policy/prompts.ts`, a reachable synthetic fixture in
     `src/engine/testing/prompt-lab.ts`, its candidate routing in
     `src/screens/cumulus_adapters/prompt-host-view-model.ts`, and the exhaustive
     role expectation in `src/screens/cumulus_adapters/engine-battle-view-model.test.ts`.

   Type errors and the presentation completeness tests
   (`src/screens/cumulus_adapters/engine-battle-presentation.test.ts`)
   fail on an event kind with no presentation entry, or with no log line
   unless the test's unlogged list gives the reason, and on a keyword or
   status flag with no badge. A primitive that moves, creates, or removes a
   card, changes its status, or begins or ends an effect without an event
   naming it fails the announced-change invariant
   (`src/engine/testing/announced-changes.ts`) in the prompt-lab tooling
   test and in every fuzz game, the step 6 smoke included.
   The prompt-surface completeness check in
   `src/screens/cumulus_adapters/engine-battle-view-model.test.ts` requires a lab
   fixture for every `PromptRole` and every offered card on a visible answer
   surface: the gallery, the viewer's hand, the battlefield, or the stack.
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
   **one scenario module**, `src/content/specs/<bead-key>.scenarios.ts`,
   using the scenario path in the filed bead's Areas and description and its
   original filing key as the slug. These filed identifiers determine the
   module path even when the current planning projection groups entities
   differently. The module is plain rather than a test file (D19). A bead
   with no specs adds no module.
   - **Export:** a default export `{ slug: "<bead-key>", scenarios: [...] }
     satisfies ScenarioModule`. Each scenario is a `NamedScenario`: a `name`
     that starts with the subject entity's UUID, a `spec` for `runScenario`,
     and a `check` that asserts on the result with vitest's `expect`. Both
     types come from `src/engine/testing/scenario.ts`.
   - **Discovery:** `src/content/specs/index.ts` finds every
     `<bead-key>.scenarios.ts` module by `import.meta.glob`, in slug order;
     a bead adds its module file and edits no shared list.
   - **Run:** `npm test -- src/content/specs/specs.test.ts`. That one test
     file runs every discovered scenario as its own case, named
     `<bead-key> > <scenario name>`, on the content catalog plus the
     synthetic cards, in the `node` environment. Its registry case fails on
     a module whose slug is not its file name, a slug used twice, a module
     with no scenarios, or a scenario name used twice.
6. **Fuzz smoke:** `npm run fuzz:engine -- --games 300 --weight-uuids <bead entities>`.
   Decks are biased to include the bead's entities, and every game checks
   determinization fidelity on the states it reaches (engine-design
   § Testing layers). It is heavy (D17).
7. **Preflight and sweep** the bead's entities in the card-lab. First run
   `npm run lab:preflight -- --cards <entity uuids>` in Node to catch fixture
   staging and engine resolution failures before starting a browser. Use the
   same `--variants` and `--as` options for a focused preflight and sweep.
   Then run the browser sweep on the bead's port:
   `node scripts/qa/card-sweep.mjs --bead <id> --cards <entity uuids>`,
   with the bead's entity UUIDs comma-separated. Its defaults cover every
   variant the card can take, base and amplified among them, `as=player` and
   `as=enemy`. Every `fail` is fixed and re-swept.
8. **Judged QA** per D21, by the implementing subagent or a QA subagent:
   Paste `npm run bead:entities -- <filed UUIDs>` output into the brief to identify each entity and its D21 sample.
   - every entity that introduces a new prompt kind, status indicator, or
     visual effect;
   - plus the D21 10% sample, drawn per entity so it holds across small
     beads: an entity is sampled when the first byte of the SHA-256 of its
     UUID is below 26.

   Record the verdicts in `docs/plan/evidence/qa-ledger/<bead-id>.jsonl`.

   A judged fail whose cause lies outside the content bead's areas (a
   battle-log line, a presentation item, a status badge, or a board marker)
   does not widen the bead. The session files a fix bead for it, dispatched
   next, and the content bead lands with its fail line, whose notes name the
   fix bead. The fix bead re-judges the entity and records the verdict in
   its own QA ledger.
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
entity modules, the new form's module and its engine contract module when
applicable, the scenario module and `specs/index.ts`, `engine hubs` and
`registration hubs` for primitive beads and beads that introduce a prompt
kind, and the fallout areas its
[fallout listing](workflow.md#listing-fallout-before-dispatch) calls for.

Bead 5.1b (`hv-umm2.48`) materializes the planning projection as native
beads under the Phase 5 epic: one bead per planned bead record, with explicit
entity UUIDs, Areas, acceptance criteria, planning and serialization edges.
Each serialization edge is recorded in the dependent bead's notes. Titles
and metadata carry the original inventory key, also used for the scenario
slug. Execution follows the filed native scope and dependency graph. For a
filed bead, look up the inventory's `entities` by its explicit UUIDs; a
current `beads` record with the same key is a planning record, not its scope.

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

`hv-umm2.630` prepares the activated-cost implementation after its actual
cost/source prerequisites. Original `hv-umm2.275` owns Attuned
(`22adf539-d2c9-4f33-9416-159d03a220ad`) and Perfected
(`980d283a-9558-4b66-84a0-fcb91fdf4ceb`) composition and complete acceptance.
`hv-umm2.276` owns the shared transform dispatcher, catalog/loader and fuzz
bodies for its six exact glossary UUIDs. `hv-umm2.277` owns the unique
Resonant module (`f40df441-0e44-4122-b4d4-cdc4085a9ffb`) and additive
registration after that foundation. Perfected follows both 276 and 277;
Kindled belongs to 276 (`f0ff63b4-424b-4ae9-81d5-a4f6546afa3f`). All original
journey, eligibility, text, transform-contract and sweep joins remain.

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

Preparation `hv-umm2.629` owns the exhaustive mapping, real card-lab `&mods`
transport and random-mod fuzz preparation. Its production consumer is
`qa-scenes.ts::resolveCardLab`/`cardLabDeckEntry`: existing journey `DeckEntry`
fields pass through `engineDeckEntry` into `CardLabRequest.entry` and the real
fixture. A mapping used only by tests does not satisfy acceptance. Its
`lab-solver.ts` candidate is non-writable; an actual need requires precise
native admission and serialization after `hv-umm2.484`/`.471` before writes.
The existing shared-body orders apply; preparation does not inherit the
card checkpoint as a semantic prerequisite.

Original foundation `hv-umm2.279` retains every original prerequisite,
including `hv-umm2.210` and `.275`–`.277`, and its full stacking, real-content,
fuzz and lab acceptance. The card checkpoint `.210` follows `.629` solely for
the shared sweep-option bodies, retaining all of its full card checks.
`hv-umm2.631`–`.639` author nine unique public synthetic contract modules,
joined respectively by originals `.280`–`.288`. Those originals retain their
complete UUID/recipe/rules/sweep/journey acceptance and read delivered modules;
substantive repairs require their own precise writer authority and ordering.

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

For next-battle effects (`hv-umm2.286`–`.288`), the 20 eligible UUID sample on
**each** controller is mapped through the specific opening-hand, starting-energy
or smaller-hand DTO into controlled real battle initialization. Verify deal,
payment, lifetime and consumption on those physical entries. This sample is
additional to the genuine encounter-to-battle workflow and one judgment per
kind; a globally applied DTO does not replace either controller's sample.

### 5.8 Apollyon incarnations (D6)

The `apollyon-design` bead does steps 1, 3, and 4 and designs all ten
incarnations together, so the set stays coherent. Five implementation
beads each author two incarnations (step 2). The `apollyon-sanity` bead
does step 5.

Aspect preparations `hv-umm2.640`–`.644` own five separate AbilityList pair
modules and their public synthetic contracts. Originals `hv-umm2.290`–`.294`
consume them through exact map-entry values/additive imports, retain all ten
original incarnation UUIDs, and author their recipes/Dreamsign choices and
complete acceptance. Pair `.644` waits for physical triggering-card spark
`hv-umm2.611`; source signatures alone do not certify emblem behavior.
All card-checkpoint, full Avatar/Dreamsign, random-fill and Starter barriers
remain, including 20 Greedy games **per incarnation**. `hv-umm2.295` keeps
50 games per incarnation, the frozen pool, `hv-fy5h.2` and the Phase 7 champion
rerun. The audited pool union is an overapproximation of reachability.

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
