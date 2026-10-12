/** A stable public abandonment-cost driver for content interaction scenarios. */
import type { EngineCardDefinition } from "../../engine/catalog";
import { abandonCost, activated } from "../../engine/dsl/builders";
import { sequence } from "../../engine/effects/primitives";
import { SYNTHETIC as v, syntheticId } from "../../engine/testing/synthetic-cards";

export const SYNTHETIC_ABANDONER: EngineCardDefinition = {
  ...v.vanilla1,
  id: syntheticId(17890),
  status: "authored",
  abilities: () => [activated([abandonCost()], sequence())],
};
