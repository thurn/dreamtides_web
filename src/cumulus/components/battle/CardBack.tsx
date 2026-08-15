import cardBackUrl from "../../assets/card_back.png";
import { CARD_ASPECT_RATIO, CARD_CORNER_RADIUS } from "../card/card-aspect";
import { token } from "../../primitives/tokens";
import type { LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type { DomTestId } from "../../types/dom";

export interface CardBackProps {
  /** Accessible description of this face-down card in its current zone. */
  readonly label: LocalizedString;
  /** Optional stable test id for the face-down card object. */
  readonly testId?: DomTestId;
}

/**
 * The canonical face-down Dreamtides card object. It owns the shipped card-back
 * sprite, card aspect ratio, crop, edge, and elevation; callers only size and
 * place it through a wrapper.
 */
export function CardBack({ label, testId }: CardBackProps) {
  const resolve = useLocalizer();
  return (
    <img
      src={cardBackUrl}
      alt={resolve(label)}
      data-card-back=""
      data-testid={testId}
      draggable={false}
      style={{
        display: "block",
        width: "100%",
        aspectRatio: CARD_ASPECT_RATIO,
        objectFit: "cover",
        borderRadius: CARD_CORNER_RADIUS,
        boxShadow: token("--shadow-card"),
        userSelect: "none",
      }}
    />
  );
}
