// SpeechBubble — a compact character-dialog bubble for guide-led site screens.
// It uses the same liquid-glass material vocabulary as InfoCard, with a small
// side arrow so the bubble can sit beside a character render.

import type { CSSProperties, ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";

const SPEECH_GLASS_FILL = token("--glass-fill-popover");
const SPEECH_GLASS_BACKGROUND = `${token("--glass-sheen")}, ${SPEECH_GLASS_FILL}`;

export interface SpeechBubbleProps {
  /** The speaking character's display name. */
  speakerName: string;
  /** The spoken line. Plain text; the component supplies the bubble voice. */
  text: string;
  /** Which side carries the arrow pointing toward the character. */
  arrowSide: "left" | "right";
  /** Optional stable test id for product-screen QA. */
  testId?: string;
}

/**
 * SpeechBubble — a guide-dialog surface that resembles an InfoCard text pane
 * but points toward a character render. The caller chooses only the side of the
 * arrow; material, typography, and spacing stay fixed.
 */
export function SpeechBubble({
  speakerName,
  text,
  arrowSide,
  testId,
}: SpeechBubbleProps): ReactElement {
  const bubbleStyle: CSSProperties = {
    position: "relative",
    ...glassSurfaceStyle(),
    background: SPEECH_GLASS_BACKGROUND,
    borderRadius: token("--radius-popover"),
    boxSizing: "border-box",
    padding: `${token("--space-5")} ${token("--space-6")}`,
    boxShadow: token("--shadow-md"),
    color: token("--text-primary"),
  };
  const arrowStyle: CSSProperties = {
    position: "absolute",
    top: token("--space-8"),
    [arrowSide]: "-14px",
    width: 0,
    height: 0,
    borderTop: "12px solid transparent",
    borderBottom: "12px solid transparent",
    ...(arrowSide === "left"
      ? { borderRight: `14px solid ${SPEECH_GLASS_FILL}` }
      : { borderLeft: `14px solid ${SPEECH_GLASS_FILL}` }),
  };

  return (
    <aside data-testid={testId} style={bubbleStyle}>
      <span aria-hidden="true" style={arrowStyle} />
      <div
        style={{
          marginBottom: token("--space-2"),
          font: token("--t-popover-meta"),
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: token("--accent-bright"),
        }}
      >
        {speakerName}
      </div>
      <p
        style={{
          margin: 0,
          font: token("--t-serif-body"),
          color: token("--text-primary"),
        }}
      >
        {text}
      </p>
    </aside>
  );
}
