import type { TransfigurationType } from "../../types/journey";
import type { TransfigurationFormDefinition } from "../../types/transfiguration-data";

export function transfigurationFormFixture(
  id: TransfigurationType,
): TransfigurationFormDefinition {
  return {
    id,
    glossaryUuid: "00000000-0000-4000-8000-000000000001",
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
