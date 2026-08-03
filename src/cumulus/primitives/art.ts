// Typed art references for the strict Cumulus API.
//
// A component that shows game art never takes a resolved image URL. A URL is an
// irreducibly-arbitrary string that no type can meaningfully constrain, and
// resolving it at the call site scatters the id → URL mapping across screens.
// Instead a component takes an `ArtRef` — a small discriminated union naming
// WHAT art to show (a dreamsign by its image name, a dreamAvatar by its number,
// a dreamscape by its id) — and resolves the URL itself via `resolveArtRef`.
// The id → URL mapping lives here, once.

import { assetUrl } from "../../runtime/asset-url";
import miraHeadCircleUrl from "../assets/dream-avatars/0020-head-circle.png";

/** Character portraits authored as local Cumulus assets. */
export type CharacterPortraitId = "mira";

/** A locally-authored character portrait selected by stable identity. */
export interface CharacterPortraitArtRef {
  readonly kind: "character-portrait";
  readonly characterId: CharacterPortraitId;
}

/**
 * A reference to a piece of hosted game art, by identity rather than URL. Each
 * variant names the kind of art and carries the id needed to resolve it;
 * {@link resolveArtRef} maps it to a URL through the asset pipeline.
 */
export type ArtRef =
  | {
      /** The authored full-bleed background for the Dreamtides main menu. */
      readonly kind: "main-menu-background";
    }
  | {
      /** A dreamsign's art, keyed by its `imageName` (includes the extension). */
      readonly kind: "dreamsign";
      readonly imageName: string;
    }
  | {
      /** A dreamAvatar portrait, keyed by its zero-padded image number. */
      readonly kind: "dreamAvatar";
      readonly imageNumber: string;
    }
  | {
      /** A dreamAvatar's transparent full-body cutout (the character render
       * with the scene background removed), keyed by its zero-padded image
       * number. */
      readonly kind: "dream-avatar-cutout";
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
    }
  | {
      /** Licensed full-resolution art used by the Exploration prototype. */
      readonly kind: "exploration-card";
      readonly imageNumber: number;
    }
  | {
      /** Local source artwork shown by the development-only encounter editor. */
      readonly kind: "encounter-editor-card";
      readonly imageNumber: number;
    }
  | CharacterPortraitArtRef;

/** Resolve an {@link ArtRef} to a hosted art URL through the asset pipeline. */
export function resolveArtRef(ref: ArtRef): string {
  switch (ref.kind) {
    case "main-menu-background":
      return assetUrl("/main-menu/background.jpg");
    case "dreamsign":
      return assetUrl(`/dreamsigns/${ref.imageName}`);
    case "dreamAvatar":
      return assetUrl(`/dream-avatars/${ref.imageNumber}.png`);
    case "dream-avatar-cutout":
      return assetUrl(`/dream-avatars/cutout/${ref.imageNumber}.png`);
    case "dreamscape-icon":
      return assetUrl(`/dreamscape-icons/${ref.dreamscapeId}.png`);
    case "dreamscape-scene":
      return assetUrl(`/dreamscapes/${ref.dreamscapeId}.png`);
    case "dream-guide":
      return assetUrl(`/dream-guides/${ref.guideId}.png`);
    case "exploration-card":
      return assetUrl(`/exploration/${String(ref.imageNumber)}.jpg`);
    case "encounter-editor-card":
      return `/api/editor/encounters/art/${String(ref.imageNumber)}`;
    case "character-portrait":
      switch (ref.characterId) {
        case "mira":
          return miraHeadCircleUrl;
      }
  }
}

/** Convenience constructors for the {@link ArtRef} variants. */
export const artRef = {
  mainMenuBackground: (): ArtRef => ({ kind: "main-menu-background" }),
  dreamsign: (imageName: string): ArtRef => ({ kind: "dreamsign", imageName }),
  dreamAvatar: (imageNumber: string): ArtRef => ({
    kind: "dreamAvatar",
    imageNumber,
  }),
  dreamAvatarCutout: (imageNumber: string): ArtRef => ({
    kind: "dream-avatar-cutout",
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
  explorationCard: (imageNumber: number): ArtRef => ({
    kind: "exploration-card",
    imageNumber,
  }),
  encounterEditorCard: (imageNumber: number): ArtRef => ({
    kind: "encounter-editor-card",
    imageNumber,
  }),
  characterPortrait: (
    characterId: CharacterPortraitId,
  ): CharacterPortraitArtRef => ({
    kind: "character-portrait",
    characterId,
  }),
} as const;
