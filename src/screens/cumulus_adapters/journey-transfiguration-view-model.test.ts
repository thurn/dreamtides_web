import { describe, expect, it } from "vitest";
import { testDreamsignId, testDreamscapeId, testGuideId, testGuideArtKey } from "../../types/test-identities";
import { parseDeckEntryId } from "../../types/identifiers";
import { makeJourneyContent } from "../../session/providers/register-game-providers.fixtures";
import { stateWithSites, makeSite, SITE_ID } from "../../rules/journey/sites-fixtures";
import { buildJourneyTransfigurationView } from "./journey-transfiguration-view-model";

describe("journey transfiguration view projection", () => {
  it("keeps concrete duplicate entry identities and only offers applicable unformed cards", () => {
    const content = makeJourneyContent();
    content.guides = [{ id: testGuideId("guide"), name: "", homeDreamscapeId: testDreamscapeId("home"), siteType: "Transfiguration",
      portraitSource: "", artKey: testGuideArtKey("guide"), headTargetX: 0.5, dialogue: { site: [] }, homeSpecialty: "" }];
    const cardNumber = [...content.cardDatabase.keys()][0], source = testDreamsignId("random-form-source");
    const state = stateWithSites([makeSite("Battle")], { deck: ["one", "two", "formed"].map((id) => ({ entryId: parseDeckEntryId(id), cardNumber,
      transfiguration: id === "formed" ? "Kindled" : null, isBane: false })), screen: { type: "journeyTransfiguration", choice: { kind: "afterBattle",
        siteId: SITE_ID, sources: [{ kind: "transfiguration", dreamsignId: source, heldIndex: 2, maxCount: 3 }], index: 0, returnTo: "atlas" } } });
    const view = buildJourneyTransfigurationView(state.journey, content);
    expect(view?.cards.map(({ entryId }) => entryId)).toEqual(["one", "two"]);
    expect(view).toMatchObject({ maxCount: 3, dreamsignId: source, heldIndex: 2, choiceIndex: 0 });
    expect(buildJourneyTransfigurationView(stateWithSites([makeSite("Battle")]).journey, content)).toBeNull();
  });
});
