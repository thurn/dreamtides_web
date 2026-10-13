# hv-9vy4 encountered source issues

The original hv-umm2.580 source claim treated `DraftState.draftPoolCopiesByCard` as the immutable run source. Current `processPlayerPickInternal` calls `removeRarityFromPool` on a capped pick and removes that rarity from both mutable draft maps. `createInitialDraftState` sanitizes a separate map from the retained `resolvedPackage.draftPoolCopiesByCard`. The real public capped-pick witness in this bead reproduces that causal distinction; the original580 receipts and cold-review findings remain separate historical evidence. Current580RD, rules and engine-design source statements are corrected within this repair.

`src/types/draft.ts` still describes the cap-pruned recreatable map as immutable. That comment was encountered as a causal documentation issue. Active267 owns this type file, so it remains read-only here; current run-source statements are corrected in the admitted documentation above. No draft rarity policy or foreign prerequisite changes are made.

`src/draft/draft-engine.ts:491` emits `cardName` in `draft_pick_player` when logging is enabled. The encounter is recorded against the UUID-only production logging invariant; this repair does not expand into the draft logging body.

Legacy created cards without captured eligible choices cannot supply their exact historical filter to the sampler. Their existing declared-pool/deck approximation remains qualified, including the previously recorded fixed-created empty-deck/anonymous-descriptor gap in hv-umm2.580. No general catalog fallback, current-Dreamsign guess or nonpool provenance repair is included.

The new-member diagnostic uses deliberately conflicting remembered snapshots derived from genuine created-hand output. These malformed saved inputs expose a captured-domain load consistency gap, distinct from genuine observed-member controls. Incompatible remembered owner already fails existing saved guards; created=false and changed immutable printing require the narrow captured-domain relational check. Stale variant/status/effect observations and absent-domain legacy records retain their existing semantics.

`src/data/journey-content.ts` introduces RunPoolContext with a comment calling its index “card-name -> card-number”. The actual `idIndex` is explicitly UUID-keyed and the producer resolves UUIDs; this is an encountered comment inconsistency, not an observed name-keyed identity map. That read-only source body stays outside this repair.
