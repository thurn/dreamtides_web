import { useState } from "react";
import { RulesText } from "./RulesText";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { definitionSideForCardHover } from "./CardHoverPreview";
import { extractGlossaryTerms } from "../data/glossary-terms";
import type { PopoverPlacementSide } from "./hover-popover-placement";
import type { Dreamsign } from "../types/quest";

/**
 * Floating popover that renders a full Dreamsign: large art, name, optional
 * Bane badge, and full effect rules text. Sized for use as `HoverPopover`
 * content from compressed Dreamsign rows or smaller Dreamsign cards where
 * the in-flow rules text is too dense to read at a glance.
 *
 * When the effect text references glossary terms and the caller passes the
 * resolved popover `side` + `anchorRect`, the definitions for those terms
 * stack immediately beside the dreamsign card (on the side facing the
 * viewport interior), matching the term-definition panel shown beside cards.
 *
 * The popover is purely presentational — it ships no interactivity of its
 * own. Callers wrap it in a `HoverPopover` (or render it inline) so it can
 * float above the surrounding screen.
 */

const POPOVER_ART_SIZE_PX = 96;
const POPOVER_WIDTH_PX = 240;

/**
 * Delay before showing the full-Dreamsign hover popover on an offering /
 * draft card. Tighter than the glossary-tooltip default (500ms) because
 * players are scanning a short list of dreamsigns and want quick previews
 * while moving across them.
 */
export const DREAMSIGN_HOVER_DELAY_MS = 300;

interface DreamsignHoverCardProps {
  dreamsign: Dreamsign;
  /**
   * Override for the `data-testid` attribute on the dreamsign card element.
   * Callers that already had a distinct testid (e.g. the HUD row's compact
   * tile popover) can keep that testid for stable test selectors. Defaults to
   * `"dreamsign-hover-card"`.
   */
  testid?: string;
  /**
   * The side the host `HoverPopover` resolved the popover onto, used to pick
   * which side the term-definitions panel sits on. Omit it (or `anchorRect`)
   * to render the dreamsign card alone with no definitions panel.
   */
  popoverSide?: PopoverPlacementSide;
  /** Anchor rect captured by the host `HoverPopover` when it opened. */
  anchorRect?: Pick<DOMRect, "left" | "right">;
}

export function DreamsignHoverCard({
  dreamsign,
  testid = "dreamsign-hover-card",
  popoverSide,
  anchorRect,
}: DreamsignHoverCardProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  const accent = dreamsign.isBane
    ? "rgba(239, 68, 68, 0.55)"
    : "rgba(168, 85, 247, 0.55)";

  const cardNode = (
    <div
      data-testid={testid}
      className="flex shrink-0 flex-col items-center gap-2 rounded-lg p-3 shadow-lg"
      style={{
        background: "rgba(15, 10, 24, 0.97)",
        border: `1px solid ${accent}`,
        boxShadow: "0 8px 22px rgba(0, 0, 0, 0.55)",
        width: POPOVER_WIDTH_PX,
      }}
    >
      {showImage && (
        <img
          src={`/dreamsigns/${String(dreamsign.imageName)}`}
          alt={dreamsign.imageAlt ?? dreamsign.name}
          className="object-contain"
          style={{
            height: POPOVER_ART_SIZE_PX,
            width: POPOVER_ART_SIZE_PX,
            filter: dreamsign.isBane ? "grayscale(0.5)" : "none",
          }}
          onError={() => {
            setImageBroken(true);
          }}
        />
      )}
      <div className="flex items-center gap-1.5">
        <span
          className="text-sm font-bold"
          style={{ color: dreamsign.isBane ? "#fca5a5" : "#f8fafc" }}
        >
          {dreamsign.name}
        </span>
        {dreamsign.isBane && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(239, 68, 68, 0.18)",
              color: "#fecaca",
              border: "1px solid rgba(239, 68, 68, 0.45)",
            }}
          >
            Bane
          </span>
        )}
      </div>
      <div
        className="text-center text-xs leading-snug"
        style={{ color: "#e2e8f0" }}
      >
        <RulesText text={dreamsign.effectDescription} />
      </div>
    </div>
  );

  const terms = extractGlossaryTerms(dreamsign.effectDescription);
  if (
    terms.length === 0 ||
    popoverSide === undefined ||
    anchorRect === undefined
  ) {
    return cardNode;
  }

  const viewportWidth =
    typeof window === "undefined" ? POPOVER_WIDTH_PX : window.innerWidth;
  const definitionSide = definitionSideForCardHover({
    anchorRect,
    popoverSide,
    viewportWidth,
  });
  const definitions = (
    <CardTermDefinitions
      text={dreamsign.effectDescription}
      testId={`${testid}-definition-stack`}
      side={definitionSide}
    />
  );

  return (
    <div
      className="flex max-w-[calc(100vw-12px)] items-start gap-2"
      data-dreamsign-hover-layout=""
      data-definition-side={definitionSide}
    >
      {definitionSide === "left" && definitions}
      {cardNode}
      {definitionSide === "right" && definitions}
    </div>
  );
}
