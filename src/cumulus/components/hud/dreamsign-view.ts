import type { Dreamsign } from "../../../types/journey";
import { requireDreamsignId } from "../../../data/dreamsigns";
import type { DreamsignView } from "./Dreamsign";

/** Convert canonical Dreamsign content into the Cumulus presentation contract. */
export function toDreamsignView(
  dreamsign: Dreamsign,
  context: string,
): DreamsignView {
  const name = dreamsign.name;
  return {
    id: requireDreamsignId(dreamsign, context),
    name,
    effectDescription:
      dreamsign.effectDescription === "" ? null : dreamsign.effectDescription,
    ...(dreamsign.imageName === undefined
      ? {}
      : { imageName: dreamsign.imageName }),
    imageAlt:
      dreamsign.imageAlt === undefined || dreamsign.imageAlt === ""
        ? name
        : dreamsign.imageAlt,
  };
}
