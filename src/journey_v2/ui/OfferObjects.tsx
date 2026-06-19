import type { CSSProperties, ReactNode } from "react";
import { CardView } from "../../components/CardView";
import type { SiteType } from "../../types/quest";
import type {
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantDeckCard,
  MerchantGameObject,
} from "../types";
import { JourneyCard } from "./JourneyCard";
import { JourneyDreamsignIcon } from "./JourneyDreamsignIcon";
import {
  JOURNEY_RING_CHOSEN,
  JOURNEY_RING_DUPLICATE,
  JOURNEY_RING_TRANSFIGURE,
  JOURNEY_SHADOW_IDLE,
} from "./journeyTheme";
import type {
  JourneyCardObject,
  OfferPresentation,
} from "./offerPresentation";

interface OfferObjectsProps {
  presentation: OfferPresentation;
  context?: MerchantContext;
  selectedChoiceId?: string;
  onSelectCandidate: (candidate: MerchantChoiceCandidate) => void;
}

// --- shared badges ----------------------------------------------------------

function ChosenBadge({ color = "#8b5cff" }: { color?: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: -11,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: ".12em",
        color: "#fff",
        background: `linear-gradient(180deg,${color},#6a35e0)`,
        padding: "3px 9px",
        borderRadius: 999,
        boxShadow: "0 6px 16px rgba(0,0,0,.4)",
        whiteSpace: "nowrap",
      }}
    >
      CHOSEN
    </div>
  );
}

function TwoBadge() {
  return (
    <div
      style={{
        position: "absolute",
        top: -12,
        right: -12,
        zIndex: 6,
        fontSize: 14,
        fontWeight: 800,
        color: "#fff",
        background: "linear-gradient(180deg,#7aa6ff,#4a78e0)",
        padding: "4px 11px",
        borderRadius: 999,
        boxShadow: "0 6px 16px rgba(0,0,0,.4)",
      }}
    >
      ×2
    </div>
  );
}

// --- shared helpers ---------------------------------------------------------

function candidateCard(
  candidate: MerchantChoiceCandidate,
): JourneyCardObject | undefined {
  return candidate.gameObjects.find(
    (object): object is JourneyCardObject =>
      object.objectType === "catalogCard" || object.objectType === "deckCard",
  );
}

function CaptionLabel({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: ".14em",
        color,
        fontWeight: 800,
        marginTop: 8,
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}

function SlideArrow() {
  return (
    <div
      className="dj-anim-arrow"
      aria-hidden="true"
      style={{
        color: "#9b7bff",
        fontSize: 26,
        lineHeight: 1,
        animation: "dj-arrow-slide 2.4s ease-in-out infinite",
      }}
    >
      →
    </div>
  );
}

// --- purge card (shared by purge & purge_replace) ---------------------------

function PurgeCard({
  object,
  widthPx,
  sealSize,
}: {
  object: MerchantDeckCard;
  widthPx: number;
  sealSize: number;
}) {
  const overlay = (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 9,
          background:
            "linear-gradient(180deg, rgba(120,16,14,.18), rgba(120,16,14,.42))",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 3,
          width: sealSize,
          height: sealSize,
          borderRadius: "50%",
          background: "linear-gradient(180deg,#e0524c,#bd2f2a)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: sealSize * 0.5,
          fontWeight: 700,
          boxShadow: "0 6px 18px rgba(189,47,42,.6)",
        }}
      >
        ✕
      </div>
    </>
  );

  return (
    <JourneyCard
      object={object}
      widthPx={widthPx}
      ringShadow="0 0 38px rgba(224,60,54,.35), 0 16px 34px rgba(0,0,0,.55)"
      floatAnimation="dj-float-yb 5.2s ease-in-out infinite"
      imageFilter="grayscale(.5) brightness(.8)"
      overlay={overlay}
    />
  );
}

// --- duplicate pair (two overlapping copies) --------------------------------

