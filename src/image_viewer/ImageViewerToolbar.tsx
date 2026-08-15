import type { CSSProperties } from "react";
import {
  ALL_CATEGORY,
  COLUMN_OPTIONS,
  GENERIC_CATEGORY,
  parseImageViewerCategory,
  type ColumnCount,
  type ImageCategory,
  type ImageViewerDisplayState,
} from "./types";

export interface ImageViewerToolbarProps {
  displayState: ImageViewerDisplayState;
  isFavoritesPage: boolean;
  favoritesCount: number;
  favoritesHref: string;
  allImagesHref: string;
  categories: ImageCategory[];
  hasGenericPool: boolean;
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (next: ImageViewerDisplayState) => void;
  /** Re-randomize the order; only meaningful while random order is enabled. */
  onShuffle: () => void;
}

const controlStyle: CSSProperties = {
  background: "#1a2024",
  color: "#f7f1df",
  border: "1px solid rgba(247, 241, 223, 0.25)",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "0.85rem",
  fontWeight: 600,
};

const labelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "0.8rem",
  color: "#c9d3cf",
  fontWeight: 600,
};

/** Title-case a category subdirectory name for display in the selector. */
function categoryLabel(name: string): string {
  return name
    .split(/[_\s]+/u)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Controls for the image viewer: pool/category selection, the used-image
 * filter toggle, and the per-row tiling count. Layout mirrors the card
 * editor's toolbar so the two surfaces feel like siblings.
 */
export default function ImageViewerToolbar({
  displayState,
  isFavoritesPage,
  favoritesCount,
  favoritesHref,
  allImagesHref,
  categories,
  hasGenericPool,
  visibleCount,
  totalCount,
  onDisplayStateChange,
  onShuffle,
}: ImageViewerToolbarProps) {
  return (
    <div
      data-image-viewer-toolbar=""
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "16px",
        flex: "0 0 auto",
      }}
    >
      <a
        data-image-viewer-favorites-link=""
        href={isFavoritesPage ? allImagesHref : favoritesHref}
        style={{
          ...controlStyle,
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
          background: isFavoritesPage ? "#7b5a20" : controlStyle.background,
          color: isFavoritesPage ? "#fff7e0" : "#f5c96a",
        }}
      >
        {isFavoritesPage ? "All images" : `Favorites (${favoritesCount})`}
      </a>

      {!isFavoritesPage ? (
        <label style={labelStyle}>
          Pool
          <select
            aria-label="Category"
            value={displayState.category}
            onChange={(event) =>
              onDisplayStateChange({
                ...displayState,
                category: parseImageViewerCategory(event.target.value),
              })
            }
            style={controlStyle}
          >
            <option value={ALL_CATEGORY}>All categories</option>
            {hasGenericPool ? (
              <option value={GENERIC_CATEGORY}>Generic (characters)</option>
            ) : null}
            {categories.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label style={labelStyle}>
        Per row
        <select
          aria-label="Images per row"
          value={String(displayState.columns)}
          onChange={(event) =>
            onDisplayStateChange({
              ...displayState,
              columns: Number(event.target.value) as ColumnCount,
            })
          }
          style={controlStyle}
        >
          {COLUMN_OPTIONS.map((count) => (
            <option key={count} value={String(count)}>
              {count}
            </option>
          ))}
        </select>
      </label>

      {!isFavoritesPage ? (
        <>
          <label style={{ ...labelStyle, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayState.showUsed}
              onChange={(event) =>
                onDisplayStateChange({
                  ...displayState,
                  showUsed: event.target.checked,
                })
              }
            />
            Show used images
          </label>

          <label style={{ ...labelStyle, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={displayState.onlyNamed}
              onChange={(event) =>
                onDisplayStateChange({
                  ...displayState,
                  onlyNamed: event.target.checked,
                })
              }
            />
            Only named images
          </label>
        </>
      ) : null}

      <label style={{ ...labelStyle, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={displayState.randomOrder}
          onChange={(event) =>
            onDisplayStateChange({
              ...displayState,
              randomOrder: event.target.checked,
            })
          }
        />
        Random order
      </label>

      {displayState.randomOrder ? (
        <button
          type="button"
          onClick={onShuffle}
          style={{ ...controlStyle, cursor: "pointer" }}
        >
          Shuffle
        </button>
      ) : null}

      <span
        role="status"
        style={{
          marginLeft: "auto",
          color: "rgba(247, 241, 223, 0.55)",
          fontSize: "0.8rem",
          fontWeight: 600,
        }}
      >
        {visibleCount} of {totalCount} images
      </span>
    </div>
  );
}
