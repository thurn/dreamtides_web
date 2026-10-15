# RD-hv-umm2.718-1: The current turn's first played character has static base spark 0

- Ladder: existing binding Spark, current-turn occurrence and D15 rules; D10
  step 4 for the static setting and entry timing; step 5 for the residual
  current-turn physical cohort and lifetime reading.
- rules.md: § Spark → First played character has 0✦; Base spark; Spark outside
  play; § Ability Types → Order of continuous effects; § Current-turn
  occurrences and physical membership; § Turn Structure → Settled last-turn
  meaning. RD-hv-umm2.104-1 supplies the separate committed-play cost rule.
- Affects: 3dd05e97-1af8-4ae9-8e1f-954eaa63e112, whose immutable text remains
  "The first character you play each turn costs 2● less and has 0✦."
- Decision: the live static sets base spark to 0 for the same physical card
  as the current source controller's first committed character play this global
  turn, only while that card is a character in play. Additive gains, Support
  and anthems still apply. Other base setters use normal timestamp order.
  This is neither a gain nor a final-spark override, and triggers no gain
  observer. The setting is present before materialization watchers.
- Lifetime: the static applies live, including a first play that occurred
  before its source arrived or its condition became true. Source departure,
  loss or false condition ends it. Same-turn departure/reentry of the physical
  card requalifies; the next normal or extra global turn selects a fresh
  cohort for both players. A control change of the subject does not erase
  who played it. A control change of the source selects that controller's
  cohort. Ordinary outside-play spark is unaffected. No past-turn cohort or
  permanent mutation accumulates.
- Occasions: captured character type and playing side determine the first
  committed play. Every successful route counts, including a Prevented play.
  Cancellation, failure and preview count for nothing. Created stack copies
  and nonplayed materializations are not plays and inherit no first status.
  A distinct physical card actually played can qualify on its own occasion.
  Cessation of the first card does not promote the second. Several held
  sources set the same base to 0 independently; their cost reductions compose
  through costModifierNth. Capacity failure creates no new play occasion.
- Why: HAS names a static change, which current rules restrict to play and
  the source's applicability. The existing layer order separates numeric
  base settings from later additive spark. "Each turn" selects the current
  turn's first play, as the binding first-play rule already counts it, without
  adding an unstated permanent grant or collecting every past turn's first.
  Physical identity follows Dreamtides' zone rules rather than MTG new-object
  identity. The native parent adopted this ruling at 2026-10-15T04:56:54Z,
  before a public form, state schema or fixture was selected.
- Step 2 evidence: original prototype object
  8b1d9e8243b0ed114d47872dc03c6d97b0e1f7c6, basic-automation.ts
  planCardPlay lines 174–225, spends the printed energy component. The
  corresponding battle-events.ts search for this UUID supplies no rule for
  this clause. This is a bounded absence observation, not a repository-wide
  proof; sandbox movement is not normative precedent.
- Step 3 evidence: read-only predecessor revision
  0d6afa7dc2eef6048264ffd634da1c2b97886b12,
  client/Assets/StreamingAssets/Tabula/dreamsigns.toml lines 32–37 gives the
  same UUID different text: first character costs 0● and its spark becomes 1.
  Its distinct Flash Powder name belongs to a different UUID. Names supply
  no identity evidence.
  ability_data/src/static_ability.rs and the static parser offer spark bonus
  and equal-count forms, with no unchanged-text precedent for this clause.
- Step 4 evidence: [official rules page](https://magic.wizards.com/en/rules)
  links the [Comprehensive Rules effective September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
  verified October 15, 2026. CR 613.4b/c separates a numeric setting from
  subsequent additive modifications; CR 611.3a/b makes static application
  live while its source applies; CR 611.3c applies entry characteristics
  before entry triggers. These analogues support the layer and live timing,
  without claiming an exact MTG equivalent for the printed each-turn clause.
- Scope: RD-hv-umm2.611-1 is gain-only and expressly excludes this setter.
  RD-hv-umm2.624-1 settles Silver Key's separate original-entry permanent
  additive gain; it does not define this live Flash base setter. The separate
  gain composes after the base setting and persists through same-turn replay. Original hv-umm2.251 retains this production
  UUID and its complete authoring, batch, sweep and judged acceptance.
