// CharacterDialogue — a framed character portrait paired with the canonical
// SpeechBubble, presented as one fadeable guide-dialogue object.

import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement } from "react";
import { assetUrl } from "../../../runtime/asset-url";
import { motionTimeSeconds } from "../../primitives/motion-time";
import { resolveArtRef, type ArtRef } from "../../primitives/art";
import { token } from "../../primitives/tokens";
import { SpeechBubble } from "./SpeechBubble";

const DIALOGUE_FRAME_URL = assetUrl("/atlas/Round_frame.png");
const DIALOGUE_FADE_SECONDS = motionTimeSeconds("--dur-slow");
// The portrait matches the canonical bubble's common one-line height, keeping
// the paired object compact enough to sit directly on battlefield geometry.
const DIALOGUE_PORTRAIT_SIZE = 64;

/** Art identities that semantically represent a speaking character. */
export type CharacterDialoguePortraitArt = Extract<
  ArtRef,
  {
    readonly kind:
      | "dreamcaller"
      | "dreamcaller-cutout"
      | "dream-guide"
      | "character-portrait";
  }
>;

/** The character identity and spoken copy rendered as one dialogue object. */
export interface CharacterDialogueModel {
  /** Typed portrait art shown inside the circular frame. */
  readonly portrait: CharacterDialoguePortraitArt;
  /** Accessible description of the portrait art. */
  readonly portraitAlt: string;
  /** Character name shown by the speech bubble. */
  readonly speakerName: string;
  /** Plain spoken line shown by the speech bubble. */
  readonly text: string;
}

export interface CharacterDialogueProps {
  /** Character identity and spoken copy to present. */
  readonly dialogue: CharacterDialogueModel;
  /** Whether the paired portrait and bubble are visible; changes fade in or out. */
  readonly visible: boolean;
  /** Optional stable test id for product-screen QA. */
  readonly testId?: string;
}

/**
 * CharacterDialogue — a compact portrait-and-speech pairing whose frame,
 * layout, and presence transition stay consistent across character-led scenes.
 */
export function CharacterDialogue({
  dialogue,
  visible,
  testId,
}: CharacterDialogueProps): ReactElement {
  const reduceMotion = useReducedMotion() === true;
  const targetOpacity = visible ? 1 : 0;

  return (
    <motion.section
      aria-hidden={!visible}
      aria-label={`${dialogue.speakerName} speaks`}
      data-character-dialogue=""
      data-character-dialogue-visible={String(visible)}
      data-testid={testId}
      initial={{ opacity: reduceMotion ? targetOpacity : 0 }}
      animate={{ opacity: targetOpacity }}
      transition={{ duration: reduceMotion ? 0 : DIALOGUE_FADE_SECONDS }}
      style={{
        display: "grid",
        gridTemplateColumns: `${String(DIALOGUE_PORTRAIT_SIZE)}px minmax(0, 1fr)`,
        alignItems: "center",
        columnGap: token("--space-4"),
        width: "100%",
        maxWidth: 640,
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
            alt={dialogue.portraitAlt}
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
          speakerName={dialogue.speakerName}
          text={dialogue.text}
        />
      </div>
    </motion.section>
  );
}
