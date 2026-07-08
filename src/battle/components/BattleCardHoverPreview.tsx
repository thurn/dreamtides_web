import { CardDisplay } from "../../components/CardDisplay";
import { CardTermDefinitions } from "../../tango/components/card/CardTermDefinitions";
import { extractGlossaryTerms } from "../../data/glossary-terms";
import type { BattleCardInstance } from "../types";
import { battleCardDisplayFromInstance } from "./BattleCardView";

const PREVIEW_HEIGHT = 520;
const PREVIEW_WIDTH = 320;
const VIEWPORT_MARGIN = 20;
/** Width (px) of the term-definitions panel (`w-56`) plus its gap to the card. */
const DEFINITIONS_WIDTH = 224;
const DEFINITIONS_GAP = 8;

export function BattleCardHoverPreview({
  card,
  pointer,
}: {
  card: BattleCardInstance;
  pointer: {
    x: number;
    y: number;
  };
}) {
  const display = battleCardDisplayFromInstance(card);
  const hasTerms = extractGlossaryTerms(display.renderedText).length > 0;
  // Reserve room for the definitions panel only when the card has terms.
  const definitionsExtent = hasTerms ? DEFINITIONS_WIDTH + DEFINITIONS_GAP : 0;
  const totalWidth = PREVIEW_WIDTH + definitionsExtent;

  // Keep the card itself near the cursor: place the definitions panel on the
  // side that faces the viewport's interior, then shift the row left by the
  // panel's width when it sits on the card's left so the card stays put.
  const side: "left" | "right" =
    pointer.x > window.innerWidth / 2 ? "left" : "right";

  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    window.innerWidth - totalWidth - VIEWPORT_MARGIN,
  );
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    window.innerHeight - PREVIEW_HEIGHT - VIEWPORT_MARGIN,
  );
  const desiredLeft =
    side === "left" ? pointer.x + 24 - definitionsExtent : pointer.x + 24;
  const left = Math.min(Math.max(VIEWPORT_MARGIN, desiredLeft), maxLeft);
  const top = Math.min(Math.max(VIEWPORT_MARGIN, pointer.y - 28), maxTop);

  const cardNode = (
    <div className="shrink-0" style={{ width: `${String(PREVIEW_WIDTH)}px` }}>
      <div className="h-full w-full">
        <CardDisplay
          card={display}
          large
        />
      </div>
    </div>
  );

  return (
    <div
      data-battle-hover-preview=""
      className="battle-hover-preview"
      style={{
        left: `${String(left)}px`,
        top: `${String(top)}px`,
        width: `${String(totalWidth)}px`,
        maxWidth: `calc(100vw - ${String(VIEWPORT_MARGIN * 2)}px)`,
        display: "flex",
        alignItems: "flex-start",
        gap: `${String(DEFINITIONS_GAP)}px`,
      }}
    >
      {hasTerms && side === "left" && (
        <CardTermDefinitions text={display.renderedText} side="left" />
      )}
      {cardNode}
      {hasTerms && side === "right" && (
        <CardTermDefinitions text={display.renderedText} side="right" />
      )}
    </div>
  );
}
