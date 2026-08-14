import type { ReactElement } from "react";
import {
  cardGallerySurface,
  type CardBrowserPanelProps,
  type CardBrowserPresentation,
} from "./card-gallery-surface";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { DeckEntryId } from "../../../types/identifiers";

const GallerySurface = cardGallerySurface;

function frameForPresentation(
  presentation: CardBrowserPresentation,
  isDesktop: boolean,
): "floating" | "fullBleed" {
  if (presentation === "fullScreen") return "fullBleed";
  if (presentation === "overlay" && !isDesktop) return "fullBleed";
  return "floating";
}

/**
 * The collection-browsing card surface. It owns the canonical responsive grid,
 * optional browser toolbar, scrolling, and physical-card gestures.
 */
export function CardBrowserPanel<EntryId extends string = DeckEntryId>({
  presentation = "embedded",
  ...props
}: CardBrowserPanelProps<EntryId>): ReactElement {
  const isDesktop = useIsDesktop();
  return (
    <GallerySurface
      {...props}
      role="browser"
      columns={isDesktop ? "five" : "four"}
      cardSize={isDesktop ? "standard" : "compact"}
      frame={frameForPresentation(presentation, isDesktop)}
      spacing={isDesktop ? "regular" : "compact"}
      heightMode={presentation === "embedded" ? "content" : "fill"}
    />
  );
}
