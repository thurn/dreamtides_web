import type { CSSProperties, ReactNode } from "react";
import { Dreamsign as TangoDreamsign } from "../../tango/components/hud/Dreamsign";
import type { Dreamsign } from "../../types/quest";
import type { JourneyDreamsignObject } from "./offerPresentation";

interface JourneyDreamsignIconProps {
  object: JourneyDreamsignObject;
  /** Icon size in design-space px. */
  sizePx: number;
  /** Selection ring color (chosen state in a dreamsign draft). */
  ringColor?: string;
  /** Idle float animation shorthand, e.g. "dj-float-y 5.2s ease-in-out infinite". */
  floatAnimation?: string;
  dim?: boolean;
  onClick?: () => void;
  selected?: boolean;
  testId?: string;
  /** Caption shown under the icon (e.g. the dreamsign name). */
  caption?: ReactNode;
}

function dreamsignFromObject(object: JourneyDreamsignObject): Dreamsign {
  return {
    id: object.dreamsignId,
    name: object.dreamsignTemplate.name,
    effectDescription: object.dreamsignTemplate.effectDescription,
    imageName: object.dreamsignTemplate.imageName,
    imageAlt: object.dreamsignTemplate.imageAlt,
    isBane: false,
  };
}

/**
 * A dreamsign rendered as its transparent icon — no card frame — floating over a
 * slowly rotating violet-to-cyan aura. Its rules live only in the hover tooltip
 * below, so the resting state is icon plus name. Mirrors the offer-card hover
 * pattern (delay, viewport-aware placement) for consistency across the screen.
 */
export function JourneyDreamsignIcon({
  object,
  sizePx,
  ringColor,
  floatAnimation,
  dim = false,
  onClick,
  selected,
  testId,
  caption,
}: JourneyDreamsignIconProps) {
  const dreamsign = dreamsignFromObject(object);
  const auraSize = sizePx * 1.5;

  const wrapperStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    opacity: dim ? 0.55 : 1,
    cursor: onClick ? "pointer" : undefined,
  };

  const iconStack: CSSProperties = {
    position: "relative",
    width: sizePx,
    height: sizePx,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...(floatAnimation === undefined ? {} : { animation: floatAnimation }),
  };

  const body = (
    <div
      className="dj-anim-card"
      style={wrapperStyle}
      aria-pressed={onClick ? selected : undefined}
      aria-label={`${object.displayName} dreamsign`}
      data-testid={testId}
      data-dreamsign-id={object.dreamsignId}
      data-selected={selected ? "true" : undefined}
    >
      <div style={iconStack}>
        <div
          className="dj-anim-aura"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: auraSize,
            height: auraSize,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, rgba(150,110,255,.55), rgba(95,210,235,.5), rgba(150,110,255,.55))",
            filter: "blur(14px)",
            transform: "translate(-50%,-50%)",
            animation: "dj-aura-spin 16s linear infinite",
            zIndex: 0,
          }}
        />
        <div style={{ position: "relative", zIndex: 1, filter: ringColor ? `drop-shadow(0 0 10px ${ringColor})` : undefined }}>
          <TangoDreamsign dreamsign={dreamsign} sizePx={sizePx} onPress={onClick} testid={testId == null ? undefined : `${testId}-entity`} />
        </div>
      </div>
      {caption}
    </div>
  );

  return body;
}
