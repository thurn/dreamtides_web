import { lazy, Suspense, type CSSProperties, type ReactElement } from "react";
import { InfoCard } from "../../components/overlay/InfoCard";
import type { RevealCard, RevealInfoCardModel } from "./model";

// The reading renderer is loaded across an asynchronous module boundary. This
// keeps CardView free to register with the coordinator in Task 3 without
// creating context -> overlay -> CardView -> context initialization cycles.
const RevealGameCard = lazy(async () => {
  const module = await import("../../components/card/CardView");
  return { default: module.GameCard };
});

export function renderRevealCard(card: RevealCard, width: number): ReactElement {
  if (card.kind === "infoCard") return <div style={{ width, "--info-card-width": `${String(width)}px` } as CSSProperties}><InfoCard {...card.card} /></div>;
  return (
    <Suspense fallback={<div data-reveal-render-pending="" style={{ width, aspectRatio: "2 / 3" }} />}>
      <div data-reveal-render="game-card" style={{ width }}>
        <RevealGameCard card={card.displaySnapshot} termDefinitions="none" eagerRulesFit />
      </div>
    </Suspense>
  );
}

export function renderRevealInfoCard(card: RevealInfoCardModel, width: number): ReactElement {
  return <div style={{ width, "--info-card-width": `${String(width)}px` } as CSSProperties}><InfoCard {...card} /></div>;
}
