/** Contracts of the Expert strategy context: it binds the evaluation and the AST features to one side. */
import { describe, expect, it } from "vitest";
import { cardFeatures } from "../dsl/ai-features";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { evaluate } from "./evaluation";
import { expertContext } from "./expert-contracts";
import { board, engine, entries } from "./policy.fixtures";

describe("the Expert context", () => {
  it("evaluates for its own side and reads printed card features", () => {
    const decklists = { player: entries([SYNTHETIC.vanilla1.id]), enemy: entries([SYNTHETIC.dissolveVictim.id]) };
    const { state } = board({ player: { front: [SYNTHETIC.vanilla3.id], score: 4 }, enemy: { hand: [SYNTHETIC.vanilla1.id] } });
    const view = engine.view(state, "player");
    const context = expertContext(engine, "player", decklists);
    expect(context.evaluate(view)).toEqual(evaluate(view, "player", { catalog: engine.catalog, decklists }));
    expect(context.features(SYNTHETIC.dissolveVictim.id)).toEqual(cardFeatures(SYNTHETIC.dissolveVictim));
    expect(context.features(SYNTHETIC.dissolveVictim.id)).toBe(context.features(SYNTHETIC.dissolveVictim.id));
  });
});
