import type { Dreamsign } from "../../../types/journey";
import { requireDreamsignId } from "../../../data/dreamsigns";
import type { LocalizedDreamsign } from "./Dreamsign";
import { localizedSourceText } from "../../../runtime/localization/runtime";
import { localizedDreamsignImageAlt } from "../../../runtime/localization/runtime-templates.generated";

/** Convert canonical Dreamsign content into the localized Cumulus contract. */
export function localizedDreamsign(
  dreamsign: Dreamsign,
  context: string,
): LocalizedDreamsign {
  const name = localizedSourceText(dreamsign.name);
  return {
    id: requireDreamsignId(dreamsign, context),
    name,
    effectDescription:
      dreamsign.effectDescription === ""
        ? null
        : localizedSourceText(dreamsign.effectDescription),
    ...(dreamsign.imageName === undefined
      ? {}
      : { imageName: dreamsign.imageName }),
    imageAlt:
      dreamsign.imageAlt === undefined || dreamsign.imageAlt === ""
        ? name
        : (localizedDreamsignImageAlt(dreamsign.imageAlt) ??
          localizedSourceText(dreamsign.imageAlt)),
  };
}
