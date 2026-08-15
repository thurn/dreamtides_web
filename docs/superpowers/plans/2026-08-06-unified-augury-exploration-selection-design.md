# Unified Reward Selection for Augury and Exploration

Status: Proposed

Audience: Journey gameplay, content, UI, data tooling, and QA contributors

## Summary

Augury and Exploration both construct rewards from the same journey state.
They grant cards, present drafts, modify deck entries, purge cards, duplicate
cards, and award Dreamsigns. Augury uses a corpus-informed generator to rank
and sample good targets. Exploration implements similar target generation in
its provider with independent uniform shuffles and effect-specific branches.

This design establishes one shared reward-selection core for both sites. The
core owns candidate construction, scoring, ranked-band sampling, deterministic
randomness, eligibility, selection traces, and common reward payloads. Augury
and Exploration retain their different encounter structures, authored prose,
choice presentation, animations, and completion flows.

The central product decision is that selection intelligence is invisible to
players. Players see concrete cards, Dreamsigns, transfigurations, and choices.
They do not see fitness scores, quality scores, misfit labels, ranking bands,
or claims that the game selected something because an algorithm considers it
good. The intended experience is that the game consistently presents useful,
interesting outcomes without explaining its internal judgment.

Templates describe mechanically and visibly distinct offers. Selection policy
is separate, non-player-facing metadata. Two rewards that both appear as
“Gain CARDNAME” use one player-facing template even when a target is
selected
by deck fit and another by a fit-and-quality blend.

The Augury add-site reward draws from exactly four site types: Shop, Purge,
Transfiguration, and Duplication. Card rewards are granted as cards, and
Essence rewards are granted as Essence. Reward and Essence sites are not
members of the add-site candidate pool.

## Related Information

- [Dream Merchant v3 design][merchant-v3] defines the existing Augury
  archetypes, corpus signals, ranked-band sampling, and deterministic encounter
  generation that form the starting point for the shared core.
- [Journey rules][journeys] describe the player-facing roles of Augury and
  Exploration, site completion behavior, Dreamsign limits, and map semantics.
- [Exploration encounter catalog][exploration-catalog] is the authored source
  for Exploration prose, actions, template provenance, predicates, and reward
  variables.
- [Current Exploration provider][exploration-provider] contains the independent
  uniform target selection and bespoke effect resolution being converged.
- [Current Augury archetype registry][augury-registry] identifies the active
  Augury reward builders.
- [Current Augury selection context][merchant-context] projects journey state
  into the card, deck-entry, Dreamsign, corpus, and fit-model inputs used by
  reward generation.
- [Current selection trace contract][merchant-trace] records candidate scores,
  bands, selected UUIDs, and fallback branches for Augury.
- [Current deterministic sampler][merchant-rng] defines the SHA-256 stream and
  ranked-band implementation preserved by the first shared rules version.
- [Site event fold][site-fold] defines `OPEN_SITE` idempotence and authoritative
  runtime generation.
- [Journey reward effects][reward-effects] are the common state-mutation
  boundary for ordinary grants and deck-entry changes.
- [Cooperative actions][coop-actions] are the only client intent writers for
  shared journey flow.
- [Dreamsign profile source][dreamsign-profiles] assigns curated features and
  quality tiers to Dreamsign UUIDs.
- [Dreamsign match scorer][dreamsign-match] defines the current feature coverage
  and quality-weighted Dreamsign score.
- [Exploration editor schema][exploration-schema] maps Exploration effect kinds
  to template ids and author-editable fields.
- [Gamble mechanics][gamble-mechanics] documents another consumer of the
  Dreamsign match score and its “strong Dreamsign pool” terminology.

[merchant-v3]: ../specs/2026-06-09-dream-merchant-v3-design.md
[journeys]: ../../journeys/journeys.md
[exploration-catalog]: ../../../data/exploration_site.toml
[exploration-provider]: ../../../src/coop/providers/exploration-provider.ts
[augury-registry]: ../../../src/journey_v2/archetypes/registry.ts
[merchant-context]: ../../../src/journey_v2/context/buildMerchantContext.ts
[merchant-trace]: ../../../src/journey_v2/trace/types.ts
[merchant-rng]: ../../../src/journey_v2/signals/rng.ts
[site-fold]: ../../../src/rules/journey/sites.ts
[reward-effects]: ../../../src/rules/journey/reward-effects.ts
[coop-actions]: ../../../src/coop/actions.ts
[dreamsign-profiles]: ../../../data/dreamsign_profiles.toml
[dreamsign-match]: ../../../src/journey_v2/signals/dreamsignMatch.ts
[exploration-schema]: ../../../scripts/exploration-editor-schema.mjs
[gamble-mechanics]: ../../gamble/gravok-gamble-mechanics.md

## Terminology

- A **reward mechanic** is the observable state change and choice shape, such
  as gaining one card, choosing one of four, or transfiguring a deck entry.
- A **selection policy** is the internal rule that scores and samples legal
  targets for a mechanic.
- A **candidate** is one legal card UUID, deck-entry UUID, Dreamsign UUID,
  site type, pack, or deck-entry and modification pair considered by a policy.
- An **ordinary card** or **ordinary Dreamsign** comes from the main journey
  catalog. **Custom content** is embedded in Exploration content with its own
  explicit identity and rules.
- A **starter** is a card marked as part of a starting deck. A **special** card
  is catalog content whose rarity excludes it from ordinary generated grants.
  A **Nightmare** is the journey's Bane card and is excluded from ordinary
  purge recommendations.
- A **cold-start** selection occurs before the deck has six cards or before the
  preferred fit signal is available. Its policy uses a declared fallback.
- A **prepared offer** is the concrete, persisted selection result displayed
  and later validated by a site.
- A **ranked band** is the highest-scoring portion of a legal pool from which
  the final target is sampled uniformly.

## Problem and Context

### Augury

Augury offers two immediate rewards. Its generator first determines which
reward archetypes are eligible, then selects two archetypes from different
families, and finally selects each reward's concrete targets. Target selection
uses corpus-derived card quality, card-to-deck fit, leave-one-out deck fit,
card centrality, transfiguration benefit, and curated Dreamsign profiles.

Most Augury target selectors follow a ranked-band model. They rank legal
candidates by a policy-specific score, retain a high-scoring band, and sample
uniformly within that band using deterministic seeded randomness. This keeps
offers useful without making every run choose an identical maximum-score item.

The active Augury registry currently includes:

- single-card grants selected by fit or by a fit-and-quality blend;
- four-card drafts selected by fit;
- drafts that grant multiple copies of the chosen card;
- category-constrained drafts;
- cohesive multi-card bundles;
- drafts whose cards arrive transfigured;
- transfiguration of an existing deck entry;
- starter-card transfiguration;
- purge of a low-fit deck entry;
- duplication of a valuable, synergistic deck entry;
- a deck-suited Dreamsign grant; and
- addition of a site to the current dreamscape.

Several additional archetype identifiers exist for future or inactive builders.
The shared architecture must support adding them, but active behavior defines
the initial compatibility requirement.

### Exploration

Exploration presents an authored scene associated with card artwork and exactly
two authored actions. Each action names a mechanical effect, contains narrative
copy, and may declare variables such as a card predicate, count, fixed card
UUID,
fixed Dreamsign UUID, or transfiguration.

