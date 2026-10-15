# RD-hv-umm2.722-1: Guaranteed physical cards occupy ordinary opening-hand slots

- Ladder: 5 (simplest reading consistent with a guarantee that a selected physical card is always in the opening hand).
- rules.md: § Turn Structure → Guaranteed opening cards; Completed opening hands.
- Affects: the public engine `BattleInit.guaranteedOpeningHand` declaration for either side; host content bindings are outside this prerequisite.
- Why: The ordinary opening count can be reduced to zero, and several held sources can select either the same original slot or distinct slots. The ordinary deal draws `max(ordinary opening count, distinct selected slots)`. Repeated applications to one slot draw it once with all source attribution. This satisfies each guarantee while keeping the usual hand count whenever it accommodates every selected slot.

The selected IDs come from the actual allocated original input deck before both normal full-deck shuffles. Distinct selected instances move to the front in held-source order after those shuffles. The remaining instances keep their shuffled relative order, and every draw uses the ordinary draw primitive. Extra groups, starting energy, opening completion occasions and first-turn sequencing follow their existing rules. Prepared Draw, Dawn and Day setups accept empty declarations and reject nonempty guarantees because they have no opening-hand occasion.

Authority: the parent adopted this finite D10 step 5 ruling in the native hv-umm2.722 write grant. The source-first inspection found the ordinary five-card opening rule and no implemented guarantee precedent; no specific Magic analog supplies the unresolved count rule. No printed content is changed here.
