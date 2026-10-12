# hv-umm2.508 pre-existing observations

## Selected cost payment order

A real synthetic character with `activated([discardCost(2)], gainEnergy(1))`, three hand instances printing the same synthetic UUID, and identical starting state accepts `[i2, i4]` and `[i4, i2]`. The chosen-cost plan in `src/engine/rules/costs.ts` retains submitted order; its discard payment emits and moves that order. After this bead's tracker repair, loop action records agree, while the forward discard events are `i2, i4`, its void is `i4, i2`, and its full state hash is `024bb0f04241d0`; reversed events are `i4, i2`, void `i2, i4`, and full hash `12c7767a41336b`. Raw confirmation is `/tmp/hv-umm2.508-cost-confirm.log` (terminal exit 0).

This issue requires a separate bounded cost-planning/payment fix. This bead covers discard effects, chosen-hand shuffle effects, and loop answer recording; the cost body stays read-only. Other selected payment shapes share the same plan path by inspection but were not exercised by this witness. Native follow-up `hv-7d93` (`chosen-cost-payment-order/phase-5`) owns that repair and serializes after this bead; shared cost-body followers and the phase gate wait on it.
