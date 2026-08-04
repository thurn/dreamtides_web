import { lazy, Suspense, type CSSProperties, type ReactElement } from "react";
import { InfoCard } from "../../components/overlay/InfoCard";
import { GalleryActionCard } from "../../components/card/GalleryActionCard";
import { CARD_ASPECT_RATIO_VALUE } from "../../components/card/card-aspect";
import type {
  RevealCard,
  RevealGameCard,
  RevealInfoCardModel,
} from "./model";

// The reading renderer is loaded across an asynchronous module boundary. This
// keeps CardView free to register with the coordinator in Task 3 without
// creating context -> overlay -> CardView -> context initialization cycles.
const RevealGameCard = lazy(async () => {
  const module = await import("../../components/card/CardView");
  return { default: module.CardView };
});

const COPY_OFFSET_FRACTION = 0.25;

export function revealGameCardCopyCount(card: RevealGameCard): number {
  return card.copies !== undefined && Number.isInteger(card.copies) && card.copies > 1
    ? card.copies
    : 1;
}

/** Width multiplier for a horizontal fan whose copies retain reading-card size. */
export function revealGameCardGroupWidthScale(card: RevealGameCard): number {
  return 1 + (revealGameCardCopyCount(card) - 1) * COPY_OFFSET_FRACTION;
}

function renderGameCard(card: RevealGameCard): ReactElement {
  return (
    <RevealGameCard
      card={card.displaySnapshot}
      transfiguration={card.transfiguration}
      selected={card.selected}
      selectionColor={card.selectionColor}
      figment={card.figment}
      rulesTextPresentation={card.rulesTextPresentation}
      eagerRulesFit
    />
  );
}

export function renderRevealCard(card: RevealCard, width: number): ReactElement {
  if (card.kind === "source") return <div data-reveal-render="source" style={{ width }} />;
  if (card.kind === "infoCard") return <div style={{ width, "--info-card-width": `${String(width)}px` } as CSSProperties}><InfoCard {...card.card} /></div>;
  if (card.kind === "galleryAction") {
    return (
      <div data-reveal-render="gallery-action" style={{ width }}>
        <GalleryActionCard action={card.action} width={width} />
      </div>
    );
  }
  const copies = revealGameCardCopyCount(card);
  if (copies === 1) {
    return (
      <Suspense fallback={<div data-reveal-render-pending="" style={{ width, aspectRatio: "2 / 3" }} />}>
        <div data-reveal-render="game-card" style={{ width }}>
          {renderGameCard(card)}
        </div>
      </Suspense>
    );
  }
  const groupScale = revealGameCardGroupWidthScale(card);
  const cardWidthPercent = 100 / groupScale;
  const offsetPercent = (COPY_OFFSET_FRACTION * 100) / groupScale;
  return (
    <Suspense fallback={<div data-reveal-render-pending="" style={{ width, aspectRatio: "2 / 3" }} />}>
      <div
        data-reveal-render="game-card-copies"
        data-reveal-game-card-copy-count={copies}
        style={{
          position: "relative",
          width,
          aspectRatio: `${CARD_ASPECT_RATIO_VALUE * groupScale}`,
        }}
      >
        {Array.from({ length: copies }, (_, index) => (
          <div
            key={index}
            data-reveal-game-card-copy={index}
            style={{
              position: "absolute",
              insetBlockStart: 0,
              insetInlineStart: `${String(index * offsetPercent)}%`,
              width: `${String(cardWidthPercent)}%`,
              zIndex: index,
            }}
          >
            {renderGameCard(card)}
          </div>
        ))}
      </div>
    </Suspense>
  );
}

export function renderRevealInfoCard(card: RevealInfoCardModel, width: number): ReactElement {
  return <div style={{ width, "--info-card-width": `${String(width)}px` } as CSSProperties}><InfoCard {...card} /></div>;
}
