import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { CardSizePreset } from "../card-size";
import { SIZE_PRESETS } from "../card-size";

/** Div attributes plus arbitrary `data-*` hooks each surface can attach. */
export type CardBrowserDivProps = HTMLAttributes<HTMLDivElement> &
  Partial<Record<`data-${string}`, string>>;

export interface CardBrowserGridProps<T> {
  items: readonly T[];
  size: CardSizePreset;
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * Attributes spread onto the scrolling grid container, e.g. an `aria-label`
   * and surface-specific `data-*` hooks. Any `style` is merged on top of the
   * shared layout style.
   */
  containerProps?: CardBrowserDivProps;
  /** Attributes spread onto each card-item wrapper (drag handlers, data-*). */
  getItemProps?: (item: T, index: number) => CardBrowserDivProps;
}

/**
 * The shared scrolling card grid for the card-browsing surfaces. It tiles cards
 * at the active size preset's width, centers wrapped rows once a row reaches
 * five cards (so a full row never reads as unbalanced against trailing slack),
 * and establishes the `inline-size` container the "large" preset's draft-width
 * formula resolves against. The card editor renders editable cards through it
 * and the Pool Viewer renders read-only `BrowserCard`s.
 */
export default function CardBrowserGrid<T>({
  items,
  size,
  getKey,
  renderItem,
  containerProps,
  getItemProps,
}: CardBrowserGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Whether the widest row currently shows 5 or more cards.
  const [centerCards, setCenterCards] = useState(false);

  // Measure how many cards share the first (top) row by grouping the wrapped
  // flex items by their offset top. Centering does not change which items wrap
  // onto each row, so toggling alignment never feeds back into this count.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const measure = () => {
      const cardItems = container.querySelectorAll<HTMLElement>(
        "[data-card-browser-item]",
      );
      if (cardItems.length === 0) {
        setCenterCards(false);
        return;
      }

      const firstTop = cardItems[0].offsetTop;
      let firstRowCount = 0;
      for (const item of cardItems) {
        if (Math.abs(item.offsetTop - firstTop) > 1) {
          break;
        }
        firstRowCount += 1;
      }

      setCenterCards(firstRowCount >= 5);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [items, size]);

  const baseStyle: CSSProperties = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingRight: "4px",
    paddingBottom: "8px",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: centerCards ? "center" : "flex-start",
    containerType: "inline-size",
    gap: SIZE_PRESETS[size].gap,
  };

  const { style: containerStyleOverride, ...restContainerProps } =
    containerProps ?? {};

  return (
    <div
      ref={containerRef}
      data-card-browser-grid-size={size}
      {...restContainerProps}
      style={{ ...baseStyle, ...containerStyleOverride }}
    >
      {items.map((item, index) => {
        const { style: itemStyleOverride, ...restItemProps } =
          getItemProps?.(item, index) ?? {};
        return (
          <div
            key={getKey(item, index)}
            data-card-browser-item=""
            {...restItemProps}
            style={{
              flex: `0 0 ${SIZE_PRESETS[size].cardWidth}`,
              width: SIZE_PRESETS[size].cardWidth,
              maxWidth: "100%",
              ...itemStyleOverride,
            }}
          >
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );
}
