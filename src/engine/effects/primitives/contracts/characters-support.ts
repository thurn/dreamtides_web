import { createEngine } from "../../../engine";
import { DSL_CARDS } from "../../../testing/dsl-cards";
import { SYNTHETIC, testCatalog } from "../../../testing/synthetic-cards";
import { STACK } from "../../../testing/stack-cards";

export const engine = createEngine(testCatalog([...DSL_CARDS, STACK.preventCharacterToDeck]));

export const v = SYNTHETIC;

export const deck = Array.from({ length: 5 }, () => v.vanilla1.id);
