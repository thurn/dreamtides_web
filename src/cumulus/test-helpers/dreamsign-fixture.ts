import type { DreamsignView } from "../components/hud/Dreamsign";
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
export function dreamsignViewFixture(
  input: DreamsignFixtureInput,
): DreamsignView {
  return {
    id: input.id ?? testDreamsignId(input.idSeed),
    name: input.name,
    effectDescription:
      input.effectDescription === null
        ? null
        : (input.effectDescription ?? `${input.name} effect.`),
    ...(input.imageName === undefined ? {} : { imageName: input.imageName }),
    imageAlt: input.imageAlt ?? input.name,
  };
}
