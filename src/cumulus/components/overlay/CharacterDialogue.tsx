// CharacterDialogue — a framed character portrait paired with the canonical
// SpeechBubble, presented as one fadeable guide-dialogue object.

import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement } from "react";
import { assetUrl } from "../../../runtime/asset-url";
import { motionTimeSeconds } from "../../primitives/motion-time";
import { resolveArtRef, type ArtRef } from "../../primitives/art";
import { token } from "../../primitives/tokens";
import { SpeechBubble } from "./SpeechBubble";
import { opaque, txa, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

const DIALOGUE_FRAME_URL = assetUrl("/atlas/Round_frame.png");
const DIALOGUE_FADE_SECONDS = motionTimeSeconds("--dur-slow");

/** Named dialogue scales for compact, wide, and prominent placement. */
export type CharacterDialogueSize = "compact" | "wide" | "prominent";

const DIALOGUE_PORTRAIT_SIZE: Record<CharacterDialogueSize, number> = {
  // Matches the common one-line bubble height on constrained screens.
  compact: 64,
  // Keeps the compact portrait while opening a long desktop dialogue line.
  wide: 64,
  // Settled against the desktop tutorial battlefield during visual tuning.
  prominent: 150,
};

const DIALOGUE_MAX_WIDTH: Record<CharacterDialogueSize, number> = {
  // Keeps a two-line call close to its authored trailing inset on mobile.
  compact: 300,
  // Gives desktop instructional copy a broad reading measure.
  wide: 700,
  // Lets a medium-length call remain one line at the prominent desktop scale.
  prominent: 700,
};

/** Art identities that semantically represent a speaking character. */
export type CharacterDialoguePortraitArt = Extract<
  ArtRef,
  {
    readonly kind:
      | "dreamAvatar"
      | "dream-avatar-cutout"
      | "dream-guide"
      | "character-portrait";
  }
>;

/** The character identity and spoken copy rendered as one dialogue object. */
export interface CharacterDialogueModel {
  /** Typed portrait art shown inside the circular frame. */
  readonly portrait: CharacterDialoguePortraitArt;
  /** Accessible description of the portrait art. */
  readonly portraitAlt: LocalizedString;
  /** Character name shown by the speech bubble. */
  readonly speakerName: LocalizedString;
  /** Spoken line shown with tutorial highlights and canonical inline rules glyphs. */
  readonly text: LocalizedString;
}

export interface CharacterDialogueProps {
  /** Character identity and spoken copy to present. */
  readonly dialogue: CharacterDialogueModel;
  /** Whether the paired portrait and bubble are visible; changes fade in or out. */
  readonly visible: boolean;
  /** Authored scale for compact, wide, or prominent character-led placement. */
  readonly size?: CharacterDialogueSize;
  /** Optional stable test id for product-screen QA. */
  readonly testId?: string;
  /** Multiplier applied to this dialogue's presence transition. */
  readonly playbackSpeed?: number;
}

/**
 * CharacterDialogue — a compact portrait-and-speech pairing whose frame,
 * layout, and presence transition stay consistent across character-led scenes.
 */
export function CharacterDialogue({
  dialogue,
  visible,
  size = "compact",
  testId,
  playbackSpeed = 1,
}: CharacterDialogueProps): ReactElement {
  const resolve = useLocalizer();
  const reduceMotion = useReducedMotion() === true;
  const targetOpacity = visible ? 1 : 0;
  const portraitSize = DIALOGUE_PORTRAIT_SIZE[size];
  const maxWidth = DIALOGUE_MAX_WIDTH[size];

  return (
    <motion.section
      aria-hidden={!visible}
      aria-label={resolve(txa(
        "{speaker_name} speaks",
        { speaker_name: opaque(dialogue.speakerName) },
        "Accessible name for character dialogue. speaker_name is the displayed name of the character currently speaking and has unknown grammatical gender.",
      ))}
      data-character-dialogue=""
      data-character-dialogue-size={size}
      data-character-dialogue-visible={String(visible)}
      data-testid={testId}
      initial={{ opacity: reduceMotion ? targetOpacity : 0 }}
      animate={{ opacity: targetOpacity }}
      transition={{
        duration: reduceMotion ? 0 : DIALOGUE_FADE_SECONDS / playbackSpeed,
      }}
      style={{
        display: "grid",
        gridTemplateColumns: `${String(portraitSize)}px minmax(0, 1fr)`,
        alignItems: "center",
        // Leaves the SpeechBubble pointer aimed at the portrait without
        // painting over the portrait frame at either authored bubble scale.
        columnGap: token("--space-2xl"),
        width: "100%",
        maxWidth,
        margin: 0,
        pointerEvents: "none",
      }}
    >
      <div
        data-character-dialogue-portrait-frame=""
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "5%",
            overflow: "hidden",
            borderRadius: "50%",
          }}
        >
          <img
            alt={resolve(dialogue.portraitAlt)}
            data-character-dialogue-portrait=""
            draggable={false}
            src={resolveArtRef(dialogue.portrait)}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              userSelect: "none",
            }}
          />
        </div>
        <img
          alt=""
          aria-hidden="true"
          data-character-dialogue-frame=""
          draggable={false}
          src={DIALOGUE_FRAME_URL}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: `drop-shadow(${token("--shadow-md")})`,
            userSelect: "none",
          }}
        />
      </div>
      <div
        style={{
          minWidth: 0,
          width: "fit-content",
          maxWidth: "100%",
        }}
      >
        <SpeechBubble
          pointerPlacement="left-center"
          speakerName={dialogue.speakerName}
          text={dialogue.text}
          size={size === "prominent" ? "prominent" : "standard"}
        />
      </div>
    </motion.section>
  );
}
