import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Hover tooltip showing a card's source Magic: The Gathering name. Rendered with
 * `position: fixed` and anchored to the owning card so it is never clipped by a
 * scrolling grid and follows the card on scroll/resize. It flips below the card
 * when the card sits too close to the top of the viewport to fit the tooltip
 * above it. Shared by the card editor and the Pool Viewer.
 */
export function MtgNameTooltip({
  anchorRef,
  mtgName,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  mtgName: string;
}) {
  const [layout, setLayout] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
  }>({ left: 0, top: 0, placement: "above" });

  useLayoutEffect(() => {
    const element = anchorRef.current;
    if (element === null) {
      return;
    }

    const update = () => {
      const rect = element.getBoundingClientRect();
      const placeAbove = rect.top >= 40;
      setLayout({
        left: rect.left + rect.width / 2,
        top: placeAbove ? rect.top - 6 : rect.bottom + 6,
        placement: placeAbove ? "above" : "below",
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  return (
    <span
      data-card-browser-mtg-tooltip="true"
      style={{
        position: "fixed",
        left: `${String(layout.left)}px`,
        top: `${String(layout.top)}px`,
        transform: `translateX(-50%) translateY(${
          layout.placement === "above" ? "-100%" : "0"
        })`,
        zIndex: 2147483000,
        pointerEvents: "none",
        maxWidth: "260px",
        padding: "3px 9px",
        borderRadius: "6px",
        background: "rgba(6, 16, 18, 0.97)",
        color: "#fff7e0",
        border: "1px solid rgba(142, 219, 209, 0.55)",
        fontSize: "0.7rem",
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
      }}
    >
      {`MTG: ${mtgName}`}
    </span>
  );
}