When an Exploration runtime is created, its provider prepares concrete offers
for both actions. It independently shuffles catalog cards, deck entries,
Dreamsigns, Dream Avatars, and replacement candidates. Resolution validates the
player's submitted UUIDs against those prepared offers, applies shared journey
reward effects where possible, handles bespoke effects, and persists a detailed
resolution record.

Exploration already has player-visible mechanics corresponding to many Augury
rewards:

- gain a fixed or generated card;
- gain multiple copies of a generated card;
- draft one card from four;
- draft a card and gain multiple copies;
- take any subset from an offered set;
- choose a pack of cards;
- transfigure a selected card;
- apply a fixed transfiguration;
- purge or replace a selected card;
- duplicate selected or offered deck cards;
- gain a fixed or generated Dreamsign; and
- change card subtypes.

The important difference is target quality. Exploration's generated candidates
are generally uniform after hard predicate filtering. Consequently it can offer
an off-plan draft card, an unimportant duplication target, a transfiguration
with little benefit, or a purge target the player would rather keep even though
Augury already has code that can make those decisions intelligently.

### Cost of the split

The two target-generation paths create several maintenance and design problems:

- fixes to scoring, candidate identity, eligibility, determinism, or fallback
  behavior must be discovered and implemented twice;
- identical mechanics can behave very differently depending on the site;
- Exploration cannot benefit automatically from improvements to Augury's
  corpus models or tuning;
- observability differs, making “why did the algorithm offer this?” easier
  to
  answer for Augury than for Exploration;
- template design can accidentally encode internal algorithm variants as if
  they were different player-facing effects; and
- separate randomization utilities create unnecessary replay and multiplayer
  consistency risk.

## Goals

- Use one production code path to select and rank common reward targets for
  Augury and Exploration.
- Let Exploration offer high-fit draft cards, recommend sensible purge targets,
  choose valuable duplication targets, select useful Dreamsigns, and pair good
  cards with good transfigurations.
- Keep all ranking concepts behind the player-facing boundary.
- Preserve the distinct narrative and interaction identities of Augury and
  Exploration.
- Represent template differences only when the mechanics, disclosed
  information, quantity, commitment, or player agency are observably different.
- Make common selection deterministic, replayable, UUID-based, and compatible
  with the cooperative event-log architecture.
- Produce enough structured logging to reconstruct candidate eligibility,
  scoring, banding, fallback behavior, and final selection from a production
  journey log.
- Preserve authored fixed rewards and genuinely bespoke Exploration effects.
- Give content authors a clear way to constrain candidates without
  reimplementing ranking logic.
- Keep reward selection tunable through one set of policy definitions and
  simulation tooling.

## Constraints and Requirements

### Player-facing language

Fitness is an implementation concept. Player-facing screens, action copy,
offer summaries, dialogue, badges, tooltips, animation labels, and outcome copy
must not expose:

- fitness or fit scores;
- misfit or low-fit judgments;
- corpus quality scores;
- candidate ranks or ranking bands;
- probability weights; or
- statements that an item was selected because the algorithm believes it suits
  the deck.

Debug screens, logs, tests, developer tooling, and internal data may use precise
scoring terminology. The boundary is whether the information is presented as
part of the player's journey experience.

The concrete reward itself remains visible whenever the mechanical template
promises a known reward. A single-card offer can say “Gain CARDNAME.” A
draft displays its candidate cards. A preselected transfiguration displays the
card and resulting form. The game demonstrates intelligence through selection
quality rather than explanatory copy.

### Identity

Cards, Dreamsigns, deck entries, actions, sites, and modifications use stable
identifiers throughout generation, persistence, validation, and logging.
Names are resolved only for display. Card names are never used for equality,
deduplication, lookup keys, selection keys, or replay validation.

Deck-entry UUIDs are authoritative for effects on owned cards. Card UUIDs are
authoritative for catalog candidates. A candidate involving a modification is
identified by the deck-entry UUID and the modification variant together.

### Cooperative state

Shared game flow is a fold of the room event log. Clients submit intent events
through the cooperative action layer. React state and refs may coordinate local
presentation but may not determine reward eligibility, target selection,
acceptance, or completion.

Concrete generated offers and any information needed to validate them survive
reload and replay. Two clients folding the same event sequence reach identical
site runtimes and journey state.

### Determinism

Every generated result is a pure function of versioned content, relevant
journey state, stable identifiers, and an explicit deterministic random stream.
The random stream is salted by the journey, site, action or Augury slot, policy,
and selection purpose so unrelated draws do not perturb one another.

The request carries a canonical selection key in addition to the policy id.
Augury slots and Exploration actions normally have different keys and therefore
produce different deterministic variety. Contract tests that compare the two
surface wrappers supply the same key; in that case both wrappers must return
the same core result. Surface identity is not otherwise part of scoring.

The first shared rules version uses the existing Augury random stream. Salt
parts are joined with `|`. Draw number zero hashes the joined salt followed by
`|0` with SHA-256, draw one uses `|1`, and so on. A draw parses the first 13
hexadecimal digits of the digest and divides by 2 to the power of 52, producing
a uniform value from zero inclusive to one exclusive.

The canonical salt parts are selection-rules version, journey seed, site UUID,
selection key, policy id, and purpose. Purpose distinguishes archetype,
candidate, count, pack, and bundle-growth draws. Multi-result selection uses
successive draws from one purpose stream. Its returned draw order is the
display order unless the mechanic declares another stable visible order.

Iteration order from maps, sets, object keys, or source files must not silently
become a tie-breaker. Candidate lists receive a stable UUID-based order before
scoring and sampling. Exact-score ties are ordered by stable candidate key
before the band boundary is computed. Seeded sampling then operates on that
canonical band order.

### Candidate legality

Selection intelligence ranks only mechanically legal candidates. It cannot
override authored predicates, transfiguration eligibility, held-Dreamsign
exclusion, card ownership rules, card-pool scope, deck-entry state, maximum
choice count, or journey limits.

Content constraints are applied before scoring. For example, an authored
“Survivor” draft ranks Survivor cards; it does not rank the whole catalog
and
then discard non-Survivors. A fixed-card action grants its fixed UUID and does
not substitute a higher-scoring card.

### Existing journey rules

Common rewards apply through authoritative journey reward operations. New deck
entries use the established sequence-keyed minting scheme. Dreamsign rewards
respect the maximum-held replacement flow and consume the run's shared remaining
Dreamsign pool when they use ordinary run Dreamsigns.

Custom Exploration cards and Dreamsigns remain explicit content exceptions.
Their identifiers and payloads are still validated and persisted.

## Proposed Design

### One selection core, two encounter surfaces

The shared core is a site-neutral service. It understands reward candidates,
selection policies, deterministic sampling, and reward payloads. It does not
generate Aldric's dialogue, Layaway's prose, Augury card art, Exploration frame
breaks, or outcome choreography.

Augury remains responsible for:

- rolling eligible reward archetypes;
- enforcing different families for its two offers;
- deciding which information is disclosed before acceptance;
- rendering Augury-specific offer cards and dialogue; and
- accepting or declining one of two offers.

Exploration remains responsible for:

- selecting an authored encounter and its source artwork;
- presenting two narrative actions;
- collecting template-specific player choices;
- resolving Exploration-only mechanics and response prose; and
- running Exploration-specific entry, outcome, and exit choreography.

Both surfaces call the same core to turn a reward request into concrete targets,
payloads, and an explanation trace.

