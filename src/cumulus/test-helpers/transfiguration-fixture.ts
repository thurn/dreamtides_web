import { assertLocalized } from "@trox/runtime";
import type { TransfigurationType } from "../../types/journey";
import type { TransfigurationFormDefinition } from "../../types/transfiguration-data";
import type { LocalizedTransfigurationPresentation } from "../components/controls/transfiguration-presentation";
import { testGlossaryEntryId } from "../../types/test-identities";

export function transfigurationFormFixture(
  id: TransfigurationType,
): TransfigurationFormDefinition {
  return {
    id,
    glossaryUuid: testGlossaryEntryId(`transfiguration-${id}`),
    name: `Fixture ${id}`,
    // localization-ignore: test-only fixture mirrors authored RON presentation copy.
    description: `Fixture ${id} effect`,
    glyph: `transfiguration${id}`,
    accentColor: ["#", "222222"].join("") as `#${string}`,
    tintColor: ["#", "bbbbbb"].join("") as `#${string}`,
    pricing: { kind: "free" },
    rewardScore: { kind: "flat", value: 1 },
  };
}

export function localizedTransfigurationFormFixture(
  id: TransfigurationType,
): LocalizedTransfigurationPresentation {
  const form = transfigurationFormFixture(id);
  return {
    glossaryUuid: form.glossaryUuid,
    glyph: form.glyph,
    accentColor: form.accentColor,
    name: assertLocalized(form.name),
    description: assertLocalized(form.description),
  };
}
