// SpeechBubble — a compact character-dialog bubble for guide-led site screens.
// It uses the same liquid-glass material vocabulary as InfoCard, with a small
// side arrow so the bubble can sit beside a character render.

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { renderTutorialInstructionText } from "../../internal/tutorial-instruction-text";
import { token } from "../../primitives/tokens";
import {
  makeSpeechBubblePath,
  speechBubblePointerDepth,
  type SpeechBubblePointerPlacement,
} from "./speech-bubble-geometry";

const SPEECH_GLASS_FILL = token("--glass-fill-popover");
const SPEECH_GLASS_BACKGROUND = `${token("--glass-sheen")}, ${SPEECH_GLASS_FILL}`;
const SPEECH_CONTENT_PADDING = token("--space-5");

/** Named bubble scales that preserve the component's authored geometry. */
export type SpeechBubbleSize = "standard" | "prominent";

const SPEECH_BUBBLE_ZOOM: Record<SpeechBubbleSize, number> = {
  standard: 1,
  prominent: 1.25,
};

export interface SpeechBubbleProps {
  /** The speaking character's display name. */
  speakerName: string;
  /**
   * The spoken line. Uses tutorial instruction formatting for yellow and
   * bold high-contrast highlights plus canonical inline rules glyphs.
   */
  text: string;
  /** Authored display scale for compact or prominent character dialogue. */
  size?: SpeechBubbleSize;
  /** Edge and alignment of the pointer toward the speaking character. */
  pointerPlacement?: SpeechBubblePointerPlacement;
  /** Optional stable test id for product-screen QA. */
  testId?: string;
}

/**
 * SpeechBubble — a guide-dialog surface that resembles an InfoCard text pane
 * and points left toward the character render. Material, typography, spacing,
 * and arrow geometry stay fixed.
 */
export function SpeechBubble({
  speakerName,
  text,
  size = "standard",
  pointerPlacement = "left-lower",
  testId,
}: SpeechBubbleProps): ReactElement {
  const reactId = useId();
  const clipId = `speech-bubble-${reactId.replace(/:/g, "")}`;
  const bubbleRef = useRef<HTMLElement | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });
  const tail = `${String(speechBubblePointerDepth())}px`;
  const path = makeSpeechBubblePath(
    bubbleSize.width,
    bubbleSize.height,
    pointerPlacement,
  );
  const bubbleZoom = SPEECH_BUBBLE_ZOOM[size];
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (bubble === null) {
      return undefined;
    }
    const updateSize = () => {
      const rendered = bubble.getBoundingClientRect();
      setBubbleSize({
        // Clip-path coordinates live in the unzoomed layout space. Measuring
        // the rendered bounds without removing zoom applies it twice.
        width:
          rendered.width > 0 ? rendered.width / bubbleZoom : bubble.offsetWidth,
        height:
          rendered.height > 0
            ? rendered.height / bubbleZoom
            : bubble.offsetHeight,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(bubble);
    return () => observer.disconnect();
  }, [bubbleZoom]);

  const pointerLayout: CSSProperties =
    pointerPlacement === "top-left"
      ? {
          width: "max-content",
          maxWidth: "100%",
          padding: `calc(${tail} + ${SPEECH_CONTENT_PADDING}) ${SPEECH_CONTENT_PADDING} ${SPEECH_CONTENT_PADDING}`,
        }
      : pointerPlacement === "bottom-left"
        ? {
            width: "max-content",
            maxWidth: "100%",
            padding: `${SPEECH_CONTENT_PADDING} ${SPEECH_CONTENT_PADDING} calc(${tail} + ${SPEECH_CONTENT_PADDING})`,
          }
        : {
            width: `calc(100% + ${tail})`,
            marginLeft: `calc(-1 * ${tail})`,
            padding: `${SPEECH_CONTENT_PADDING} ${SPEECH_CONTENT_PADDING} ${SPEECH_CONTENT_PADDING} calc(${tail} + ${SPEECH_CONTENT_PADDING})`,
          };

  const bubbleStyle: CSSProperties = {
    position: "relative",
    ...glassSurfaceStyle({ radius: null }),
    background: SPEECH_GLASS_BACKGROUND,
    border: "none",
    boxSizing: "border-box",
    ...pointerLayout,
    boxShadow: "none",
    clipPath: path !== null ? `url(#${clipId})` : undefined,
    WebkitClipPath: path !== null ? `url(#${clipId})` : undefined,
    filter: `drop-shadow(${token("--shadow-md")})`,
    color: token("--text-primary"),
    zoom: bubbleZoom,
  };

  return (
    <aside
      ref={bubbleRef}
      data-speech-bubble-pointer-placement={pointerPlacement}
      data-speech-bubble-size={size}
      data-testid={testId}
      style={bubbleStyle}
    >
      {path !== null && (
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: "absolute" }}
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <path d={path} />
            </clipPath>
          </defs>
        </svg>
      )}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          marginBottom: token("--space-2"),
          font: token("--t-popover-meta"),
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: token("--text-on-glass"),
        }}
      >
        {speakerName}
      </div>
      <p
        style={{
          position: "relative",
          zIndex: 1,
          margin: 0,
          font: token("--t-tutorial-dialogue"),
          color: token("--text-primary"),
          whiteSpace: "pre-line",
        }}
      >
        {renderTutorialInstructionText(text)}
      </p>
    </aside>
  );
}
