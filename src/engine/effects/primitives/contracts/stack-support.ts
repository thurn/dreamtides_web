import { createEngine } from "../../../engine";
import { DSL_CARDS } from "../../../testing/dsl-cards";
import { STACK_CARDS, SYNTHETIC_EMBLEMS } from "../../../testing/stack-cards";
import { SYNTHETIC, testCatalog } from "../../../testing/synthetic-cards";

export const engine = createEngine(testCatalog([...DSL_CARDS, ...STACK_CARDS], SYNTHETIC_EMBLEMS));

export const v = SYNTHETIC;

export const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];
