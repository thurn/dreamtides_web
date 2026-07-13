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
import { token } from "../../primitives/tokens";

const SPEECH_GLASS_FILL = token("--glass-fill-popover");
const SPEECH_GLASS_BACKGROUND = `${token("--glass-sheen")}, ${SPEECH_GLASS_FILL}`;
const SPEECH_TAIL_DEPTH = 14;
const SPEECH_TAIL_HALF_HEIGHT = 10;
const SPEECH_CORNER_SIZE = 8;
const SPEECH_TAIL_CENTER_RATIO = 0.68;

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
  const reactId = useId();
  const clipId = `speech-bubble-${reactId.replace(/:/g, "")}`;
  const bubbleRef = useRef<HTMLElement | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });
  const tail = `${String(SPEECH_TAIL_DEPTH)}px`;
  const path = makeSpeechBubblePath(
    bubbleSize.width,
    bubbleSize.height,
    arrowSide,
  );

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (bubble === null) {
      return undefined;
    }
    const updateSize = () => {
      const next = bubble.getBoundingClientRect();
      setBubbleSize({
        width: Math.round(next.width),
        height: Math.round(next.height),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(bubble);
    return () => observer.disconnect();
  }, []);

  const bubbleStyle: CSSProperties = {
    position: "relative",
    ...glassSurfaceStyle({ radius: null }),
    background: SPEECH_GLASS_BACKGROUND,
    border: "none",
    boxSizing: "border-box",
    width: `calc(100% + ${tail})`,
    marginLeft: arrowSide === "left" ? `calc(-1 * ${tail})` : undefined,
    marginRight: arrowSide === "right" ? `calc(-1 * ${tail})` : undefined,
    padding:
      arrowSide === "left"
        ? `${token("--space-5")} ${token("--space-6")} ${token("--space-5")} calc(${tail} + ${token("--space-6")})`
        : `${token("--space-5")} calc(${tail} + ${token("--space-6")}) ${token("--space-5")} ${token("--space-6")}`,
    boxShadow: "none",
    clipPath: path !== null ? `url(#${clipId})` : undefined,
    WebkitClipPath: path !== null ? `url(#${clipId})` : undefined,
    filter: `drop-shadow(${token("--shadow-md")})`,
    color: token("--text-primary"),
  };

  return (
    <aside ref={bubbleRef} data-testid={testId} style={bubbleStyle}>
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
          font: token("--t-serif-body"),
          color: token("--text-primary"),
        }}
      >
        {text}
      </p>
    </aside>
  );
}

function makeSpeechBubblePath(
  width: number,
  height: number,
  arrowSide: "left" | "right",
): string | null {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const tail = SPEECH_TAIL_DEPTH;
  const halfTail = Math.min(SPEECH_TAIL_HALF_HEIGHT, height / 4);
  const corner = Math.min(SPEECH_CORNER_SIZE, height / 2, width / 2);
  const tailCenter = clamp(
    height * SPEECH_TAIL_CENTER_RATIO,
    corner + halfTail,
    height - corner - halfTail,
  );
  const tailTop = tailCenter - halfTail;
  const tailBottom = tailCenter + halfTail;

  if (arrowSide === "left") {
    return [
      `M ${tail + corner} 0`,
      `H ${width - corner}`,
      `Q ${width} 0 ${width} ${corner}`,
      `V ${height - corner}`,
      `Q ${width} ${height} ${width - corner} ${height}`,
      `H ${tail + corner}`,
      `Q ${tail} ${height} ${tail} ${height - corner}`,
      `V ${tailBottom}`,
      `L 0 ${tailCenter}`,
      `L ${tail} ${tailTop}`,
      `V ${corner}`,
      `Q ${tail} 0 ${tail + corner} 0`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${corner} 0`,
    `H ${width - tail - corner}`,
    `Q ${width - tail} 0 ${width - tail} ${corner}`,
    `V ${tailTop}`,
    `L ${width} ${tailCenter}`,
    `L ${width - tail} ${tailBottom}`,
    `V ${height - corner}`,
    `Q ${width - tail} ${height} ${width - tail - corner} ${height}`,
    `H ${corner}`,
    `Q 0 ${height} 0 ${height - corner}`,
    `V ${corner}`,
    `Q 0 0 ${corner} 0`,
    "Z",
  ].join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
