import { describe, expect, it } from "vitest";
import { remapGameCardModelTypes, type TypeRemapTextMetadata } from "./card-type-remap";
import { makeAuguryTestCard } from "../journey_v2/testing/fixtures";
import { testCardId } from "../types/test-identities";
import { parseCardSubtype, parseCardName } from "../types/card-identity";
import { parseFigmentId } from "../engine/state/ids";
import { TRANSFIGURE_MARK_END as end, TRANSFIGURE_MARK_START as start } from "./transfigure-markers";
import { buildTransfigurationDisplay } from "../transfiguration/transfiguration-logic";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
const original = testCardId("text-original"), named = testCardId("text-named"), duplicate = testCardId("text-duplicate-name");
const figment = parseFigmentId(testCardId("text-original-figment")), target = parseFigmentId(testCardId("text-target-figment"));
const data: TypeRemapTextMetadata = {
  types: ["Warrior", "Mage", "Shadow", "Spirit Animal"],
  cards: [{ id: original, name: "Synthetic Source" }, { id: named, name: "Warrior Sage" }, { id: duplicate, name: "Warrior Sage" }], referencedCards: [original, named],
  figments: [{ id: figment, name: "Sentinel", subtype: "Warrior", typeRemapTarget: false }, { id: target, name: "Shadow", subtype: "Shadow", typeRemapTarget: true }], createdFigments: [figment],
};
const model = (renderedText: string) => ({ cardId: original, displaySnapshot: makeAuguryTestCard({ id: original, cardNumber: 1, name: parseCardName("Synthetic Source"), subtype: "Warrior", renderedText }) });
describe("semantic character-type display substitution", () => {
  it("substitutes whole singular/plural/multiword type words with source case and preserves proper references", () => {
    const source = model("Warriors follow a warrior and SPIRIT ANIMALS. A Warrior Sage waits; warriorlike remains.");
    const before = structuredClone(source), mapped = remapGameCardModelTypes(source, "Mage", data);
    expect(mapped.displaySnapshot.renderedText).toBe("Mages follow a mage and MAGES. A Warrior Sage waits; warriorlike remains.");
    expect(mapped.cardId).toBe(original); expect(mapped.displaySnapshot.subtype).toBe("Warrior"); expect(source).toEqual(before);
    expect(remapGameCardModelTypes(source, undefined, data)).toBe(source);
  });
  it("changes UUID-resolved named figment creation only for a canonical figment choice", () => {
    const source = model("Materialize a Sentinel figment. Give a warrior +1✦. Create a Warrior Sage in your hand.");
    expect(remapGameCardModelTypes(source, "Shadow", data).displaySnapshot.renderedText).toBe("Materialize a Shadow figment. Give a shadow +1✦. Create a Warrior Sage in your hand.");
    expect(remapGameCardModelTypes(source, "Mage", data).displaySnapshot.renderedText).toBe("Materialize a Sentinel figment. Give a mage +1✦. Create a Warrior Sage in your hand.");
    const literal = { ...data, figments: [{ id: figment, name: "Warrior", subtype: "Warrior" as const }], createdFigments: [figment] };
    expect(remapGameCardModelTypes(model("Materialize two 3✦ warrior figments. Your warrior figments gain +1✦."), "Mage", literal).displaySnapshot.renderedText).toBe("Materialize two 3✦ warrior figments. Your mage figments gain +1✦.");
  });
  it("keeps markup well formed across a substituted word and transforms the highlighted model too", () => {
    const source = model(`Give a war${start}rior${end} +1✦. {chosen character type} stays chosen.`);
    const form = buildTransfigurationDisplay(transfigurationFixture(), source.displaySnapshot, "Kindled").display;
    const mapped = remapGameCardModelTypes({ ...source, transfiguration: { ...form, markedText: `${start}Warriors${end} and [purple]spirit animals[/purple].` } }, "Mage", data);
    const visible = (text: string) => text.split(start).join("").split(end).join("");
    expect(visible(mapped.displaySnapshot.renderedText)).toBe("Give a mage +1✦. {chosen character type} stays chosen.");
    expect(mapped.transfiguration.markedText).toBe(`${start}Mages${end} and [purple]mages[/purple].`);
    expect(mapped.displaySnapshot.renderedText.match(new RegExp(start, "gu"))).toHaveLength(1);
    expect(mapped.displaySnapshot.renderedText.match(new RegExp(end, "gu"))).toHaveLength(1);
  });
  it("supports irregular and already-plural type vocabulary at the display boundary", () => {
    const vocabulary = { ...data, types: ["Child", "Companions", "Warrior"] as const };
    expect(remapGameCardModelTypes(model("Children and warriors."), "Child", vocabulary).displaySnapshot.renderedText).toBe("Children and children.");
    expect(remapGameCardModelTypes(model("Warriors aid a warrior."), "Companions", vocabulary).displaySnapshot.renderedText).toBe("Companions aid a companions.");
  });
  it("escapes authored type punctuation rather than interpreting it as a pattern", () => {
    const authored = parseCardSubtype("A+B");
    expect(remapGameCardModelTypes(model("An A+B helps; AAAB stays."), "Mage", { ...data, types: [authored] }).displaySnapshot.renderedText).toBe("An MAGE helps; AAAB stays.");
  });
});