function DuplicatePair({
  object,
  widthPx,
}: {
  object: JourneyCardObject;
  widthPx: number;
}) {
  return (
    <div
      className="dj-anim-card"
      style={{
        position: "relative",
        width: widthPx + 8,
        height: widthPx * 1.5 + 8,
        animation: "dj-float-y 5s ease-in-out infinite",
      }}
      data-testid="journey-duplicate-pair"
      data-card-uuid={object.cardUuid}
    >
      <div
        style={{
          position: "absolute",
          left: 16,
          top: -8,
          width: widthPx,
          borderRadius: 8,
          overflow: "hidden",
          transform: "rotate(7deg)",
          opacity: 0.85,
          boxShadow: "0 12px 26px rgba(0,0,0,.55)",
        }}
      >
        <CardView card={object.card} suppressHoverHelp className="block w-full" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 4,
          width: widthPx,
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: JOURNEY_RING_DUPLICATE,
        }}
      >
        <CardView card={object.card} suppressHoverHelp className="block w-full" />
      </div>
      <TwoBadge />
    </div>
  );
}

// --- before / after transfigure pair ----------------------------------------

function BeforeAfterPair({
  object,
  context,
  nowWidth,
  afterWidth,
}: {
  object: MerchantDeckCard;
  context?: MerchantContext;
  nowWidth: number;
  afterWidth: number;
}) {
  const original =
    context?.deckEntryById.get(object.entryId)?.card ?? object.card;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <JourneyCard
          object={object}
          widthPx={nowWidth}
          cardOverride={original}
          dim
          hoverPreview
        />
        <CaptionLabel text="Now" color="#7d7799" />
      </div>
      <SlideArrow />
      <div style={{ textAlign: "center" }}>
        <JourneyCard
          object={object}
          widthPx={afterWidth}
          usePreview
          ringShadow={JOURNEY_RING_TRANSFIGURE}
          floatAnimation="dj-float-y 5s ease-in-out infinite"
        />
        <CaptionLabel text="After" color="#5fe6cd" />
      </div>
    </div>
  );
}

// --- add-site map -----------------------------------------------------------

const SITE_LABELS: Partial<Record<SiteType, string>> = {
  Shop: "Shop",
  Purge: "Purge Site",
  Essence: "Essence Site",
  Transfiguration: "Transfiguration",
  Duplication: "Duplication",
  Reward: "Reward Site",
  Battle: "Battle",
  Draft: "Draft",
};

const SITE_ICONS: Partial<Record<SiteType, string>> = {
  Shop: "🛒",
  Purge: "🔥",
  Essence: "💧",
  Transfiguration: "🜂",
  Duplication: "♾️",
  Reward: "🎁",
  Battle: "⚔️",
  Draft: "🗂️",
};

function MapDashes() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 2,
        height: 24,
        background:
          "repeating-linear-gradient(180deg,#5a4a86 0 5px,transparent 5px 11px)",
      }}
    />
  );
}

function NeighborNode({
  siteType,
  trailing,
}: {
  siteType: SiteType;
  trailing: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: 0.65 }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: "rgba(30,24,52,.7)",
          border: "1px solid rgba(140,120,210,.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
        }}
      >
        {SITE_ICONS[siteType] ?? "•"}
      </div>
      <span style={{ fontSize: 12.5, color: "#8d86b0", fontWeight: 600 }}>
        {SITE_LABELS[siteType] ?? siteType} {trailing}
      </span>
    </div>
  );
}

function AddSiteMap({ siteType }: { siteType: SiteType }) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      data-testid="journey-add-site-map"
      data-site-type={siteType}
    >
      <NeighborNode
        siteType="Draft"
        trailing={<span style={{ color: "#46d39a" }}>✓</span>}
      />
      <MapDashes />
      <div style={{ position: "relative" }}>
        <div
          className="dj-anim-aura"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -9,
            borderRadius: 20,
            background:
              "radial-gradient(circle, rgba(90,220,140,.4), transparent 70%)",
            animation: "dj-glow-pulse-local 3s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "14px 20px 14px 14px",
            borderRadius: 16,
            background:
              "linear-gradient(180deg, rgba(36,48,42,.85), rgba(20,30,26,.9))",
            border: "1.5px solid rgba(120,235,160,.55)",
          }}
        >
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 14,
              background:
                "radial-gradient(circle at 38% 32%, #3a6b52, #16271e)",
              border: "1px solid rgba(120,235,160,.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            {SITE_ICONS[siteType] ?? "✨"}
          </div>
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".14em",
                color: "#7fe6a0",
              }}
            >
              + NEW SITE
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#eef7f0",
                marginTop: 2,
              }}
            >
              {SITE_LABELS[siteType] ?? siteType}
            </div>
          </div>
        </div>
      </div>
      <MapDashes />
      <NeighborNode siteType="Battle" trailing={<span>🔒</span>} />
    </div>
  );
}

