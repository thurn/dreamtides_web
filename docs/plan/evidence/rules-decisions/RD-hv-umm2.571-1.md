# RD-hv-umm2.571-1: Maximum-energy effects change production independently of current energy

- Ladder: 2 (actual prototype rule). At `8b1d9e8243b0ed114d47872dc03c6d97b0e1f7c6`, `src/rules/battle/dreamwell-effects-table.ts` L386–397 authors only `ADJUST_MAX_ENERGY +1` for the opponent of `a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf`. The actual handler in `src/rules/battle/apply-debug-edit.ts` L201–219 changes maximum and preserves current. These are an authored card effect and its implemented rule, rather than an arbitrary sandbox edit.
- rules.md: § Energy → Maximum ● and current ●.
- Affects: `a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf` (Dreamwell bonus); `d2a3d344-613c-449e-9a87-0f720a85585d` (base and amplified).
- Why: Maximum ● is production and current ● is the spendable pool. The prototype rule and the printed maximum-energy clauses support changing production independently. The same primitive semantics apply to either recipient relative to either controller, including a current pool below or above maximum.

The Phase 5.3 port evidence in `docs/plan/evidence/legacy-behavior.md`
records the maximum-only opponent effect at DWT L386–397 and the separate
full reveal refill in its Energy integration note. `gainMaxEnergy` evaluates
the authored amount and routes it to the maximum argument of `effectEnergy`
with a current delta of zero. `effectEnergy` preserves independent zero
floors and logs actual deltas through the existing `energyChanged` event.

The normal refresh in `src/engine/rules/turn.ts` sets current to maximum;
`src/engine/rules/dreamwell.ts` separately adds `energyAdded` and refreshes
current to the resulting maximum before bonus effects. Both refresh rules
apply independently of the maximum-only primitive. Current-energy effects
continue to affect only the current pool. Printed fields, Dreamwell tier
construction, `energyAdded`, event schemas and serialized state are preserved.