The cooperative `OPEN_SITE` intent is the generation boundary. During the
event-log fold, the authoritative site provider builds the complete prepared
runtime and stores it under the site UUID. Repeated `OPEN_SITE` events bounce
when a runtime exists. Player clients do not generate authoritative offers
before emitting that intent.

### Separate mechanic, policy, and presentation

Every generated reward has three independent concerns.

The mechanic defines what changes in game state and what agency the player has.
Examples include gaining one card, choosing one of four cards, purging a named
deck entry, choosing a purge target, duplicating a deck entry, gaining a
Dreamsign, or adding a site.

The selection policy defines how legal candidates are scored and sampled.
Examples include deck fit, a fit-and-quality blend, leave-one-out misfit,
duplication value, transfiguration value, Dreamsign match, cohesive bundle
growth, and uniform selection.

The presentation defines authored labels, prose, effect text, revealed
variables, cards or previews to display, and animations. Presentation receives
concrete bindings such as card UUIDs and transfiguration types. It does not
receive raw scores as player-visible fields.

This separation is an invariant. A scoring variation does not create a new
player-facing template. A template is warranted when the state change,
quantity, disclosure timing, commitment, or player choice is different.

### Shared selection context

The shared core consumes a normalized snapshot of the relevant journey and
content state. The context includes:

- journey seed and site UUID;
- an optional action UUID or Augury slot identity;
- concrete deck entries and their effective card data;
- card lookup maps keyed by UUID and card number;
- the resolved journey draft-pool UUIDs;
- owned card UUIDs;
- held Dreamsign UUIDs and the remaining Dreamsign pool;
- ordinary and custom card and Dreamsign catalogs;
- the fit model built from adapted draft records;
- baked corpus quality and cluster signals;
- curated Dreamsign profiles;
- site enhancement state where it affects quantity or policy tuning; and
- one explicit `selectionRulesVersion`.

Effective deck cards incorporate existing transfigurations, subtype changes,
and keyword modifications. Candidate legality and scoring therefore reflect
the deck the player actually has, not only base card definitions.

The existing Augury context projection is the starting implementation, but the
shared contract is named and owned as reward selection rather than merchant
behavior. Surface-only fields stay outside the common context.

### Reward selection request

A selection request supplies the mechanical recipe, hard candidate constraints,
selection policy, requested result shape, and deterministic scope.

Hard constraints may include:

- catalog cards versus current deck entries;
- a card predicate such as Character, Event, subtype, cost band, or fast;
- fixed card, Dreamsign, or transfiguration UUIDs;
- draft-pool-only or full-catalog scope;
- ownership and starter-card rules;
- ordinary versus custom content;
- number of offered candidates;
- number of copies awarded;
- distinct-card or repeated-copy behavior;
- allowed transfiguration types; and
- permitted site types.

The result shape distinguishes a preselected target, a player chooser, a pack
chooser, a bundle, and a composite operation. The same policy may populate
several shapes.

A whole-deck chooser and a generated recommendation are different result
shapes. A template that promises a free choice from every legal deck entry
receives the complete legal set and does not let ranking restrict player
agency. A template that promises one or several offered entries receives a
ranked subset from the shared core.

An Exploration action may carry non-player-facing `selection-policy` metadata.
The canonical mechanic supplies a sensible default, so content authors specify
an override only when the encounter intentionally needs another policy. Augury
archetypes submit the same policy identifiers directly.

### Reward selection result

The common result contains:

- the policy id and `selectionRulesVersion` actually used;
- stable identities for every selected card, deck entry, Dreamsign, site type,
  and modification;
- concrete chooser or pack membership in display order;
- authoritative reward payloads or bindings from which they are built;
- fallback and eligibility facts;
- an encounter-stable target key or signature; and
- a structured selection trace.

The runtime persists selected and displayed bindings, the payload identity,
the encounter signature, the selection key, the single
`selectionRulesVersion`, and the bounded trace. Logs contain the durable deck
snapshot and artifact revisions used to interpret that trace. Fields used only
to render names or art are derived from stable identities.

Surface adapters translate this result into Augury offers or Exploration action
offers. They do not repeat scoring, band construction, shuffling, or candidate
selection.

### Candidate pipelines

Each policy follows the same conceptual pipeline:

1. Construct the legal candidate universe from content and journey state.
2. Apply authored and mechanical hard constraints.
3. Compute the policy's scores and named components once.
4. Apply deterministic fallback behavior when a preferred signal is absent.
5. Rank candidates with stable identity tie-breaking.
6. Construct the configured sampling band.
7. Sample the requested number without replacement unless repeated copies are
   part of the mechanic.
8. Return selected identities, payload bindings, and the trace assembled from
   the same score data.

This is a behavioral contract, not a requirement for every policy to share one
generic scoring function. Policies may enumerate card-modification pairs or
grow a cohesive bundle, but they share the context, deterministic sampling,
result contract, trace format, and failure semantics.

The shared policies consume four existing signal families:

- card fit comes from the journey fit model, which combines card prior and
  normalized co-occurrence with the current deck using adapted draft records;
- corpus quality is the baked taken-over-passed strength term for a card;
- leave-one-out fit is the mean co-occurrence of one deck entry's card with
  the other distinct cards in the deck; and
- card affinity and retained corpus clusters describe cards that tend to
  belong together.

Cards absent from a signal artifact are unknown, not zero-quality facts. Each
policy handles missing values through its declared eligibility or fallback.

### Initial policy catalog and tuning

The first shared rules version preserves the active Augury numeric tuning as
its authoritative defaults. It also standardizes missing-signal fallbacks,
which is an intentional behavior improvement: the current pure-fit Augury
builders assign tied zero scores when the fit model is absent. Policy ids are
stable internal identifiers. The initial catalog consists of:

- `fixed`, which validates and returns authored identifiers without ranking;
- `uniform`, which samples every legal candidate equally;
- `card-fit`, which ranks catalog cards by fit with the current deck;
- `card-fit-quality`, which blends normalized fit and corpus quality;
- `card-bundle`, which grows a cohesive group from a scored seed;
- `purge-misfit`, which ranks concrete deck entries as purge candidates;
- `duplicate-value`, which blends corpus quality and leave-one-out fit;
- `deck-entry-centrality`, which ranks legal owned entries by their importance
  to the current deck;
- `transfiguration-value`, which ranks deck-entry and form pairs;
- `dreamsign-match`, which ranks unheld available Dreamsigns by profile
  coverage; and
- `site-uniform`, which samples the allowed add-site types equally.

The default ranked band retains the top 25 percent of candidates with a
minimum of five when five are available. Sampling within the band is uniform
and without replacement. The strong single-card policy uses the top 15 percent
with the same minimum. Dreamsign selection uses the top 40 percent with a
minimum of two for a single reward and enough candidates to fill a chooser.

For a legal pool of size `n`, band fraction `f`, and minimum `m`, the band size
is the smaller of `n` and the larger of `ceil(f × n)` and `min(m, n)`. Each
sample takes `floor(draw × remainingBandSize)`, returns that candidate, and
removes it from the band. A fixed-size mechanic is ineligible when the band
cannot fill the requested count. A mechanic explicitly presented as “up to
N” may return the smaller band size, but must return at least one candidate.

`card-fit-quality` for a single selected card weights normalized fit at 0.7
and normalized corpus quality at 0.3. The copies-draft variation weights fit at
0.6 and quality at 0.4. Both use quality alone while the deck contains fewer
than six cards or the fit signal is unavailable. If quality is also
unavailable, they sample uniformly from legal candidates and record both
fallbacks.

