import type { TransfigurationFormDefinition } from "../../../types/transfiguration-data";

export type LocalizedTransfigurationPresentation = Pick<
  TransfigurationFormDefinition,
  "glossaryUuid" | "glyph" | "accentColor"
> & {
  readonly name: string;
  readonly description: string;
};

export function localizedTransfigurationPresentation(
  presentation: TransfigurationFormDefinition,
): LocalizedTransfigurationPresentation {
  return {
    glossaryUuid: presentation.glossaryUuid,
    glyph: presentation.glyph,
    accentColor: presentation.accentColor,
    name: presentation.name,
    description: presentation.description,
  };
}
