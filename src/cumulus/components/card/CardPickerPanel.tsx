import type { ReactElement } from "react";
import {
  cardGallerySurface,
  type CardPickerPanelProps,
  type CardPickerPresentation,
} from "./card-gallery-surface";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { DeckEntryId } from "../../../types/identifiers";

const GallerySurface = cardGallerySurface;

function pickerColumnsFor(
  cardCount: number,
  isDesktop: boolean,
  presentation: CardPickerPresentation,
): "two" | "three" | "four" | "five" {
  const maximum = isDesktop ? 5 : presentation === "overlay" ? 2 : 4;
  const count = Math.max(2, Math.min(maximum, cardCount));
  if (count === 2) return "two";
  if (count === 3) return "three";
  if (count === 4) return "four";
  return "five";
}

/**
 * The transactional card-choice surface. It owns count-aware columns,
 * confirmation actions, and the compact mobile overlay recipe.
 */
export function CardPickerPanel<EntryId extends string = DeckEntryId>({
  presentation = "embedded",
  ...props
}: CardPickerPanelProps<EntryId>): ReactElement {
  const isDesktop = useIsDesktop();
  return (
    <GallerySurface
      {...props}
      role="picker"
      columns={pickerColumnsFor(props.cards.length, isDesktop, presentation)}
      cardSize={
        isDesktop
          ? props.cards.length <= 3
            ? "reading"
            : "standard"
          : "compact"
      }
      frame={
        presentation === "overlay" && !isDesktop ? "fullBleed" : "floating"
      }
      spacing={isDesktop ? "regular" : "compact"}
      heightMode={presentation === "overlay" ? "fill" : "content"}
    />
  );
}