`card-fit` uses quality as its first fallback and uniform legal selection as
its second fallback. Fit and quality normalization is over the constrained
candidate pool for that request. A constant-valued component normalizes to
zero, matching the existing Augury behavior.

`card-bundle` selects a seed by fit, or quality during cold start. Each growth
step weights affinity to the seed at 0.5, affinity to the current bundle at
0.3, and normalized deck fit at 0.2. It samples from the top five additions.
Bundle size is a deterministic choice of two or three unless the mechanic
declares another visible count.

`purge-misfit` admits starters plus corpus-scored non-starters in the bottom
20 percent of leave-one-out fit. Lower leave-one-out fit ranks first. Starters
receive a 0.25 ranking bonus. Nightmare and no-signal non-starter entries are
ineligible.

The purge threshold count is `ceil(0.2 × scoredNonStarterCount)`. The threshold
is the leave-one-out value at that one-based position after ascending sort; all
scored non-starters at or below the threshold are legal. Their ranking score is
one minus raw leave-one-out fit. A starter's ranking score is 1.25, so larger
scores consistently rank toward the front. No minimum non-starter count is
required, but the deck must contain at least eight entries before this policy
is eligible.

`duplicate-value` weights normalized corpus quality and normalized
leave-one-out fit equally. It considers concrete non-starter deck entries, so
two entries with the same card UUID remain distinct candidates.

Missing quality or leave-one-out components contribute zero before
normalization. When every candidate has the same component value, that
component normalizes to zero. A completely tied candidate set therefore uses
canonical key ordering to form the band and seeded uniform sampling within it.

`transfiguration-value` weights benefit at 0.7 and card centrality at 0.3.
Centrality uses 0.65 of the fit prior and 0.35 of card-to-deck co-occurrence,
clamped to the zero-to-one range. With no signal, centrality is 0.25 plus 0.15
for a card with at least three spark.

Transfiguration benefit uses the current Augury values:

- Empowered measures half-cost reduction and caps at one;
- Kindled measures spark increase divided by four and caps at one;
- Amplified is 0.4;
- Inspired and Enduring are 0.55;
- Hastened, Resonant, and Attuned are 0.5; and
- Perfected is 0.65 when a mechanic explicitly allows it.

Missing centrality signal uses the mechanical fallback stated above. Missing
affinity contributes zero during bundle growth. A bundle or pack is ineligible
when its constrained legal pool cannot supply the required number of distinct
cards. The bundle count draw occurs before seed selection; growth uses one
successive purpose stream and stops only after reaching the visible count.

The policy catalog and values are versioned tuning, not player-visible rules.
Changes require updated simulation evidence and a `selectionRulesVersion`
increment.

Canonical mechanics use these defaults:

- a generated direct card grant uses `card-fit-quality`;
- an ordinary card draft uses `card-fit`;
- a copies draft uses the 0.6 fit and 0.4 quality variation;
- a distinct multi-card grant or pack uses `card-bundle`;
- a generated purge target uses `purge-misfit`;
- a generated duplication offer uses `duplicate-value`;
- a generated subtype-change target uses `deck-entry-centrality` after the
  authored subtype and card predicate constraints;
- a dynamic or fixed-form transfiguration target uses
  `transfiguration-value`;
- a generated Dreamsign uses `dreamsign-match`;
- a fixed content UUID uses `fixed`;
- a Dream Avatar chooser uses `uniform`; and
- an add-site reward uses `site-uniform`.

A whole-deck selector has no ranking default because its mechanic preserves the
full legal choice set. Authored content may explicitly request `uniform` for a
generated result when randomness itself is part of the intended contract.

### Card grant policies

The shared card-fit policy uses the existing fit model trained from adapted
draft records. It scores each legal candidate against the current effective
deck. It is appropriate for single-card grants and ordinary drafts once the
deck is large enough to provide meaningful signal.

The shared fit-and-quality policy blends normalized deck fit with baked corpus
quality. It is appropriate when the system is choosing a single card for the
player or granting multiple copies, because the result should be both useful
in the deck and independently valuable.

For a small deck or unavailable fit model, policies use their declared
deterministic fallback. A fit-and-quality reward falls back to quality. A pure
fit reward falls back to quality and then uniform legal selection. Every
fallback branch is logged.

The ordinary grant pool uses non-starter, non-special cards from the resolved
journey draft pool and excludes already-owned UUIDs when the mechanic promises
a new card. A cold-start journey without a resolved pool uses the eligible
catalog. Exploration may request full-catalog or duplicate-allowed behavior
only when that is an intentional mechanical constraint in authored content.

An authored card predicate narrows this pool before scoring. Thus a Survivor
draft still presents Survivors, but those Survivors are selected intelligently.

### Drafts, packs, and bundles

A card draft uses a shared scored candidate pool and band-samples its displayed
choices without replacement. The player chooses among the concrete cards; the
UI makes no claim about their scores.

A copies draft uses the same chooser construction but applies the configured
copy count to the chosen card. Copy count is a mechanical template variable,
not a selection-policy variant.

A pack chooser builds each offered pack from distinct candidates satisfying the
authored predicate. Pack construction uses shared cohesion and deck-affinity
signals so each pack has an internal reason to exist. The player still sees and
chooses whole packs normally. Cards are unique within and across all packs in a
single chooser unless the authored mechanic explicitly grants repeated copies.

A direct multi-card reward uses the existing bundle-growth policy when its
mechanic promises cards that belong together. It chooses a good seed and grows
the bundle using card affinity and deck fit. A reward promising repeated copies
of one card uses one selected UUID and a copy count instead.

### Purge and replacement policies

The shared purge policy ranks concrete deck entries by leave-one-out fit. It
considers starter entries and non-starter entries in the configured low-fit
fraction. Nightmare cards are excluded from ordinary purge rewards. Cards with
insufficient corpus signal are not classified as purge candidates merely
because their score is missing.

The policy may produce either a preselected purge target or a small chooser,
depending on the mechanical template. The player sees the card or cards, not a
“weak” or “low-fitness” label.

A purge-and-replace mechanic uses the same purge target policy and a shared
card-grant policy for replacements. The removal and grant form one atomic
reward. Authored predicates constrain the appropriate side before ranking.

### Duplication policies

The shared duplication policy ranks non-starter deck entries using baked card
quality and the entry's leave-one-out fit with its teammates. It can produce a
single recommended entry or a chooser of recommended entries.

Exploration actions that offer several cards from the deck for duplication use
this policy rather than a uniform deck shuffle. Actions where the player may
choose freely from the whole deck preserve that agency; the shared core still
owns legality, stable ordering, and any recommended subset the template
actually displays.

### Transfiguration policies

Dynamic transfiguration selection enumerates every legal pair of an eligible
deck entry and an eligible transfiguration. It scores the pair using the
existing transfiguration-benefit and card-centrality signals. Pair enumeration
prevents an early per-card maximum from discarding useful combinations.

Ordinary dynamic rewards exclude Perfected and already-transfigured entries in
accordance with Augury's existing journey rules. A template with a fixed
transfiguration filters to that form before ranking entries. A template with a
fixed deck entry ranks only legal forms for that entry. Explicit bespoke content
may permit a different form only through an authored mechanical constraint.

