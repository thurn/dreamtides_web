import type { CardData, FrozenCardData } from "../types/cards";
import { extractGlossaryTerms } from "../data/glossary-terms";
import { GlossaryDefinitionCard } from "../tango/components/GlossaryDefinitionCard";
import { CardDisplay } from "./CardDisplay";
import type { CardTransfigurationDisplay } from "../transfiguration/transfiguration-logic";
import type { PopoverPlacementSide } from "../tango/components/hover-popover-placement";

type DefinitionSide = "left" | "right";

interface CardHoverPreviewProps {
  card: CardData | FrozenCardData;
  testId: string;
  widthPx: number;
  popoverSide: PopoverPlacementSide;
  anchorRect: DOMRect;
  /** Paints the enlarged preview as transfigured when the card carries one. */
  transfiguration?: CardTransfigurationDisplay;
}

export function definitionSideForCardHover({
  anchorRect,
  popoverSide,
  viewportWidth,
}: {
  anchorRect: Pick<DOMRect, "left" | "right">;
  popoverSide: PopoverPlacementSide;
  viewportWidth: number;
}): DefinitionSide {
  if (popoverSide === "left") {
    return "left";
  }
  if (popoverSide === "right") {
    return "right";
  }

  const anchorCenterX = (anchorRect.left + anchorRect.right) / 2;
  return anchorCenterX > viewportWidth / 2 ? "left" : "right";
}

export function CardHoverPreview({
  card,
  testId,
  widthPx,
  popoverSide,
  anchorRect,
  transfiguration,
}: CardHoverPreviewProps) {
  const terms = extractGlossaryTerms(card.renderedText);
  const cardNode = (
    <div
      data-testid={testId}
      className="shrink-0"
      style={{ width: widthPx }}
    >
      <CardDisplay card={card} suppressHoverHelp transfiguration={transfiguration} />
    </div>
  );

  if (terms.length === 0) {
    return cardNode;
  }

  const viewportWidth =
    typeof window === "undefined" ? widthPx : window.innerWidth;
  const definitionSide = definitionSideForCardHover({
    anchorRect,
    popoverSide,
    viewportWidth,
  });
  const stack = (
    <div
      data-testid={`${testId}-definition-stack`}
      className="flex max-h-[min(70vh,360px)] w-56 flex-col gap-1 overflow-y-auto"
      data-definition-side={definitionSide}
    >
      {terms.map((entry) => (
        <GlossaryDefinitionCard key={entry.term} entry={entry} />
      ))}
    </div>
  );

  return (
    <div
      className="flex max-w-[calc(100vw-12px)] items-start gap-2"
      data-card-hover-preview-layout=""
      data-definition-side={definitionSide}
    >
      {definitionSide === "left" && stack}
      {cardNode}
      {definitionSide === "right" && stack}
    </div>
  );
}
