# hv-umm2.136 pre-existing observations

`src/engine/effects/primitives/contracts/return-to-hand.contracts.ts` pins `returnToHand` only for a character whose controller is its owner. No contract covers a returned character under Gain control, whose owner's hand differs from its controller's (RD-hv-umm2.136-1). The behavior comes from `moveInstance` in `src/engine/rules/zones.ts` relocating to the instance's owner; the contracts module is outside this bead's areas.
