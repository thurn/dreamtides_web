import { useState } from "react";
import type { MerchantChoiceCandidate, MerchantContext, MerchantOffer } from "../types";
import { JOURNEY_ACCENTS } from "./journeyTheme";
import { OfferColumn } from "./OfferColumn";
import { assetUrl } from "../../runtime/asset-url";

interface DreamJourneyMobileProps {
  offers: readonly MerchantOffer[];
  subtitle: string;
  context?: MerchantContext;
  selectedChoices: ReadonlyMap<string, string>;
  onSelectCandidate: (offer: MerchantOffer, candidate: MerchantChoiceCandidate) => void;
  onAccept: (offer: MerchantOffer) => void;
}

const PAGE_BACKGROUND =
  "radial-gradient(125% 92% at 50% 20%, #241b42 0%, #130d29 46%, #080614 100%)";

/**
 * Mobile uses an overview → detail flow with no tab controls. The overview
 * presides the Merchant over two stacked, tappable summary cards; tapping one
 * opens the full offer UI with a full-width accept. The shared top-right leave
 * icon button (rendered by the screen) leaves the site from anywhere, and a
 * quiet "‹ Back"
 * returns from a detail to the choice.
 */
export function DreamJourneyMobile({
  offers,
  subtitle,
  context,
  selectedChoices,
  onSelectCandidate,
  onAccept,
}: DreamJourneyMobileProps) {
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);
  const openOffer = offers.find((offer) => offer.offerId === openOfferId);

  if (openOffer !== undefined) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          background: PAGE_BACKGROUND,
          color: "#f3eeff",
          padding: "60px 20px 32px",
        }}
        data-testid="dream-journey-mobile-detail"
      >
        <div
          style={{
            position: "fixed",
            top: 14,
            left: 16,
            right: 16,
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button
            type="button"
            onClick={() => setOpenOfferId(null)}
            data-testid="dream-journey-mobile-back"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "#a39ec5",
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(28,22,48,.5)",
              border: "1px solid rgba(140,120,210,.24)",
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true">‹</span> Back
          </button>
        </div>
        <OfferColumn
          offer={openOffer}
          side="left"
          label={openOffer.offerId}
          flow
          context={context}
          selectedChoiceId={selectedChoices.get(openOffer.offerId)}
          onSelectCandidate={(candidate) => onSelectCandidate(openOffer, candidate)}
          onAccept={() => onAccept(openOffer)}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        // Transparent so the shared dreamscape backdrop reads through, matching
        // the desktop Augury composition and the other dreamscape sites.
        background: "transparent",
        color: "#f3eeff",
        padding: "16px 16px 24px",
      }}
      data-testid="dream-journey-mobile-overview"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 4,
        }}
      >
        <img
          src={assetUrl("/dream-guides/aldric_the_seer.png")}
          alt="Aldric, the Seer"
          style={{
            height: 220,
            width: "auto",
            WebkitMaskImage:
              "radial-gradient(ellipse 50% 58% at 50% 44%, #000 40%, rgba(0,0,0,.55) 62%, transparent 80%)",
            maskImage:
              "radial-gradient(ellipse 50% 58% at 50% 44%, #000 40%, rgba(0,0,0,.55) 62%, transparent 80%)",
          }}
        />
      </div>

      <div style={{ textAlign: "center", marginTop: -8 }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            background: "linear-gradient(180deg,#efeaff,#a988ff)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Augury
        </div>
        <div
          style={{
            fontSize: 13,
            fontStyle: "italic",
            color: "#8c86b0",
            marginTop: 4,
          }}
          data-testid="merchant-dialogue-line"
        >
          {subtitle}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginTop: 18,
        }}
      >
        {offers.map((offer, index) => (
          <div key={offer.offerId}>
            {index > 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: "#6f6992",
                  fontSize: 12,
                  letterSpacing: ".2em",
                  margin: "6px 0",
                }}
              >
                — or —
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpenOfferId(offer.offerId)}
              data-testid={`merchant-offer-card-${offer.offerId}`}
              data-offer-id={offer.offerId}
              data-archetype-id={offer.archetypeId}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 16,
                background: "rgba(28,22,48,.5)",
                border: "1px solid rgba(140,120,210,.24)",
                cursor: "pointer",
                color: "inherit",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    letterSpacing: ".2em",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    color: JOURNEY_ACCENTS[offer.archetypeId].color,
                  }}
                >
                  {JOURNEY_ACCENTS[offer.archetypeId].pill}
                </span>
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    color: "#f3eeff",
                    marginTop: 4,
                  }}
                >
                  {offer.title}
                </div>
                <div style={{ fontSize: 13, color: "#9a93c4", marginTop: 2 }}>
                  {offer.summary}
                </div>
              </div>
              <span aria-hidden="true" style={{ fontSize: 22, color: "#8c86b0" }}>
                ›
              </span>
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "#6f6992",
          marginTop: 16,
        }}
      >
        Tap an offer to see it in full.
      </div>
    </div>
  );
}
