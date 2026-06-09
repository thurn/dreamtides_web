import { imageFileUrl } from "./image-viewer-api";
import type { ColumnCount, ImageManifestEntry } from "./types";

export interface ImageGridProps {
  images: readonly ImageManifestEntry[];
  columns: ColumnCount;
}

/**
 * Candidate art spans a wide range of aspect ratios (landscape illustrations
 * through tall portraits). Each tile reserves a uniform 4:3 image area and
 * fits the source inside it with `object-fit: contain`, so every pixel of
 * every candidate stays visible (nothing is cropped — the point of the surface
 * is choosing art) while every row keeps a constant height. Without the fixed
 * box a single portrait image stretches its row and shoves its caption far
 * below its neighbours'.
 */
const IMAGE_BOX_ASPECT_RATIO = "4 / 3";

/**
 * The candidate-image grid. Images tile into a fixed number of equal-width
 * columns; each shows the authored card name beneath the image, with the
 * category and image number as secondary context.
 */
export default function ImageGrid({ images, columns }: ImageGridProps) {
  return (
    <div
      data-image-viewer-grid=""
      data-image-viewer-columns={columns}
      style={{
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
        paddingRight: "4px",
        paddingBottom: "8px",
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        alignItems: "start",
        gap: "16px",
      }}
    >
      {images.map((image) => (
        <figure
          key={`${image.category}/${image.filename}`}
          data-image-viewer-item=""
          style={{
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <div
            style={{
              width: "100%",
              aspectRatio: IMAGE_BOX_ASPECT_RATIO,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              overflow: "hidden",
              background: "#1a2024",
              border: image.used
                ? "2px solid #c8893f"
                : "1px solid rgba(247, 241, 223, 0.12)",
            }}
          >
            <img
              src={imageFileUrl(image.category, image.filename)}
              alt={image.cardName ?? image.filename}
              loading="lazy"
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                objectFit: "contain",
              }}
            />
          </div>
          <figcaption
            style={{ display: "flex", flexDirection: "column", gap: "2px" }}
          >
            <span
              style={{
                fontSize: "0.92rem",
                fontWeight: 700,
                color: "#f7f1df",
                lineHeight: 1.2,
              }}
            >
              {image.cardName ?? "—"}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "rgba(247, 241, 223, 0.45)",
              }}
            >
              {image.category}
              {image.subtype !== null ? ` · ${image.subtype}` : ""}
              {" · "}
              {image.imageNumber}
              {image.used ? " · used" : ""}
            </span>
            {image.cardNames.length > 0 ? (
              <span
                data-image-viewer-card-names=""
                style={{
                  marginTop: "2px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: "rgba(200, 137, 63, 0.85)",
                }}
              >
                {image.cardNames.map((cardName) => (
                  <span key={cardName}>{cardName}</span>
                ))}
              </span>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
