# RD-hv-adeo-1: Instruction-filtered discard counts snapshot effective hand types

- Ladder: not invoked; normative rules settle the clause.
- rules.md: § Zones → References to cards in a zone and Discarding one or more cards; § Zone Changes → Cards an effect moved.
- Affects: 58f96494-87ec-4145-9e1c-95951d0ab711 (base and amplified; content authored by hv-umm2.162).
- Why: References match a card by its current characteristics, including a changed type. A discard occasion consists of the actual physical cards whose hand it leaves, including created-card cessation and zone replacements. An instruction-local filtered count applies those rules to the selected cohort immediately before departure, then retains the count through subsequent zone changes. A journey type change therefore governs matching rather than the printed card type. Separate instructions and payment occasions retain independent captures. No production entity is authored by this prerequisite.

The implementation records selected branded instance IDs and their effective card types in the resolving effect's transient moved-card record, publishes after the canonical discard call succeeds, and reconstructs the record on copies and prompt replay. The contract uses synthetic definitions and deck-entry type changes, with no production catalog or copy assertions.
