import { assertLocalized } from "@trox/runtime";
import type { LocalizedDreamsign } from "../components/hud/Dreamsign";
import { asDreamsignId } from "../../types/identifiers";

interface DreamsignFixtureInput {
  readonly id: string;
  readonly name: string;
  readonly effectDescription?: string | null;
  readonly imageName?: string;
  readonly imageAlt?: string;
}

/** Build presentation-ready Dreamsign data from synthetic test copy. */
export function localizedDreamsignFixture(
  input: DreamsignFixtureInput,
): LocalizedDreamsign {
  return {
    id: asDreamsignId(input.id),
    name: assertLocalized(input.name),
    effectDescription:
      input.effectDescription === null
        ? null
        : assertLocalized(input.effectDescription ?? `${input.name} effect.`),
    ...(input.imageName === undefined ? {} : { imageName: input.imageName }),
    imageAlt: assertLocalized(input.imageAlt ?? input.name),
  };
}
