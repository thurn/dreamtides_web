import { type CSSProperties, type ReactNode } from "react";
import type { CardData } from "../../types/cards";
import { GameCard } from "../../tango/components/card/CardView";
import { JOURNEY_SHADOW_IDLE } from "./journeyTheme";
import type { JourneyCardObject } from "./offerPresentation";

interface JourneyCardProps {
  object: JourneyCardObject;
  /** Rendered card width in design-space px (height follows the 2:3 aspect). */
  widthPx: number;
  /** Full `box-shadow` for the card box — selection ring + glow, or idle shadow. */
  ringShadow?: string;
  /** Idle float animation shorthand (e.g. "dj-float-y 4.8s ease-in-out infinite"). */
  floatAnimation?: string;
  /** Lower opacity / desaturate for an unselected candidate. */
  dim?: boolean;
  /** When true, render the card's `previewCard` (the transfigured "after"). */
  usePreview?: boolean;
  /** Render this exact card instead of the object's card (the "now" original). */
  cardOverride?: CardData;
  /** Extra CSS filter on the card box (e.g. the purge desaturation). */
  imageFilter?: string;
  onClick?: () => void;
  /** Absolutely-positioned overlay (CHOSEN pill, ×2 badge, check) — shares the float. */
  overlay?: ReactNode;
  selected?: boolean;
  testId?: string;
}

/**
 * One offer card rendered as its full `GameCard` art with a ~9px radius, a soft
 * shadow, and a per-state selection ring + glow. The float animation lives on
 * the outer wrapper so the ring and any `overlay` (CHOSEN / ×2 / check) ride
 * along with the card's idle drift and never detach from it.
 *
 * The visible card is the named Tango GameCard source. The root coordinator
 * owns its reading copy, glossary context, pointer modality, placement, and
 * activation boundary even when the Journey stage is CSS-scaled.
 */
export function JourneyCard({
  object,
  widthPx,
  ringShadow,
  floatAnimation,
  dim = false,
  usePreview = false,
  cardOverride,
  imageFilter,
  onClick,
  overlay,
  selected,
  testId,
}: JourneyCardProps) {
  const card =
    cardOverride ??
    (usePreview && object.objectType === "deckCard" && object.previewCard
      ? object.previewCard
      : object.card);

  const wrapperStyle: CSSProperties = {
    position: "relative",
    width: widthPx,
    ...(floatAnimation === undefined ? {} : { animation: floatAnimation }),
  };

  const boxStyle: CSSProperties = {
    borderRadius: 9,
    boxShadow: ringShadow ?? JOURNEY_SHADOW_IDLE,
    opacity: dim ? 0.9 : 1,
    filter: imageFilter ?? (dim ? "saturate(.85)" : undefined),
    cursor: onClick ? "pointer" : undefined,
  };

  return (
    <div className="dj-anim-card" style={wrapperStyle}>
      <div
        style={boxStyle}
        data-card-uuid={object.cardUuid}
        data-card-number={object.cardNumber}
        data-selected={selected ? "true" : undefined}
      >
        <div className="block w-full overflow-hidden rounded-[9px]">
          <GameCard
            model={{
              cardId: card.id,
              displaySnapshot: card,
              ...(usePreview && object.transfiguration !== undefined
                ? { transfiguration: object.transfiguration }
                : {}),
            }}
            onActivate={onClick}
            selected={selected}
            testId={testId}
          />
        </div>
      </div>
      {overlay}
    </div>
  );
}
