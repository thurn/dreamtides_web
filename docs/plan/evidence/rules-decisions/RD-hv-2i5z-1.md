# RD-hv-2i5z-1: Optional void-return payment requires a remaining void card

- Ladder: 5 (simplest reading consistent with the canonical text; rung 4's
  impossible-choice analog supports this reading but its separate payment
  template does not decide it).
- rules.md: § Costs, Requirements, and X → Costs while resolving.
- Affects: 4733876a-d6b1-48d2-b322-5f71aee9f3d6, including its created copies;
  the synthetic plural optionalPayment role fixture. The unpaid returns on
  3811a0a2-66af-4c06-b179-948dfa9b2ee3 and
  ed02e610-2e68-4457-95a6-c7c6db60ca40 retain the existing void-reference rule.
- Why: “You may pay 1● to return this character to hand” offers one optional
  return for an energy payment. With no named card remaining in a void, that
  return has no eligible object, so it offers no payment and spends no energy.
  A plural reference with some remaining cards returns those for one payment.
  This clarification concerns only that return, not every paid effect.

## Ladder evidence

1. D-, C-, and P-entries do not settle whether an empty void-return instruction
   offers payment. D10 supplies the ladder; P10 excludes sandbox shortcuts.
   Existing Costs while resolving already settles timing, complete affordability
   and conditional execution. Zones, Targeting, Zone Changes and
   RD-hv-umm2.342-1 settle current void eligibility, identity, created-card
   disappearance, last-controller payment and owner-hand destination.
2. Archived semantic prototype OID
   `8b1d9e8243b0ed114d47872dc03c6d97b0e1f7c6` retains this exact canonical text
   in `src/content/cards/returned-vanguard-4733876a.ts:7`. Its authored semantic
   registry `src/rules/battle/battle-card-effects-table.ts` contains no entry
   for that UUID or payment-and-return implementation; the audited
   `docs/plan/evidence/legacy-behavior.md` supplies no such precedent. Manual
   zone edits are not an actual implementation of this rule.
3. Read-only reference Rust HEAD
   `0d6afa7dc2eef6048264ffd634da1c2b97886b12` documents resolution-time
   `trigger_cost` at `rules_engine/src/ability_data/src/effect.rs:65–70`.
   `rules_engine/src/battle_mutations/src/effects/apply_effect.rs:174–175`
   and `:243–244` leave trigger-cost execution as `todo!`.
   `rules_engine/tests/parser_tests/tests/card_effect_parser_tests.rs:470–490`
   parses the analogous Dissolved paid return but does not execute it.
   `docs/battle_rules/battle_rules.md` has no resolution-payment eligibility
   rule to apply unchanged. These are representation/parser evidence, not
   implemented behavior, and therefore do not supply a rung-3 decision.
4. The [official MTG Comprehensive Rules, effective 2026-09-25](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
   §§118.12 and 608.2c–d, distinguish a payment followed by an “If you do”
   effect from a choice that cannot be performed. The
   [official Relentless Dead printing](https://mtg-jp.com/products/card/409881/)
   uses “you may pay” followed by a separate conditional return sentence.
   That permits considering the payment independently of the later return;
   it does not directly define Dreamtides' combined paid-return option.
   Dreamtides also preserves physical identity across zone changes.
5. The narrow combined-option reading accords with the current canonical
   wording and the existing rule that an ineligible return does nothing.
   It leaves no empty payment opportunity and permits one payment for a
   nonempty plural return. This is the deciding rung, not an appeal to the
   current primitive as authority.

The existing `returnFromVoid` implementation and synthetic contracts already
implement this decision. No engine behavior, card text or payment protocol
changes are required.
