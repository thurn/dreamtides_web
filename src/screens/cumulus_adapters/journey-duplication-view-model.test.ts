import { describe, expect, it } from "vitest";
import { testDreamsignId, testDreamscapeId, testGuideId, testGuideArtKey } from "../../types/test-identities";
import { parseDeckEntryId } from "../../types/identifiers";
import { makeJourneyContent } from "../../session/providers/register-game-providers.fixtures";
import { stateWithSites, makeSite, SITE_ID } from "../../rules/journey/sites-fixtures";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { journeyDuplication } from "../../rules/journey/journey-duplication";
import { buildJourneyDuplicationView } from "./journey-duplication-view-model";

describe("earned duplication view projection", () => {
  it("projects separate physical entries from a lost earned source and refuses a foreign purpose", () => {
    const content = makeJourneyContent(), source = testDreamsignId("earned-copy-source");
    content.guides = [{ id: testGuideId("duplication-guide"), name: "", homeDreamscapeId: testDreamscapeId("home"), siteType: "Duplication", portraitSource: "", artKey: testGuideArtKey("duplication-guide"), headTargetX: 0.5, dialogue: { site: [] }, homeSpecialty: "" }];
    const cardNumber = [...content.cardDatabase.keys()][0], registry = createJourneyModifierRegistry([journeyDuplication(source, { kind: "afterBattleDuplication" })]);
    const { journey } = stateWithSites([{ ...makeSite("Battle"), isVisited: true }], { currentDreamscape: null,
      deck: ["first", "same-card-second"].map((entryId) => ({ entryId: parseDeckEntryId(entryId), cardNumber, transfiguration: null, isBane: false })),
      screen: { type: "journeyDuplication", choice: { kind: "afterBattle", siteId: SITE_ID, sources: [{ kind: "duplication", dreamsignId: source, heldIndex: 4, earnedSeq: 7 }], index: 0, returnTo: "atlas" } } });
    journey.atlas.layers = [Object.values(journey.atlas.nodes).map((node) => node.id)];
    const view = buildJourneyDuplicationView(journey, content, registry);
    expect(view?.cards.map((card) => card.entryId)).toEqual(["first", "same-card-second"]);
    expect(view).toMatchObject({ dreamsignId: source, heldIndex: 4, choiceIndex: 0, earnedSeq: 7 });
    expect(buildJourneyDuplicationView({ ...journey, screen: { type: "atlas" } }, content, registry)).toBeNull();
    if (journey.screen.type !== "journeyDuplication") throw new Error("Missing fixture");
    expect(buildJourneyDuplicationView({ ...journey, screen: { ...journey.screen, choice: { ...journey.screen.choice, sources: [{ kind: "duplication", dreamsignId: testDreamsignId("unregistered"), heldIndex: 4, earnedSeq: 7 }] } } }, content, registry)).toBeNull();
  });
});
