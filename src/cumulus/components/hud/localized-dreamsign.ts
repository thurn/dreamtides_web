import type { Dreamsign } from "../../../types/journey";
import { requireDreamsignId } from "../../../data/dreamsigns";
import type { LocalizedDreamsign } from "./Dreamsign";

/** Convert canonical Dreamsign content into the localized Cumulus contract. */
export function localizedDreamsign(
  dreamsign: Dreamsign,
  context: string,
): LocalizedDreamsign {
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