// --- card grid (drafts / themed package) ------------------------------------

function CardGrid({
  candidates,
  selectedChoiceId,
  onSelectCandidate,
  transfigured,
  doubled,
}: {
  candidates: readonly MerchantChoiceCandidate[];
  selectedChoiceId?: string;
  onSelectCandidate: (candidate: MerchantChoiceCandidate) => void;
  transfigured: boolean;
  doubled: boolean;
}) {
  const columns = candidates.length <= 3 ? candidates.length : 2;
  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 124px)`,
    gap: 14,
    justifyContent: "center",
    alignItems: "center",
  };
  return (
    <div style={gridStyle}>
      {candidates.map((candidate, index) => {
        const cardObject = candidateCard(candidate);
        if (cardObject === undefined) return null;
        const selected = candidate.choiceId === selectedChoiceId;
        // The picked card in a "keep two copies" draft renders as the same
        // overlapping ×2 pair used by the duplicate flow, so the doubling reads
        // the moment it is selected.
        if (doubled && selected) {
          return (
            <button
              key={candidate.choiceId}
              type="button"
              onClick={() => onSelectCandidate(candidate)}
              data-testid={`journey-choice-${candidate.choiceId}`}
              data-selected="true"
              aria-label={candidate.title}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <DuplicatePair object={cardObject} widthPx={118} />
            </button>
          );
        }
        const ring = selected
          ? transfigured
            ? JOURNEY_RING_TRANSFIGURE
            : JOURNEY_RING_CHOSEN
          : JOURNEY_SHADOW_IDLE;
        const float = selected
          ? "dj-float-y 4.8s ease-in-out infinite"
          : `dj-float-yb 5.6s ease-in-out infinite ${String(index * 0.25)}s`;
        return (
          <JourneyCard
            key={candidate.choiceId}
            object={cardObject}
            widthPx={124}
            ringShadow={ring}
            floatAnimation={float}
            dim={!selected}
            usePreview={transfigured}
            onClick={() => onSelectCandidate(candidate)}
            selected={selected}
            overlay={
              selected ? (
                <ChosenBadge color={transfigured ? "#5fe6cd" : "#8b5cff"} />
              ) : undefined
            }
            testId={`journey-choice-${candidate.choiceId}`}
            ariaLabel={candidate.title}
          />
        );
      })}
    </div>
  );
}

// --- top-level dispatch -----------------------------------------------------

export function OfferObjects({
  presentation,
  context,
  selectedChoiceId,
  onSelectCandidate,
}: OfferObjectsProps) {
  switch (presentation.kind) {
    case "heroCard":
      return (
        <JourneyCard
          object={presentation.card}
          widthPx={202}
          ringShadow="0 0 44px rgba(124,77,255,.4), 0 18px 38px rgba(0,0,0,.55)"
          floatAnimation="dj-float-y 5.4s ease-in-out infinite"
        />
      );

    case "cardGrid":
      return (
        <CardGrid
          candidates={presentation.candidates}
          selectedChoiceId={selectedChoiceId}
          onSelectCandidate={onSelectCandidate}
          transfigured={presentation.transfigured}
          doubled={presentation.doubled}
        />
      );

    case "beforeAfter":
      return (
        <BeforeAfterPair
          object={presentation.object}
          context={context}
          nowWidth={128}
          afterWidth={142}
        />
      );

    case "beforeAfterMulti": {
      const single = presentation.objects.length === 1;
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          {presentation.objects.map((object) => (
            <BeforeAfterPair
              key={object.entryId}
              object={object}
              context={context}
              nowWidth={single ? 128 : 92}
              afterWidth={single ? 142 : 104}
            />
          ))}
        </div>
      );
    }

    case "cardBundle": {
      const wide = presentation.cards.length >= 3;
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {presentation.cards.map((card, index) => (
            <JourneyCard
              key={`${card.cardUuid}:${String(index)}`}
              object={card}
              widthPx={wide ? 118 : 138}
              floatAnimation={`dj-float-yb 5.4s ease-in-out infinite ${String(index * 0.2)}s`}
            />
          ))}
        </div>
      );
    }

    case "purge":
      return <PurgeCard object={presentation.object} widthPx={188} sealSize={54} />;

    case "purgeReplace":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <PurgeCard object={presentation.removed} widthPx={96} sealSize={34} />
          <SlideArrow />
          <CardGrid
            candidates={presentation.candidates}
            selectedChoiceId={selectedChoiceId}
            onSelectCandidate={onSelectCandidate}
            transfigured={false}
            doubled={false}
          />
        </div>
      );

    case "duplicateChoose":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          {presentation.candidates.map((candidate) => {
            const cardObject = candidateCard(candidate);
            if (cardObject === undefined || cardObject.objectType !== "deckCard") {
              return null;
            }
            const selected = candidate.choiceId === selectedChoiceId;
            if (selected) {
              return (
                <button
                  key={candidate.choiceId}
                  type="button"
                  onClick={() => onSelectCandidate(candidate)}
                  data-testid={`journey-choice-${candidate.choiceId}`}
                  data-selected="true"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <DuplicatePair object={cardObject} widthPx={120} />
                </button>
              );
            }
            return (
              <JourneyCard
                key={candidate.choiceId}
                object={cardObject}
                widthPx={104}
                dim
                onClick={() => onSelectCandidate(candidate)}
                selected={false}
                testId={`journey-choice-${candidate.choiceId}`}
                ariaLabel={candidate.title}
              />
            );
          })}
        </div>
      );

    case "duplicateSingle":
      return <DuplicatePair object={presentation.object} widthPx={140} />;

    case "dreamsign":
      return (
        <JourneyDreamsignIcon
          object={presentation.object}
          sizePx={104}
          floatAnimation="dj-float-y 5.2s ease-in-out infinite"
          caption={
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#d9d2f5",
                marginTop: 4,
              }}
            >
              {presentation.object.displayName}
            </div>
          }
        />
      );

    case "dreamsignGrid":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 22,
            flexWrap: "wrap",
          }}
        >
          {presentation.candidates.map((candidate) => {
            const object = candidate.gameObjects.find(
              (o): o is Extract<MerchantGameObject, { objectType: "dreamsign" }> =>
                o.objectType === "dreamsign",
            );
            if (object === undefined) return null;
            const selected = candidate.choiceId === selectedChoiceId;
            return (
              <JourneyDreamsignIcon
                key={candidate.choiceId}
                object={object}
                sizePx={114}
                dim={!selected}
                ringColor={selected ? "rgba(199,155,255,.95)" : undefined}
                floatAnimation="dj-float-yb 5.4s ease-in-out infinite"
                onClick={() => onSelectCandidate(candidate)}
                selected={selected}
                testId={`journey-choice-${candidate.choiceId}`}
                caption={
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: selected ? "#e7defc" : "#9a93c4",
                      maxWidth: 150,
                      textAlign: "center",
                    }}
                  >
                    {object.displayName}
                  </div>
                }
              />
            );
          })}
        </div>
      );

    case "addSite":
      return <AddSiteMap siteType={presentation.siteType} />;

    case "fallback":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          {presentation.objects.map((object, index) => {
            if (object.objectType === "dreamsign") {
              return (
                <JourneyDreamsignIcon
                  key={`${object.dreamsignId}:${String(index)}`}
                  object={object}
                  sizePx={96}
                />
              );
            }
            return (
              <JourneyCard
                key={`${object.cardUuid}:${String(index)}`}
                object={object}
                widthPx={150}
              />
            );
          })}
        </div>
      );
  }
}
