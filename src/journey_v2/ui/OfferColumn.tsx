import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { MerchantChoiceCandidate, MerchantContext, MerchantOffer } from "../types";
import {
  JOURNEY_ACCEPT_BORDER,
  JOURNEY_ACCEPT_GRADIENT,
  JOURNEY_ACCENTS,
} from "./journeyTheme";
import { OfferObjects } from "./OfferObjects";
import {
  acceptButtonLabel,
  presentationCandidates,
  presentationRequiresSelection,
  resolveOfferPresentation,
} from "./offerPresentation";

interface OfferColumnProps {
  offer: MerchantOffer;
  side: "left" | "right";
  label: string;
  context?: MerchantContext;
  selectedChoiceId?: string;
  onSelectCandidate: (candidate: MerchantChoiceCandidate) => void;
  onAccept: () => void;
  /** Render without absolute positioning (mobile detail view). */
  flow?: boolean;
}

/**
 * One offer column: a header (category pill, name, one-line) pinned to the top,
 * the offer's game objects vertically centered, and the purple accept button
 * pinned to the bottom. Both columns share the same `top`/`bottom` offsets, so
 * the two accept buttons sit on one baseline no matter how tall each offer's
 * objects are — the layout rule that grounds the whole composition.
 */
export function OfferColumn({
  offer,
  side,
  label,
  context,
  selectedChoiceId,
  onSelectCandidate,
  onAccept,
  flow = false,
}: OfferColumnProps) {
  const presentation = useMemo(
    () => resolveOfferPresentation(offer),
    [offer],
  );
  const accent = JOURNEY_ACCENTS[offer.archetypeId];
  const candidates = presentationCandidates(presentation);
  const selectedCandidate = candidates.find(
    (candidate) => candidate.choiceId === selectedChoiceId,
  );
  const requiresSelection = presentationRequiresSelection(presentation);
  const acceptDisabled = requiresSelection && selectedCandidate === undefined;
  const acceptLabel = acceptButtonLabel(presentation, selectedCandidate);

  const columnStyle: CSSProperties = flow
    ? {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        textAlign: "center",
        width: "100%",
      }
    : {
        position: "absolute",
        top: 140,
        bottom: 118,
        width: 452,
        zIndex: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        textAlign: "center",
        ...(side === "left" ? { left: 54 } : { right: 54 }),
      };

  return (
    <div
      style={columnStyle}
      data-testid={`merchant-offer-card-${offer.offerId}`}
      data-offer-id={offer.offerId}
      data-archetype-id={offer.archetypeId}
      data-presentation-kind={presentation.kind}
    >
      <header>
        <span
          style={{
            display: "inline-block",
            fontSize: 11,
            letterSpacing: ".2em",
            fontWeight: 800,
            textTransform: "uppercase",
            color: accent.color,
            padding: "5px 12px",
            borderRadius: 999,
            background: accent.background,
            border: accent.border,
          }}
        >
          {accent.pill}
        </span>
        <div
          style={{
            fontSize: 27,
            fontWeight: 800,
            color: "#f3eeff",
            marginTop: 11,
            letterSpacing: "-.01em",
            lineHeight: 1.12,
          }}
        >
          {offer.title}
        </div>
        <div style={{ fontSize: 14, color: "#9a93c4", marginTop: 5 }}>
          {offer.summary}
        </div>
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "1 1 auto",
          minHeight: 0,
        }}
        data-testid={`merchant-offer-objects-${offer.offerId}`}
      >
        <OfferObjects
          presentation={presentation}
          context={context}
          selectedChoiceId={selectedChoiceId}
          onSelectCandidate={onSelectCandidate}
        />
      </div>

      <button
        type="button"
        className={acceptDisabled ? undefined : "dj-anim-btn"}
        disabled={acceptDisabled}
        onClick={onAccept}
        data-testid={`merchant-offer-action-${offer.offerId}`}
        aria-label={`${acceptLabel} (offer ${label})`}
        style={{
          fontSize: 15.5,
          fontWeight: 700,
          color: "#fff",
          padding: "13px 32px",
          borderRadius: 12,
          background: JOURNEY_ACCEPT_GRADIENT,
          border: JOURNEY_ACCEPT_BORDER,
          cursor: acceptDisabled ? "default" : "pointer",
          opacity: acceptDisabled ? 0.45 : 1,
          width: flow ? "100%" : undefined,
          maxWidth: flow ? "none" : 360,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          animation: acceptDisabled
            ? undefined
            : "dj-btn-glow 3.4s ease-in-out infinite",
        }}
      >
        {acceptLabel}
      </button>
    </div>
  );
}