A preselected transfiguration result binds both the deck-entry UUID and form.
A chooser result binds each offered deck entry to its legal form or exposes the
template's intended second choice. The UI displays the resulting card preview
without describing benefit or centrality.

A transfigured-card draft first builds legal catalog-card and transfiguration
pairs, then ranks and samples those pairs. The accepted card enters the deck in
the displayed form.

### Dreamsign policy

Ordinary generated Dreamsign rewards consider unheld Dreamsign UUIDs in the
run's remaining Dreamsign pool. Fixed authored Dreamsign rewards keep their
fixed identity and validate it against content and journey rules. Custom
Exploration Dreamsigns use their explicit content contract.

An ordinary fixed Dreamsign action is eligible only while its UUID is unheld
and present in the remaining run pool. A full inventory uses the existing
replacement interaction after the reward is prepared. A custom Dreamsign may
use an explicitly authored availability rule, but it must still obey the held
limit and replacement contract.

The shared deck-match scorer uses curated profiles. Each profile can declare
card subtypes, card types, cost bands, keywords, and a quality tier. For each
declared feature, coverage is the number of matching deck cards divided by
three, capped at one. The feature coverages are averaged. Quality tiers one,
two, and three apply multipliers of 1.2, 1.0, and 0.8 respectively.

A featureless or unprofiled Dreamsign receives baseline coverage of 0.4 and a
default quality tier of two. A profiled Dreamsign with no matching feature has
zero coverage. Cost bands are cheap at cost one or less, mid at costs two to
three, and big at cost four or more. Variable-cost cards do not satisfy a cost
band. The currently recognized keyword features are Reclaim and fast.

Generated rewards prefer Dreamsigns with genuine positive deck coverage when
the pool can fill the requested result count. Otherwise they add positively
scoring generic signs. A signal-free pool falls back to all legal candidates.
The final target or chooser is sampled from a high-scoring band. The player
sees the concrete Dreamsign choices and effect text, not match scores or claims
of suitability.

Genuine coverage means the profile declares at least one feature and its mean
coverage is greater than zero. A positive generic is any legal candidate whose
final match score is greater than zero, including genuinely covered signs. A
fixed-size Dreamsign chooser is ineligible unless the selected tier and band
can fill every displayed slot.

The casino's “strong Dreamsign pool” uses the same score but keeps the best
50
and samples uniformly from them. That sampling policy is outside the initial
Augury and Exploration convergence. It may later call the same site-neutral
scorer without adopting the tighter Augury reward band.

### Uniform policy

Uniform selection remains a valid explicit policy for mechanics whose design is
genuinely random and whose candidate quality has no useful ranking signal. It
uses the same deterministic sampler and trace contract as scored policies.

Uniform is not an implicit fallback for missing implementation. Every mechanic
declares its normal policy and fallback behavior so a missing model cannot
silently change product behavior.

### Add-site policy

The add-site mechanic places one concrete site on the current dreamscape. Its
candidate pool is exactly:

- Shop;
- Purge;
- Transfiguration; and
- Duplication.

The selected type is disclosed before acceptance. Selection is uniform unless
a later product decision introduces a shared, explicitly versioned site-value
policy.

The existing authoritative placement operation determines whether the current
dreamscape can accept another site and mints the concrete site UUID
deterministically. Existing sites of the same type do not by themselves exclude
that type. Any map-capacity or structural placement failure makes the reward
ineligible before it is offered.

Essence is represented by a direct Essence reward. A card is represented by a
direct card grant or draft. Those outcomes are immediate, legible, and use the
shared reward-selection policies rather than asking the player to add a site
whose eventual output is equivalent but unknown.

## Template Model

### Templates express observable contracts

An Exploration template is the reusable player-observable contract for an
action. It defines the state-change shape, quantities and variables, disclosed
information, and player choice. Narrative labels and encounter prose remain
authored per encounter.

Selection policy is internal configuration attached to a template invocation
or supplied by its default. Policy metadata is compiled and validated with the
action but is omitted from player-facing view models.

The authoring system groups templates by canonical mechanic. Historical
template ids remain valid provenance for existing encounter and candidate data,
but runtime generation compiles aliases to the canonical mechanic and policy
request. New authoring does not require duplicate templates for ranking
variants.

### Consolidation rules

The following existing template families share canonical mechanics:

- Single generated card grants represented by templates 9 and 11 compile to
  one gain-card mechanic. Predicate, disclosure, and selection policy are
  parameters. Template 10 is the fixed-UUID form of that mechanic.
- Template 12 is a repeated-copy variation because gaining several copies of
  one selected UUID is mechanically visible.
- Template 13 is a distinct multi-card variation because it grants several
  selected UUIDs.
- Templates 14 and 15 share a card-draft mechanic; the accepted copy count is a
  visible mechanical variable.
- Templates 17, 18, and 19 share a transfigure mechanic. Fixed versus dynamic
  form, selected versus preselected entry, and choice shape are explicit
  mechanical parameters.
- Templates 27 and 28 share a gain-Dreamsign mechanic. A fixed Dreamsign UUID
  versus generated target is selection input, not a different state mutation.
- Templates 49, 50, 51, and 55 share duplication operations but retain their
  visibly different numbers of source choices and copied cards.

Existing action ids and template provenance remain stable in logs and data.
Canonical mechanic ids become authoritative for runtime behavior.

### Canonical Exploration mechanic mapping

Every current Exploration effect kind compiles through the following mapping.
Fields named here are authoritative bindings supplied by authored content,
player intent, or the shared selection result.

- `gain-card` covers `gain-card`, `gain-offered-card`, and
  `gain-random-cards`. Bindings are selected card UUIDs, card numbers, distinct
  or repeated-copy mode, and count.
- `catalog-card-chooser` covers `draft-card` and `take-cards`. Bindings are the
  offered card UUIDs, allowed selected count, and awarded copy count.
- `pack-chooser` covers `choose-pack`. Bindings are ordered packs of distinct
  card UUIDs and the chosen pack index.
- `transfigured-card-chooser` is the new transfigured-draft contract. Every
  candidate binds card UUID, card number, transfiguration form, and preview.
- `gain-dreamsign` covers `gain-dreamsign` and
  `gain-random-dreamsign`. Bindings are Dreamsign UUID and any replacement
  intent required at the held limit.
- `transfigure-deck-entry` covers `transfigure-selected` and
  `transfigure-fixed-selected`. Bindings are deck-entry UUID,
  transfiguration form, and resulting preview.
- `purge-deck-entry` covers `purge-selected`. Bindings are one or more concrete
  deck-entry UUIDs and their authoritative card identities.
- `purge-for-essence` covers the effect kind of the same name. It adds the
  authored per-spark rate to the purge bindings.
- `purge-and-duplicate` covers `purge-and-copy`. It binds separate purge and
  copy entry UUIDs and applies both atomically.
- `replace-deck-entry` covers `replace-selected-with-card` and
  `replace-selected`. It binds the removed entry and fixed or generated
  replacement card.
- `duplicate-deck-entry` covers `copy-selected-card`,
  `copy-selected-cards`, and `copy-offered-deck-card`. It binds source entry
  UUIDs and the number of copies minted for each.
- `change-entry-subtype` covers `change-subtype-selected`. It binds the entry
  UUID and resulting subtype.
- `change-deck-subtype` covers `change-subtype-all`. It binds the chosen
  subtype and every affected entry UUID.
- `gain-nightmare-and-card` covers the effect kind of the same name and binds
  the fixed card plus Nightmare count.
