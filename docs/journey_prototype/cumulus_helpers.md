# Cumulus helper modules

These helpers encode shared Cumulus contracts. Product screens and adapters
should import them instead of recreating paths, dimensions, aspect ratios, or
color conversions.

## `src/cumulus/primitives/art.ts`

`ArtRef` is the transport-safe identity for binary art. Build references with
the `artRef` factory and resolve them to browser URLs with `resolveArtRef` at the
render boundary. Card and content identity remains the catalog UUID; an art
reference is display data.

## `src/cumulus/components/atlas/atlas-display.ts`

This module owns the Dream Atlas design-stage dimensions, node sizing, and
Dreamscape asset URL helpers. Atlas screens use these values so node placement,
edge endpoints, scene art, and dreamsign icons share one coordinate system.

## `src/cumulus/components/card/card-aspect.ts`

This module owns the card frame aspect ratio and art-region geometry. Use its
constants and conversion helpers whenever a layout sizes a card or aligns
content to the card art window.

## `src/cumulus/primitives/color.ts`

This module converts authored colors into the CSS forms used by Cumulus and
derives translucent treatments from them. Use it for runtime color values;
fixed design-system colors belong in named design tokens.
