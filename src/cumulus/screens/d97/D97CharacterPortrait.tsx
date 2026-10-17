// D97CharacterPortrait — a D97 character's pixel-art bust: the head and
// shoulders of its standing, front-facing LPC frame, scaled by whole pixels
// with no smoothing. The box keeps its size while the frame composites and
// stays empty for a character the manifest cannot draw.

import { useEffect, useState, type ReactElement } from "react";
import { LPC_FRAME_SIZE, lpcCharacterFrame } from "../../primitives/lpc-character";
import type { D97CharacterId } from "../../../types/identifiers";

/** The bust's square crop of the 64-pixel frame: left and top edges, side. */
const BUST_LEFT = 16;
const BUST_TOP = 8;
const BUST_SIDE = 32;
/** Whole-pixel magnification of the bust. */
const BUST_SCALE = 2;

export interface D97CharacterPortraitProps {
  readonly characterId: D97CharacterId;
  /** Accessible description of the portrait. */
  readonly alt: string;
}

export function D97CharacterPortrait({ characterId, alt }: D97CharacterPortraitProps): ReactElement {
  const [frame, setFrame] = useState<{ readonly id: D97CharacterId; readonly url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    void lpcCharacterFrame(characterId).then((url) => {
      if (live) setFrame({ id: characterId, url });
    });
    return () => {
      live = false;
    };
  }, [characterId]);
  const url = frame?.id === characterId ? frame.url : null;
  const side = BUST_SIDE * BUST_SCALE;
  return (
    <div
      role="img"
      aria-label={alt}
      data-d97-character-portrait={characterId}
      data-d97-character-portrait-ready={url === null ? "false" : "true"}
      style={{
        position: "relative",
        flex: "none",
        width: `${String(side)}px`,
        height: `${String(side)}px`,
        overflow: "hidden",
      }}
    >
      {url !== null && (
        <img
          alt=""
          src={url}
          draggable={false}
          style={{
            position: "absolute",
            left: `${String(-BUST_LEFT * BUST_SCALE)}px`,
            top: `${String(-BUST_TOP * BUST_SCALE)}px`,
            width: `${String(LPC_FRAME_SIZE * BUST_SCALE)}px`,
            height: `${String(LPC_FRAME_SIZE * BUST_SCALE)}px`,
            maxWidth: "none",
            imageRendering: "pixelated",
          }}
        />
      )}
    </div>
  );
}
