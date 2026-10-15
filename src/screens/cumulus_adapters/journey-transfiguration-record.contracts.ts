import { describe, expect, it } from "vitest";
import { toDeckCardView } from "./mobile-deck-view-model";
import { character, data, entry } from "../../rules/journey/journey-transfiguration-record.fixtures";
describe("chronological deck presentation", () => {
 it("shows all applications before permanent bonuses and keeps the primary style", () => {
  const held = entry(undefined, { sparkBonus: 2 }); const view = toDeckCardView(data, held, new Map([[character.cardNumber, character]]));
  expect(view?.model.displaySnapshot.spark).toBe(14);
  expect(view?.model.transfiguration).toMatchObject({ type: "Kindled", applications: held.transfigurationApplications!.map(application => ({ application })) });
 });
});
