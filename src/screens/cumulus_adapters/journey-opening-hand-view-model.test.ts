import { afterEach, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { MUG, openingContent, openingInitial, openingSign, openingEntry } from "../../rules/journey/journey-battle-init-fixtures";
import { buildJourneyOpeningHandView } from "./journey-opening-hand-view-model";

afterEach(clearGameProviders);
it("projects canonical current Events by physical identity and refuses an unavailable catalog or source", () => {
  const content = openingContent(), journey = openingInitial({ dreamsigns: [openingSign()] }).journey;
  const permission = { dreamsignId: MUG, heldIndex: 0, choiceIndex: 1, permissionSeq: 12 };
  const view = buildJourneyOpeningHandView(journey, content, permission);
  expect(view?.cards.map((card) => card.entryId)).toEqual(journey.deck.slice(0, 2).map((entry) => entry.entryId));
  expect(view).toMatchObject(permission);
  expect(buildJourneyOpeningHandView({ ...journey, deck: [openingEntry("only-character", 2)] }, content, permission)?.cards).toEqual([]);
  expect(buildJourneyOpeningHandView({ ...journey, deck: [openingEntry("unavailable", 99)] }, content, permission)).toBeNull();
  expect(buildJourneyOpeningHandView({ ...journey, dreamsigns: [] }, content, permission)).toBeNull();
});