- `next-site-transfiguration` covers
  `transfigure-next-draft-or-shop` and binds the one-use future-site modifier.
- `gain-essence-by-deck-predicate` covers `gain-essence-per-card` and binds the
  predicate, matching entry UUIDs, rate, and computed total.
- `increase-deck-spark` covers `increase-spark-all` and binds the affected
  entry UUIDs and spark increase.
- `purge-dreamsign-for-essence` covers the effect kind of the same name and
  binds the selected Dreamsign UUID and Essence amount.
- `make-deck-fast` covers `make-fast-all` and binds every affected entry UUID.
- `reduce-deck-cost-and-add-nightmares` covers
  `reduce-cost-all-and-gain-nightmares` and binds affected entries, reduction,
  and Nightmare count.
- `next-battle-modifier` covers `next-battle-opening-hand`,
  `next-battle-starting-energy`, and
  `next-battle-smaller-hand-and-cost-discount`. It binds the exact modifier and
  remaining-battle count.
- `choose-dream-avatar` covers the effect kind of the same name and binds the
  offered and selected Dream Avatar UUIDs.
- `purge-duplicates-and-grant-reclaim` covers the effect kind of the same name
  and binds every purged entry plus the exact Reclaim cost applied to each
  survivor.
- `add-site` is the new disclosed site-placement contract and binds one allowed
  site type before acceptance.

The new preselected purge template uses `purge-deck-entry` with exactly one
selected entry and no player target choice. The new preselected dynamic
transfiguration template uses `transfigure-deck-entry` with one selected entry
and form. The transfigured draft and add-site contracts use the two new
canonical mechanics described above.

Each canonical mechanic declares whether its bindings are selected by policy,
authored as fixed data, or supplied by validated player intent. The compiled
artifact rejects an action that supplies the same authoritative binding from
more than one source.

### Exploration coverage for Augury mechanics

Most active Augury mechanics fit existing Exploration contracts once they use
the shared selection core:

- fit and fit-and-quality single grants use the canonical gain-card template;
- fit drafts and category drafts use the canonical card-draft template;
- copies drafts use the draft copy-count variation;
- cohesive bundles use the distinct multi-card grant contract;
- starter transfiguration uses the transfigure mechanic constrained to starter
  entries;
- duplication uses the existing duplication contracts;
- generated Dreamsign rewards use the gain-Dreamsign mechanic; and
- replacement rewards use the existing remove-and-replace contract.

The Exploration template catalog must also represent the following genuinely
observable contracts:

- a preselected card purge shown as “Purge CARDNAME,” distinct from asking
  the
  player to choose any purge target;
- a preselected dynamic card-and-transfiguration pair, distinct from asking the
  player to choose the card or form;
- a draft in which every displayed card visibly arrives with a transfiguration;
  and
- addition of a disclosed Shop, Purge, Transfiguration, or Duplication site to
  the current dreamscape.

These are justified templates because the result or agency differs visibly.
“High-fit card,” “strong card,” “low-fit purge,” and “best
transfiguration” are selection policies and do not justify templates.

## Surface Integration

### Augury integration

Augury archetype builders become thin request builders. Each builder determines
eligibility and visible reward shape, then calls the shared core with hard
constraints and a policy id. It receives concrete targets, payloads, and a
trace.

The archetype lottery, family distinctness rule, two-offer signature, debug
forcing, accept-or-decline behavior, and Augury presentation remain surface
concerns.

Augury copy presents concrete mechanics without algorithm explanations. The
same generated target and payload must result whether it was produced through
an Augury wrapper or an equivalent direct shared-core request.

For shared-version runtimes, Augury's `OPEN_SITE` fold stores the two complete
prepared offers rather than relying on render-time generation. Debug rerolls
and forced archetypes are explicit intents that replace the prepared runtime
with a newly versioned, deterministically salted result.

### Exploration integration

Exploration action compilation maps each effect kind and template invocation to
a canonical mechanic, hard constraints, default selection policy, and visible
bindings. Runtime creation invokes the shared core for every generated target.

The Exploration provider retains bespoke resolution for whole-deck changes,
temporary battle modifiers, Dream Avatar replacement, future-site modifiers,
and other mechanics not represented by ordinary journey reward payloads. Shared
operations apply through the common authoritative reward-effect layer.

Prepared action offers persist concrete UUIDs, deck-entry UUIDs,
transfiguration pairs, packs, payload bindings, `selectionRulesVersion`, and
selection trace. The UI builds its choices from those prepared results.
Resolution
accepts player intent only when it names a prepared legal option.

The prepared offer freezes candidate selection. A later deck change does not
rerank or substitute its targets. Resolution rechecks only the state
preconditions required to apply the persisted payload, such as whether a deck
entry still exists and is still eligible for its prepared modification. Failed
preconditions reject the intent atomically and keep the authoritative site
runtime available for refresh or decline.

Production encounter selection considers whether both authored actions can
form complete legal offers in the current journey state. It commits an
encounter only when both actions are resolvable. Candidate-signal failure uses
the policy's declared fallback; a truly empty legal pool makes that action
ineligible. Deterministic retry selects among other eligible encounters.

Production retry starts from a seeded permutation of encounter UUIDs and tests
each encounter at most once. It commits the first encounter whose two actions
build successfully. This bounds work, makes retry order replayable, and avoids
favoring source-file order. Exhausting the catalog returns a structured
site-unavailable result rather than looping or committing empty actions.

A debug-forced encounter reports its ineligible action and candidate reason
instead of silently changing to different artwork. This gives authors a direct
way to diagnose impossible predicates and journey-state edge cases.

### Resolution ownership

Generation selects and persists targets; resolution validates and applies
intent. Resolution never trusts a card name, score, client-computed candidate,
or client-computed payload.

Common reward payloads are validated against the persisted generated offer and
applied atomically. Composite rewards either apply completely or leave journey
state unchanged. Site completion happens only after the authoritative outcome
is recorded.

Presentation animations consume the persisted resolution. Animation completion
may trigger the intent to leave a site, but it does not gate whether the reward
exists in shared state.

## Eligibility and Failure Behavior

A policy distinguishes three conditions:

- legal candidates and preferred scoring signal are available;
- legal candidates exist but the preferred scoring signal is unavailable; and
- no legal candidate exists.

The second condition uses a deterministic, policy-declared fallback and records
that branch. Missing corpus or fit data must not produce `NaN`, depend on input
order, or silently treat unknown cards as weak.

The third condition returns a structured ineligibility reason. Augury removes
the archetype from its eligible lottery or redraws after a dead build.
Exploration uses only encounters whose two actions can form legal offers.

Content compilation rejects unknown policy ids, unsupported mechanic-policy
combinations, invalid counts, invalid predicates, malformed UUIDs, unavailable
fixed content, and templates missing required variables. Runtime validation
still handles journey-dependent eligibility.

If a generated result references content unavailable during replay, resolution
fails safely without partial mutation and records a validation failure. The UI
offers a recoverable route back to the current authoritative site state.

## Persistence, Replay, and Compatibility

The shared selection result carries one `selectionRulesVersion`. It covers
candidate construction, scoring, fallback, random-stream encoding, band
behavior, template compilation, and result serialization. Tuning values used
for a generated offer are captured in its trace.

The result also records a selection-content revision covering the card and
Dreamsign catalogs plus the fit, corpus, affinity, and Dreamsign-profile
artifacts. The revision is a stable digest of their generated semantic inputs,
not a deployment timestamp.

