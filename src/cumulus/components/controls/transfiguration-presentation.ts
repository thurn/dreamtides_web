import type { LocalizedString } from "@trox/runtime";
import { localizedSourceText } from "../../../runtime/localization/runtime";
import type { TransfigurationFormDefinition } from "../../../types/transfiguration-data";

export type LocalizedTransfigurationPresentation = Pick<
  TransfigurationFormDefinition,
  "glyph" | "accentColor"
> & {
  readonly name: LocalizedString;
  readonly description: LocalizedString;
};

export function localizedTransfigurationPresentation(
  presentation: TransfigurationFormDefinition,
): LocalizedTransfigurationPresentation {
  return {
    glyph: presentation.glyph,
    accentColor: presentation.accentColor,
    name: localizedSourceText(presentation.name),
    description: localizedSourceText(presentation.description),
  };
}
