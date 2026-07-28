import { lazy, Suspense, type CSSProperties, type ReactElement } from "react";
import { InfoCard } from "../../components/overlay/InfoCard";
import { GalleryActionCard } from "../../components/card/GalleryActionCard";
import type { RevealCard, RevealInfoCardModel } from "./model";

// The reading renderer is loaded across an asynchronous module boundary. This
// keeps CardView free to register with the coordinator in Task 3 without
// creating context -> overlay -> CardView -> context initialization cycles.
const RevealGameCard = lazy(async () => {
  const module = await import("../../components/card/CardView");
  return { default: module.CardView };
});

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
  return (
    <Suspense fallback={<div data-reveal-render-pending="" style={{ width, aspectRatio: "2 / 3" }} />}>
      <div data-reveal-render="game-card" style={{ width }}>
        <RevealGameCard
          card={card.displaySnapshot}
          transfiguration={card.transfiguration}
          selected={card.selected}
          selectionColor={card.selectionColor}
          figment={card.figment}
          eagerRulesFit
        />
      </div>
    </Suspense>
  );
}

export function renderRevealInfoCard(card: RevealInfoCardModel, width: number): ReactElement {
  return <div style={{ width, "--info-card-width": `${String(width)}px` } as CSSProperties}><InfoCard {...card} /></div>;
}
