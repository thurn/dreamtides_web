import type { TransfigurationFormDefinition } from "../../../types/transfiguration-data";

export type TransfigurationPresentation = Pick<
  TransfigurationFormDefinition,
  "glossaryUuid" | "glyph" | "accentColor"
> & {
  readonly name: string;
  readonly description: string;
};

export function transfigurationPresentation(
  presentation: TransfigurationFormDefinition,
): TransfigurationPresentation {
  return {
    glossaryUuid: presentation.glossaryUuid,
    glyph: presentation.glyph,
    accentColor: presentation.accentColor,
    name: presentation.name,
    description: presentation.description,
  };
}
