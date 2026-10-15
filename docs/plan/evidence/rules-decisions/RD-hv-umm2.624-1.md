# RD-hv-umm2.624-1: First-play entry spark belongs to the original successful entry

- rules.md: § Keywords and Effects → Materialize → First-play entry spark;
  § Spark; § Turn history; § Ability Types → Static abilities; § Durations.
- Affects: 11018e32-f47e-45fd-a8cf-3a9e3f3be71b, pending and retained for
  original hv-umm2.255's authoring and complete acceptance.
- Decision: select each controller's first actual captured character play in
  the current global turn, including the opponent's turn. Only that play's
  original physical stack visit can gain as it successfully enters play.
  Applicable functional sources, their conditions, variants and ability
  occurrences are read live at entry, including an entering own source.
  Each contributes its amount once before materialization observers. Positive
  amounts are ordinary permanent additive gains, with ordinary gain observers.
- Lifetime: the gain follows the physical card through source, control and
  zone changes. Prevention and failed entry give no gain or deferred benefit;
  a later effect entry, rematerialization, copy or same-turn replay adds none.
  A genuine first character play in a later normal or extra turn may gain anew.
  Created cards actually played from hand count; unplayed stack copies do not.
- Ladder: existing rules settle ordinary gain/base composition, permanence,
  physical identity, separate actual play/materialization counts and turn
  boundaries. Step 5 settles this entry-only clause, live source applicability,
  prevented-then-materialized exclusion and entering self-source adaptation.
  Step 4 corroborates entry timing and adjusted watcher observations only.
- Step 2: actual predeletion source 8b1d9e8243b0ed114d47872dc03c6d97b0e1f7c6:
  basic-automation.ts (542 lines) gives fixed debug movement/cost/exhaustion
  edits, excluded as sandbox precedent by P10. battle-events.ts semantic play
  1552–1740 and lifecycle scheduler 3380–3465 route the moved card UUID into
  fixed scripts. Full battle-card-effects-table.ts (598 lines) supplies
  UUID-keyed triggers and Support-only statics; these routes contain no
  Dreamsign text interpreter or Silver Key implementation. The exact old
  consumer is pending. The all-src UUID/name search corroborates this bounded
  route inspection and is not an independent absence proof.
- Step 3: read-only Rust catalog preserves this UUID/clause, but its reserves,
  deploy and Unbound materialization rules differ from current rules. Bounded
  ability/battle-mutation searches supply no implemented unchanged precedent
  settling this clause. No broad semantic absence claim is needed.
- Step 4: official Wizards rules page https://magic.wizards.com/en/rules and
  its current Sept 25, 2026 text
  https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt,
  verified 2026-10-15 UTC. CR614.1c/d, 614.12 and 603.6a/b support modifying
  entry before watchers observe characteristics. Dreamtides physical gain
  retention and general entering own-source applicability are explicit step 5
  adaptations, not imports of Magic's zone-memory or self-entry restrictions.
- Mechanics: existing first-play records plus the live pre-detach stack visit
  establish eligibility. The gain uses existing permanent gainedSpark, with
  attributed gain announcements. This decision supplies no Flash zero setter.
