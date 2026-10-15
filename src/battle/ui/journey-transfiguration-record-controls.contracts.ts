import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "./engine-card-model";
import { createEngine } from "../../engine/engine";
import { boardState } from "../../engine/testing/board";
import { buildDeckEntryTransfigurationDisplay } from "../../transfiguration/deck-entry-transfigurations";
import { battleDeckCardDefinitionFromUnknown, createBaseBattleDeckCardDefinition } from "../card-definition";
import { data, eventCard, character, entry, catalog } from "../../rules/journey/journey-transfiguration-record.fixtures";
import { engineDeckEntry } from "../integration/engine-battle-init";
import { transfigurationDisplayDescription, transfigurationDisplayName } from "../../runtime/transfiguration-display";
import type { DeckEntry } from "../../types/journey";
function definition(held: DeckEntry) {
 const shown = buildDeckEntryTransfigurationDisplay(data, eventCard, held)!;
 return { ...createBaseBattleDeckCardDefinition(shown.card), transfiguration: held.transfiguration, transfigurationDisplay: shown.display };
}
describe("full-history display identity controls", () => {
 it("distinguishes same UUID and primary by complete ordered history in exact lookup, cache and fallback", () => {
  const a = entry([{ form: "Inspired" }], { cardNumber: eventCard.cardNumber });
  const b = entry([{ form: "Inspired" }, { form: "Inspired" }], { cardNumber: eventCard.cardNumber });
  const c = entry([{ form: "Inspired" }, { form: "Enduring" }], { cardNumber: eventCard.cardNumber });
  const engine = createEngine(catalog), board = boardState(catalog, { active: "player", phase: "day", player: { hand: [engineDeckEntry(a, eventCard, data), engineDeckEntry(b, eventCard, data), engineDeckEntry(c, eventCard, data)] } });
  const models = createEngineCardModels({ cards: new Map([[eventCard.id, eventCard]]), definitions: [definition(a), definition(b)], figment: () => undefined });
  const views = engine.view(board.state, "player").instances; const instances = board.ids.player.hand.map(id => views[id]);
  const first = models(instances[0]), second = models(instances[1]), missing = models(instances[2]);
  expect(first.displaySnapshot.renderedText.match(/Draw a card\./g)).toHaveLength(1);
  expect(second.displaySnapshot.renderedText.match(/Draw a card\./g)).toHaveLength(2);
  expect(first).not.toBe(second); expect(models(instances[0])).toBe(first);
  expect(missing.displaySnapshot.renderedText).toBe(eventCard.renderedText); expect(missing.transfiguration).toBeUndefined();
  const altered = { ...instances[1], variant: { ...instances[1].variant, deckMods: { sparkBonus: 0, costReduction: 0, fast: true, reclaim: null, typeChange: null } } };
  expect(models(altered).transfiguration?.applications).toEqual(second.transfiguration?.applications);
 });
 it("rejects mismatched nested glyphs, first forms, snapshots, omissions and sparse descriptor arrays", () => {
  const held = entry([{ form: "Inspired" }, { form: "Inspired" }], { cardNumber: eventCard.cardNumber }); const good = definition(held);
  expect(battleDeckCardDefinitionFromUnknown(JSON.parse(JSON.stringify(good)))?.transfigurationDisplay?.applications).toEqual(good.transfigurationDisplay.applications);
  const display = good.transfigurationDisplay;
  for (const applications of [[], new Array(1), [{ ...display.applications![0], form: { ...display.applications![0].form, glyph: "transfigurationKindled" } }], [{ ...display.applications![0], application: { form: "Kindled" } }], [{ ...display.applications![0], constituents: [] }], [{ ...display.applications![0], application: { form: "Perfected", constituents: ["Inspired", "Inspired"] } }]]) {
   expect(battleDeckCardDefinitionFromUnknown({ ...good, transfigurationDisplay: { ...display, applications } })).toBeNull();
  }
  const { applications: _, ...legacyDisplay } = display; const legacy = { ...good, transfigurationDisplay: legacyDisplay };
  expect(battleDeckCardDefinitionFromUnknown(legacy)?.transfigurationDisplay).not.toHaveProperty("applications");
  expect(transfigurationDisplayName(display).split(" → ")).toHaveLength(2); expect(transfigurationDisplayDescription(display).split("\n")).toHaveLength(2);
  const plain = createBaseBattleDeckCardDefinition(character); expect(battleDeckCardDefinitionFromUnknown(plain)).toEqual(plain);
 });
});
