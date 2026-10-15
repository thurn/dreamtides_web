import { expect, it } from "vitest";
import { createEngineCardModels } from "./engine-card-model";
import { createEngine } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { energy } from "../../engine/dsl/builders";
import { boardState } from "../../engine/testing/board";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { testCardId } from "../../types/test-identities";
it("caches remapped and plain physical models independently while preserving UUID, subtype and stats", () => {
  const card = makeAuguryTestCard({ id: testCardId("remap-model"), cardNumber: 1, cardType: "Character", subtype: "Warrior", energyCost: 2, spark: 3, renderedText: "A warrior aids warriors." });
  const engine = createEngine(createCatalog([{ id: card.id, cardType: "character", costs: [energy(2)], subtype: "Warrior", spark: 3, speed: "standard", status: "vanilla", abilities: () => [] }], []));
  const board = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [{ cardId: card.id, typeRemap: "Mage" }, card.id] } });
  const models = createEngineCardModels({ cards: new Map([[card.id, card]]), definitions: [], figment: () => undefined });
  const view = engine.view(board.state, "player"), changed = view.instances[board.ids.player.hand[0]], plain = view.instances[board.ids.player.hand[1]];
  const first = models(changed), second = models(plain);
  expect(first.displaySnapshot.renderedText).toBe("A mage aids mages."); expect(second.displaySnapshot.renderedText).toBe(card.renderedText);
  expect(first.displaySnapshot).toMatchObject({ id: card.id, subtype: "Warrior", energyCost: 2, spark: 3 });
  expect(models(changed)).toBe(first); expect(models(plain)).toBe(second); expect(first).not.toBe(second);
});
