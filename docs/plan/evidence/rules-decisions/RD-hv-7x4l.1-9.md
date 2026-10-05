# RD-hv-7x4l.1-9: A card banished until end of turn returns during Ending to its prior controller's leftmost open back-rank position, as a materialize
- Ladder: 1 (F3 "banish until end of turn")
- rules.md: § Keywords and Effects → Banish; § Turn Structure → Ending step 3
- Affects: 9954cede-8a16-4053-b6e9-da745f4540f5, 7be2e6d7-abff-4c44-a0c3-35460da1693c
- Why: rules.md's Banish variants did not include "until end of turn". F3 fixes the return: during Ending, to the leftmost open back-rank slot of the player who controlled it, as a materialize (exhausted unless awakened, ▸Materialized fires); if that back rank is full it stays banished, consistent with § Battlefield Capacity's "stays in its previous zone". A banished figment or created card ceases to exist (§ Created Cards, § Figments), so it has nothing to return. The return happens after the Ephemeral and Offering banishes and before exhaust clears, as engine-design § Turn structure and timing orders the Ending phase.
