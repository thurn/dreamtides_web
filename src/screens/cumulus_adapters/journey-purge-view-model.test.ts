import { describe, expect, it } from "vitest";
import { testDreamsignId, testDreamscapeId, testGuideId, testGuideArtKey } from "../../types/test-identities";
import { parseDeckEntryId } from "../../types/identifiers";
import { makeJourneyContent } from "../../session/providers/register-game-providers.fixtures";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { journeyEssence } from "../../rules/journey/journey-essence";
import { stateWithSites, makeSite, SITE_ID } from "../../rules/journey/sites-fixtures";
import { buildJourneyPurgeView } from "./journey-purge-view-model";
const SOURCE = testDreamsignId("picker-source"), STAR = testDreamsignId("picker-multiplier");
function content() {
  const value = makeJourneyContent(); value.guides = [{ id: testGuideId("guide"), name: "", homeDreamscapeId: testDreamscapeId("home"),
    siteType: "Purge", portraitSource: "", artKey: testGuideArtKey("guide"), headTargetX: 0.5, dialogue: { site: [] }, homeSpecialty: "" }];
  return value;
}
describe("journey purge view projection", () => {
  it("keeps exact entry identity/order including repeated card faces and derives live collection", () => {
    const c = content(), number = [...c.cardDatabase.keys()][0];
    const s = stateWithSites([makeSite("Essence")], { deck: ["one", "two"].map((id) => ({ entryId: parseDeckEntryId(id), cardNumber: number, transfiguration: null, isBane: false })),
      dreamsigns: [{ id: STAR, name: "", effectDescription: "" }], siteRuntime: { [SITE_ID]: { kind: "essence", amount: 11, accepted: false } },
      screen: { type: "journeyPurge", choice: { kind: "essenceSite", siteId: SITE_ID, dreamsignId: SOURCE, heldIndex: 3, count: 2 } } });
    const registry = createJourneyModifierRegistry([journeyEssence(STAR, { kind: "multiplyEssenceSiteGain", factor: 4 })]);
    const view = buildJourneyPurgeView(s.journey, c, registry);
    expect(view?.cards.map(({ entryId }) => entryId)).toEqual(["one", "two"]);
    expect(view).toMatchObject({ minCount: 2, maxCount: 2, collectAmount: 44, dreamsignId: SOURCE, heldIndex: 3, choiceIndex: 0 });
    expect(buildJourneyPurgeView(stateWithSites([makeSite("Essence")]).journey, c)).toBeNull();
  });
});
