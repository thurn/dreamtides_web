/**
 * Shared fixtures for the tooling tests: pending entities and the engine over
 * them.
 */
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { DSL_CARDS } from "./dsl-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";
import { moveInstance } from "../rules/zones";

/** A pending 1● event and a pending 2● 2✦ character. */
export const pendingEvent: EngineCardDefinition = { ...SYNTHETIC.event1, id: syntheticId(904), status: "pending" };
export const pendingCharacter: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(905), status: "pending" };
/** "Put the top card of your deck into your void", moving it with no event: a primitive with a presentation gap. */
export const silentBanish: EngineCardDefinition = {
  ...SYNTHETIC.event1,
  id: syntheticId(906),
  synthetic: {
    resolve: (ctx, item) => {
      const [top] = ctx.state.sides[item.controller].deck;
      if (top !== undefined) moveInstance(ctx, top, "banished");
    },
  },
};
export const engine = createEngine(testCatalog([...DSL_CARDS, pendingEvent, pendingCharacter, silentBanish]));