An in-progress site uses the concrete offers and version persisted in its
runtime. Reload does not replace those choices because tuning or content
changed after generation. Acceptance validates against the persisted
identities, payload bindings, version, content revision, and signature. A
bounded trace is persisted with the offer and emitted to logs; full large
candidate sets are not required in shared state.

The runtime stores every identity and numeric value needed to apply its prepared
payload, including card UUID and card number, entry UUID, fixed modification,
and computed resource amount where applicable. Catalog entities referenced by
an unresolved runtime remain supported for the saved-run compatibility window.
If compatible content is unavailable, resolution rejects atomically, leaves
the site runtime intact, records the missing revision or identity, and requires
a client or deployment with compatible content.

Runtime records without `selectionRulesVersion` are legacy records. A legacy
Exploration runtime already contains its prepared candidates and resolves them
through a compatibility adapter without reranking. A legacy Augury runtime is
interpreted with the existing deterministic builder rules and translated to
the shared result shape before display or resolution. The legacy evaluator is
frozen by compatibility fixtures and remains part of this design until a
separate saved-run format deprecation explicitly ends its support. Those Augury
runtimes do not contain complete prepared offers.

Replaying an `OPEN_SITE` event without `selectionRulesVersion` invokes the
legacy generator. A newly emitted `OPEN_SITE` event includes the supported
version and invokes the shared generator. This event discriminator prevents a
historical event log from silently receiving current selection behavior.

New runtime fields are additive. Resolution intents carry stable site, offer or
action, selected-candidate identifiers, encounter signature, and
`selectionRulesVersion`. A provider rejects an omitted or mismatched version
for a shared-version runtime.

The room protocol advertises the minimum supported selection rules. A client
that does not support that value becomes read-only before it can emit
`OPEN_SITE` or resolution intent and prompts for refresh. This gate prevents an
older client from folding a new runtime with legacy generation rules. A newer
client similarly refuses to mutate an unsupported future version.

Visited sites and persisted resolutions need no transformation. Their recorded
outcomes remain authoritative even when current content or tuning differs.

Historical Exploration template ids remain valid aliases. Logs preserve the
authored template id, action UUID, canonical mechanic id, and policy id so old
and new content can be compared.

Asset generation assigns canonical mechanics and default policies to every
existing authored action. One-to-one effect kinds retain their current meaning.
The alias families listed in this document compile to the same mechanic while
preserving their historical ids. Custom card and Dreamsign references remain
explicit fixed-content bindings.

The intentional Exploration behavior change is the membership of generated
offers: common card, deck-entry, Dreamsign, pack, replacement, duplication, and
transfiguration actions use their shared ranked policies. Authored fixed
identities, visible counts, predicates, player agency, bespoke whole-deck
effects, temporary modifiers, and outcome choreography retain their current
contracts.

For new shared-version Augury runtimes, pure-fit rewards use the documented
quality and uniform fallback chain when the fit model is unavailable. Legacy
Augury runtimes retain the historical tied-zero behavior through their frozen
evaluator.

Changing policy weights, scoring, candidate construction, sampling, or compiled
mechanic semantics increments `selectionRulesVersion`. Cosmetic presentation
changes do not.

## Logging and Explainability

Every generated reward emits enough information to reconstruct its decision
from `logs/journey-log.jsonl`. Augury and Exploration use the same selection
trace shape.

The generation log includes:

- site type and site UUID;
- journey and encounter signature information;
- action UUID and authored template id for Exploration;
- Augury archetype and family for Augury;
- canonical mechanic id;
- policy id and `selectionRulesVersion`;
- selection-content and model-artifact revisions;
- canonical salt parts and the draw counters consumed;
- candidate key kind and candidate count;
- hard constraints and candidate-pool scope;
- a digest of every canonical candidate key, score, and score component;
- the complete ordered sampling band with scores and components;
- band size, fraction, minimum, and selected count;
- selected card, deck-entry, Dreamsign, modification, or site identifiers;
- fallback branches and ineligibility reasons;
- the complete UUID-backed effective deck snapshot plus its digest; and
- the concrete tuning blend used.

Candidates outside a large sampling band may be omitted as rows when the trace
preserves their canonical digest, total count, cutoff score, and artifact
revisions. The complete ordered band, selected rows, and random-stream material
are always retained. This is sufficient to replay the actual sample and verify
that the selected candidate belonged to the prepared band. Full deck-entry sets
and small catalog pools are logged as rows.

Recomputing every omitted outside-band score additionally requires the content
and model artifacts named by their revisions. Generated artifacts used by a
supported saved-run version remain reproducible from committed semantic source
data. The log does not claim that a digest alone explains an omitted row.

Exploration entry logs include the selection trace for each prepared action,
not only the resulting offered UUIDs. Resolution logs include exact validated
intent and resulting mutations. Completion logs retain the semantic outcome
and identifiers needed to connect generation to resolution.

Names may be included as non-authoritative diagnostic labels. Queries and
reconstruction use UUIDs.

## Authoring and Tooling

The Exploration editor presents mechanics and visible variables to content
authors. Selection-policy controls are grouped separately as advanced internal
behavior. The editor explains that these values affect candidate preparation
and never generate player-facing claims.

Each canonical mechanic declares:

- required and optional authored fields;
- supported predicates and content scopes;
- default selection policy;
- allowed policy overrides;
- result and chooser shape;
- required presentation bindings; and
- runtime eligibility checks.

The generated Exploration artifact includes canonical mechanic and policy data
needed by runtime selection. Generated assets remain derived from authored
TOML.

Template health tooling counts canonical mechanics separately from historical
template ids. Alias usage remains visible for cleanup and provenance but does
not imply distinct runtime mechanics.

Debug tooling can force an Augury archetype, Exploration encounter, canonical
mechanic, or selection policy. It displays candidate ids, scores, components,
band membership, selected targets, fallback branch, and ineligibility reason.
Those diagnostics remain outside the player-facing route.

The merchant simulation harness exercises shared policies through site-neutral
requests. It can compare outcome diversity, candidate reach, fallback frequency,
and average signal quality across representative synthetic or recorded deck
snapshots. Statistical analysis informs tuning but does not become a
load-sensitive CI gate.

## Operational Considerations

Selection policies depend on generated fit and corpus artifacts. Runtime
loading continues to make missing artifacts observable. Policies with declared
fallbacks remain functional, deterministic, and traceable when an optional
artifact is absent.

The curated Dreamsign profile TOML remains the source of Dreamsign features.
Generated JSON is refreshed through the repository asset-regeneration workflow.
Profile coverage and missing-profile counts should remain visible in data
validation and debug tooling.

Selection traces can be large. Logging bounds large catalog candidate arrays
while retaining selected candidates, top alternatives, candidate counts, band
facts, and truncation state. The runtime persists only information needed for
replay, resolution, presentation, and diagnostics.

Policy versions allow logs from different deployments to be interpreted
without assuming current tuning. A production debugging query can answer why a
specific card, purge target, Dreamsign, transfiguration, or site appeared.

## Validation Strategy

### Automated contract tests

Tests use deterministic synthetic fixtures with UUID-backed cards, deck entries,
Dreamsigns, and model signals. They assert stable observable contracts rather
than mutable production catalog contents, exact UI copy, private helper layout,
statistical thresholds, or timing.

