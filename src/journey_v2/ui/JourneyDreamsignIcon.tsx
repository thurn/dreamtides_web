import type { CSSProperties, ReactNode } from "react";
import {
  CARD_HOVER_PREVIEW_DELAY_MS,
  HoverPopover,
} from "../../tango/components/HoverPopover";
import { DreamsignHoverCard } from "../../components/DreamsignHoverCard";
import type { Dreamsign } from "../../types/quest";
import type { JourneyDreamsignObject } from "./offerPresentation";
import { assetUrl } from "../../runtime/asset-url";

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
      onClick={onClick}
      role={onClick ? "button" : undefined}
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
        {object.dreamsignTemplate.imageName ? (
          <img
            src={assetUrl(`/dreamsigns/${String(object.dreamsignTemplate.imageName)}`)}
            alt={object.dreamsignTemplate.imageAlt ?? object.displayName}
            style={{
              position: "relative",
              zIndex: 1,
              width: sizePx,
              height: sizePx,
              objectFit: "contain",
              display: "block",
              filter: ringColor
                ? `drop-shadow(0 0 10px ${ringColor})`
                : "drop-shadow(0 6px 16px rgba(0,0,0,.45))",
            }}
          />
        ) : (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: sizePx,
              height: sizePx,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: sizePx * 0.4,
              fontWeight: 800,
              color: "#efeaff",
              background:
                "radial-gradient(circle at 38% 32%, #5a4a86, #221a40)",
              border: ringColor
                ? `2px solid ${ringColor}`
                : "1px solid rgba(160,140,230,.4)",
            }}
          >
            {object.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      {caption}
    </div>
  );

  return (
    <HoverPopover
      triggerAs="div"
      placement="top"
      delayMs={CARD_HOVER_PREVIEW_DELAY_MS}
      maxWidthPx={null}
      content={({ anchorRect, side }) => (
        <DreamsignHoverCard
          dreamsign={dreamsign}
          testid={`journey-dreamsign-hover-${object.dreamsignId}`}
          popoverSide={side}
          anchorRect={anchorRect}
        />
      )}
    >
      {body}
    </HoverPopover>
  );
}
