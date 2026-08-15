import { assertLocalized } from "@trox/runtime";
import type { LocalizedDreamsign } from "../components/hud/Dreamsign";
import { testDreamsignId } from "../../types/test-identities";
import type { DreamsignId } from "../../types/identifiers";

type DreamsignFixtureInput = {
  readonly name: string;
  readonly effectDescription?: string | null;
  readonly imageName?: string;
  readonly imageAlt?: string;
} & (
  | { readonly id: DreamsignId; readonly idSeed?: never }
  | { readonly idSeed: string; readonly id?: never }
);

/** Build presentation-ready Dreamsign data from synthetic test copy. */
export function localizedDreamsignFixture(
  input: DreamsignFixtureInput,
): LocalizedDreamsign {
  return {
    id: input.id ?? testDreamsignId(input.idSeed),
    name: assertLocalized(input.name),
    effectDescription:
      input.effectDescription === null
        ? null
        : assertLocalized(input.effectDescription ?? `${input.name} effect.`),
    ...(input.imageName === undefined ? {} : { imageName: input.imageName }),
    imageAlt: assertLocalized(input.imageAlt ?? input.name),
  };
}
