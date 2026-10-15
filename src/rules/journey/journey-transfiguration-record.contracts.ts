import { describe, expect, it } from "vitest";
import { resolveDeckEntryCard } from "../../card-type-change";
import { duplicateDeckEntry, transfigureCard } from "./deck";
import { testJourneyState } from "../../testing/journey-genesis";
import { character, data, entry, actualProvider } from "./journey-transfiguration-record.fixtures";
describe("complete chronological journey records", () => {
 it("applies repeated forms before permanent bonuses without mutating inputs", () => {
  const held = entry(undefined, { sparkBonus: 2 }); const before = JSON.stringify(held);
  expect(resolveDeckEntryCard(data, character, held).spark).toBe(14);
  expect(JSON.stringify(held)).toBe(before);
 });
 it("retains complete independent records through physical copy and clears them on administrative replacement", () => {
  const held = entry(); const journey = { ...testJourneyState(), deck: [held] };
  const copied = duplicateDeckEntry(journey, { entryId: held.entryId }, { seq: 81 })!;
  expect(copied.deck[1]).toMatchObject({ transfigurationApplications: held.transfigurationApplications });
  expect(copied.deck[1].entryId).not.toBe(held.entryId);
  expect(transfigureCard(journey, { entryId: held.entryId, transfiguration: "Empowered" })!.deck[0]).not.toHaveProperty("transfigurationApplications");
 });
 it("preserves scalar-only resolution and omission", () => {
  const { transfigurationApplications: _, ...legacy } = entry(undefined, { sparkBonus: 2 });
  expect(resolveDeckEntryCard(data, character, legacy).spark).toBe(8);
  expect(JSON.stringify(legacy)).not.toContain("transfigurationApplications");
 });
 it("offers an explicit semantic capability and appends a lawful formed card", () => {
  const provider = actualProvider(); const held = entry([{ form: "Kindled" }]);
  expect(provider.validateRecord?.(held)).toBe(true);
  expect(provider.apply?.(held, "Kindled")).toMatchObject({ ok: true, value: { transfiguration: "Kindled", transfigurationApplications: [{ form: "Kindled" }, { form: "Kindled" }] } });
 });
});
