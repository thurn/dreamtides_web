import type { TransfigurationType } from "../../types/journey";
import type { TransfigurationFormDefinition } from "../../types/transfiguration-data";

export function transfigurationFormFixture(
  id: TransfigurationType,
): TransfigurationFormDefinition {
  return {
    id,
    glossaryUuid: "00000000-0000-4000-8000-000000000001",
    name: `Fixture ${id}`,
    effectDisclosure: "Fixture effect disclosure",
    selectedCardDescription: "Fixture selected-card description",
    accessibilityDescription: `Fixture ${id} accessibility`,
    glyph: `transfiguration${id}`,
    accentColor: ["#", "222222"].join("") as `#${string}`,
    tintColor: ["#", "bbbbbb"].join("") as `#${string}`,
    merchantAllowed: true,
    eligibility: { kind: "positiveEnergyCost" },
    operation: { kind: "halveEnergyCost", rounding: "Down", minimum: 0 },
    pricing: { kind: "free" },
    benefit: { kind: "flat", value: 1 },
  };
}