Required contract coverage includes:

- equivalent Augury and Exploration requests produce the same selected
  identities, payload bindings, and traces under the same context and random
  scope;
- authored predicates constrain candidates before scoring;
- card names do not participate in identity or equality;
- fixed card and Dreamsign actions preserve their fixed UUIDs;
- fit policies choose only from the legal pool and follow their declared
  fallback when model signal is absent;
- unknown corpus cards are not classified as purge candidates;
- Nightmare cards are excluded from ordinary purge policy;
- duplicate policy keys candidates by deck-entry UUID;
- transfiguration selection considers legal entry-form pairs and rejects
  already-transfigured entries;
- fixed transfiguration actions rank only entries eligible for the fixed form;
- generated Dreamsigns are unheld, available in the shared run pool, and scored
  by the existing profile contract;
- choice sets contain unique candidates and respect their maximum size;
- band sizing follows the ceiling and minimum formula at every pool boundary;
- fixed-size requests reject undersized bands while “up to” requests return
  the permitted smaller nonempty set;
- pack candidates do not overlap unless the mechanic explicitly permits it;
- composite payloads apply atomically;
- deterministic salts isolate unrelated selection purposes;
- equal-score tie behavior is stable across input iteration order;
- ineligible policies return structured reasons rather than empty malformed
  offers;
- encounter retry uses the seeded permutation, tests each encounter once, and
  returns the defined exhausted result;
- persisted `selectionRulesVersion` and content revisions survive
  serialization and replay;
- legacy Exploration template aliases compile to their canonical mechanics;
- frozen legacy Augury fixtures regenerate their historical offers;
- a missing or mismatched rules version rejects new-runtime intent;
- room capability gating prevents an old client from opening or resolving a
  shared-version site;
- logs connect generation, player intent, resolution, and completion by stable
  identifiers;
- a test reader can reproduce the sampled result from a logged ordered band,
  salt, and draw sequence; and
- the add-site mechanic can select only Shop, Purge, Transfiguration, or
  Duplication.

### Data validation

Asset generation validates every authored Exploration action against its
canonical mechanic and selection-policy schema. It verifies UUID references,
predicate values, counts, policy compatibility, required variables, and
historical template aliases.

Dreamsign profile generation validates one supported quality tier per entry and
the recognized feature vocabulary. Coverage reports identify ordinary
Dreamsign templates without profiles while preserving their defined generic
fallback.

### Integration validation

Provider-level tests fold intent events through the authoritative journey state
and verify the persisted runtime and resulting state. They cover reload between
generation and selection, two-client replay, stale or forged selection intent,
full Dreamsign replacement, and a changed deck between site creation and
resolution.

UI adapter tests verify that player views consume concrete bindings without
depending on trace scores. Tests assert view-model structure and available
interactions rather than specific prose strings.

### Acceptance criteria

The proposal is complete when all of the following are true:

- Augury and Exploration call one shared implementation for every common target
  policy.
- Exploration contains no independent uniform implementation for common card,
  deck-entry, Dreamsign, transfiguration, pack, or replacement selection.
- Common scoring and band tuning have one authoritative definition.
- Player-facing models contain concrete rewards and choices but omit selection
  scores and algorithm explanations.
- Equivalent mechanics share a canonical template even when internal policies
  differ.
- Exploration can express preselected purge, preselected dynamic
  transfiguration, transfigured draft, and disclosed add-site rewards.
- Generated card drafts honor authored predicates while preferentially offering
  high-value candidates.
- Generated purge, duplication, transfiguration, and Dreamsign targets use the
  shared policies described in this document.
- Fixed authored rewards keep their fixed identities.
- Every generated offer is deterministic, versioned, replayable, and logged
  with a reconstructable trace.
- Cooperative clients derive the same runtime and outcome from the same event
  log.
- Production Exploration encounters present two mechanically resolvable actions.
- The add-site candidate pool contains exactly Shop, Purge, Transfiguration,
  and Duplication.
- Existing persisted runtimes and historical template ids remain readable.
- Focused tests and the repository's diff-aware review pass.

## Alternatives Considered

### Call Augury builders directly from Exploration

This would reuse code quickly, but it would make Exploration depend on Augury's
two-offer archetype model, merchant naming, dialogue assumptions, and offer
types. Exploration actions often constrain a reward by narrative predicate or
use a different choice shape. A site-neutral core keeps the reusable decision
logic without treating one surface as the other surface's special case.

### Keep separate selectors with shared low-level score helpers

Sharing only fit and quality functions would still duplicate candidate
construction, fallback behavior, band sizes, deterministic salts, trace
assembly, and identity validation. Those are the areas most likely to drift.
The shared boundary therefore includes the complete candidate-to-result
pipeline.

### Encode selection quality in template ids

Templates such as “gain a fit card” and “gain a strong card” would
render the
same concrete state change and encourage player-facing algorithm language.
They would also multiply the authoring catalog every time tuning changes. The
mechanic-policy separation preserves internal variety without redundant UI.

### Make every Exploration choice uniformly random

Uniform selection preserves variety but ignores information the project already
derives from high-quality draft records and curated Dreamsign profiles. Ranked
bands preserve randomness while materially improving the candidate floor.

### Select the absolute maximum-score candidate

Always taking the maximum would make repeated deck states predictable, narrow
catalog reach, and overstate noisy model differences. Ranked-band sampling
maintains a quality floor and deterministic variety.

### Replace all Exploration resolution with Augury resolution

Exploration contains whole-deck mutations, temporary battle modifiers, Dream
Avatar replacement, future-site modifiers, authored response states, and
custom content. These mechanics benefit from Exploration-specific resolution.
The shared design converges common generation and payload application while
leaving genuinely bespoke state transitions with their owning surface.

## Manual QA

1. Open a deterministic Augury debug encounter and an equivalent Exploration
   debug action against the same synthetic journey state. Confirm they prepare
   the same card, deck-entry, Dreamsign, or transfiguration targets while each
   retains its own presentation.
2. Exercise a predicate-constrained Exploration draft. Confirm every displayed
   card satisfies the narrative predicate, choices are useful for the deck, and
   the UI contains no ranking explanation.
3. Exercise preselected purge, duplication, and dynamic transfiguration actions.
   Confirm the concrete targets and previews are sensible, resolution changes
   the intended UUID-backed entries, and reload preserves the prepared offer.
4. Exercise generated and fixed Dreamsign actions, including a full Dreamsign
   inventory. Confirm generated choices respect the remaining pool and the
   replacement flow, while fixed actions retain their authored identity.
5. Force missing fit or corpus signal and an action with no legal candidates.
   Confirm declared fallbacks remain deterministic and the debug surface shows
   the branch or ineligibility reason without exposing it in player UI.
6. Accept an add-site reward repeatedly through deterministic debug seeds.
   Confirm only Shop, Purge, Transfiguration, and Duplication appear and the
   selected site is disclosed before acceptance.
7. Replay the same cooperative event log in two clients and after a reload.
   Confirm prepared offers, accepted payloads, animations, completion, and final
   journey state agree.
8. Inspect `logs/journey-log.jsonl` for each flow. Confirm the log connects the
   authored action or Augury archetype to its policy, candidate trace, selected
   UUIDs, validated intent, resolution, and completion.
9. Open a shared-version room with a client that advertises an older selection
   rules version. Confirm it becomes read-only, cannot emit site intents, and
   presents the refresh path without changing the room event log.
