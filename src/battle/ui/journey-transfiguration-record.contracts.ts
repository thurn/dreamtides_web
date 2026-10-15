import { describe, expect, it } from "vitest";
import { battleDeckCardDefinitionFromUnknown, createBaseBattleDeckCardDefinition } from "../card-definition";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import { character, data, entry } from "../../rules/journey/journey-transfiguration-record.fixtures";
describe("structured chronological battle display", () => {
 it("preserves complete ordered descriptor metadata at the public decoder", () => {
  const held = entry(); const display = buildTransfigurationDisplay(data, character, "Kindled").display;
  const applications = held.transfigurationApplications!.map(application => ({ application, form: display.form }));
  const decoded = battleDeckCardDefinitionFromUnknown({ ...createBaseBattleDeckCardDefinition(character), transfiguration: "Kindled", transfigurationDisplay: { ...display, applications } });
  expect(decoded?.transfigurationDisplay).toMatchObject({ applications });
 });
});
