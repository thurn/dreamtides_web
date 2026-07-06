// Typed art references for the strict Tango API.
//
// A component that shows game art never takes a resolved image URL. A URL is an
// irreducibly-arbitrary string that no type can meaningfully constrain, and
// resolving it at the call site scatters the id → URL mapping across screens.
// Instead a component takes an `ArtRef` — a small discriminated union naming
// WHAT art to show (a dreamsign by its image name, a dreamcaller by its number,
// a dreamscape by its id) — and resolves the URL itself via `resolveArtRef`.
// The id → URL mapping lives here, once.

import { assetUrl } from "../../runtime/asset-url";

/**
 * A reference to a piece of hosted game art, by identity rather than URL. Each
 * variant names the kind of art and carries the id needed to resolve it;
 * {@link resolveArtRef} maps it to a URL through the asset pipeline.
 */
export type ArtRef =
  | {
      /** A dreamsign's art, keyed by its `imageName` (includes the extension). */
      readonly kind: "dreamsign";
      readonly imageName: string;
    }
  | {
      /** A dreamcaller portrait, keyed by its zero-padded image number. */
      readonly kind: "dreamcaller";
      readonly imageNumber: string;
    }
  | {
      /** A dreamcaller's transparent full-body cutout (the character render
       * with the scene background removed), keyed by its zero-padded image
       * number. */
      readonly kind: "dreamcaller-cutout";
      readonly imageNumber: string;
    }
  | {
      /** A dreamscape's circular node icon, keyed by its dreamscape id. */
      readonly kind: "dreamscape-icon";
      readonly dreamscapeId: string;
    }
  | {
      /** A dreamscape's rectangular scene art, keyed by its dreamscape id. */
      readonly kind: "dreamscape-scene";
      readonly dreamscapeId: string;
    }
  | {
      /** A Dream Guide's transparent full-body character render, keyed by its
       * guide id. */
      readonly kind: "dream-guide";
      readonly guideId: string;
    };

/** Resolve an {@link ArtRef} to a hosted art URL through the asset pipeline. */
export function resolveArtRef(ref: ArtRef): string {
  switch (ref.kind) {
    case "dreamsign":
      return assetUrl(`/dreamsigns/${ref.imageName}`);
    case "dreamcaller":
      return assetUrl(`/dreamcallers/${ref.imageNumber}.png`);
    case "dreamcaller-cutout":
      return assetUrl(`/dreamcallers/cutout/${ref.imageNumber}.png`);
    case "dreamscape-icon":
      return assetUrl(`/dreamscape-icons/${ref.dreamscapeId}.png`);
    case "dreamscape-scene":
      return assetUrl(`/dreamscapes/${ref.dreamscapeId}.png`);
    case "dream-guide":
      return assetUrl(`/dream-guides/${ref.guideId}.png`);
  }
}

/** Convenience constructors for the {@link ArtRef} variants. */
export const artRef = {
  dreamsign: (imageName: string): ArtRef => ({ kind: "dreamsign", imageName }),
  dreamcaller: (imageNumber: string): ArtRef => ({
    kind: "dreamcaller",
    imageNumber,
  }),
  dreamcallerCutout: (imageNumber: string): ArtRef => ({
    kind: "dreamcaller-cutout",
    imageNumber,
  }),
  dreamscapeIcon: (dreamscapeId: string): ArtRef => ({
    kind: "dreamscape-icon",
    dreamscapeId,
  }),
  dreamscapeScene: (dreamscapeId: string): ArtRef => ({
    kind: "dreamscape-scene",
    dreamscapeId,
  }),
  dreamGuide: (guideId: string): ArtRef => ({
    kind: "dream-guide",
    guideId,
  }),
} as const;
