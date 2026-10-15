import { afterEach, expect, it } from "vitest";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { registerJourneyTransfigurationProvider } from "../../rules/journey/journey-transfiguration";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { initial, entry, accepted, TEETH, JELLY, clear } from "../../rules/journey/journey-rewards272-fixtures";
import { testCardId } from "../../types/test-identities";
import { buildJourneyStarterPurgeView } from "./journey-starter-purge-view-model";
afterEach(clear);
it("uses canonical starter metadata/composite eligibility and projects separate earned physical identities", () => {
  const cards = [makeAuguryTestCard({ id: testCardId("provider-starter"), cardNumber: 1, isStarter: true }),
    makeAuguryTestCard({ id: testCardId("provider-role"), cardNumber: 2, roles: ["starter-deck"] }),
    makeAuguryTestCard({ id: testCardId("provider-nonstarter"), cardNumber: 9 })];
  const content = { ...makeAuguryTestContent({ cards }), transfigurationData: transfigurationFixture() };
  const before = initial([], [entry(1, 1), entry(2, 1), entry(3, 2), entry(9, 9)]);
  const provider = createJourneyTransfigurationProvider(content); registerJourneyTransfigurationProvider(provider);
  expect(provider.resolve(before.journey.deck[0])).toMatchObject({ starter: true, perfectedEligible: true });
  expect(provider.resolve(before.journey.deck[2])).toMatchObject({ starter: true, perfectedEligible: true });
  expect(provider.resolve(before.journey.deck[3])).toMatchObject({ starter: false });
  const gained = accepted(before, "ADD_DREAMSIGN", { dreamsignId: TEETH });
  const view = buildJourneyStarterPurgeView(gained.journey, content);
  expect(view?.cards.map((card) => card.entryId)).toEqual(before.journey.deck.slice(0, 3).map((entry) => entry.entryId));
  expect(view).toMatchObject({ heldIndex: 0, choiceIndex: 0, permissionSeq: 10, maxCount: 4 });
  const jelly = accepted(before, "ADD_DREAMSIGN", { dreamsignId: JELLY });
  expect(jelly.journey.deck.map((entry) => entry.transfiguration)).toEqual(["Perfected", "Perfected", "Perfected", null]);
  expect(provider.resolve(jelly.journey.deck[0])?.perfectedEligible).toBe(false);
  expect(buildJourneyStarterPurgeView(before.journey, content)).toBeNull();
});
