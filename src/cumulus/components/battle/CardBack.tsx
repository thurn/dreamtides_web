import cardBackUrl from "../../assets/card_back.png";
import { CARD_ASPECT_RATIO, CARD_CORNER_RADIUS } from "../card/card-aspect";
import { token } from "../../primitives/tokens";

export interface CardBackProps {
  /** Accessible description of this face-down card in its current zone. */
  readonly label: string;
  /** Optional stable test id for the face-down card object. */
  readonly testId?: string;
}

/**
 * The canonical face-down Dreamtides card object. It owns the shipped card-back
 * sprite, card aspect ratio, crop, edge, and elevation; callers only size and
 * place it through a wrapper.
 */
export function CardBack({ label, testId }: CardBackProps) {
  return (
    <img
      src={cardBackUrl}
      alt={label}
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
