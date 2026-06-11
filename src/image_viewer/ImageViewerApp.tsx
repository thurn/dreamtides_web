import { useCallback, useEffect, useMemo, useState } from "react";
import ImageGrid from "./ImageGrid";
import ImageViewerToolbar from "./ImageViewerToolbar";
import {
  loadImageManifest,
  moveImageCategory,
  setManualUsed,
} from "./image-viewer-api";
import {
  DEFAULT_IMAGE_VIEWER_DISPLAY_STATE,
  parseImageViewerDisplayState,
  serializeImageViewerDisplayState,
} from "./image-viewer-url-state";
import {
  ALL_CATEGORY,
  GENERIC_CATEGORY,
  type ImageManifest,
  type ImageManifestEntry,
  type ImageViewerDisplayState,
} from "./types";

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded" }
  | { kind: "error"; message: string };

/** Resolve the set of category subdirectories a selection expands to. */
function categoriesForSelection(
  category: string,
  manifest: ImageManifest,
): Set<string> {
  if (category === ALL_CATEGORY) {
    return new Set(manifest.categories);
  }
  if (category === GENERIC_CATEGORY) {
    return new Set(manifest.genericSubdirs);
  }
  return new Set([category]);
}

/** Top-level surface for `npm run images`. */
export default function ImageViewerApp() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [manifest, setManifest] = useState<ImageManifest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [displayState, setDisplayState] = useState<ImageViewerDisplayState>(
    () =>
      typeof window === "undefined"
        ? DEFAULT_IMAGE_VIEWER_DISPLAY_STATE
        : parseImageViewerDisplayState(window.location.search),
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoadStatus({ kind: "loading" });
    loadImageManifest(controller.signal)
      .then((loaded) => {
        setManifest(loaded);
        setLoadStatus({ kind: "loaded" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setLoadStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load.",
        });
      });
    return () => controller.abort();
  }, [loadAttempt]);

  // Reflect display state into the URL so a particular view is shareable and
  // survives a reload.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = serializeImageViewerDisplayState(displayState);
    const next = `${window.location.pathname}${query}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [displayState]);

  const visibleImages = useMemo<ImageManifestEntry[]>(() => {
    if (manifest === null) {
      return [];
    }
    const selected = categoriesForSelection(displayState.category, manifest);
    return manifest.images.filter(
      (image) =>
        selected.has(image.category) &&
        (displayState.showUsed || !(image.used || image.manuallyUsed)),
    );
  }, [manifest, displayState.category, displayState.showUsed]);

  // Toggle an image's manual-used mark. The mark is keyed by image number on the
  // server, so every manifest entry sharing that number flips together. The grid
  // updates optimistically and reverts if the request fails.
  const handleToggleUsed = useCallback(
    (entry: ImageManifestEntry) => {
      const nextUsed = !entry.manuallyUsed;
      setActionError(null);
      setManifest((current) =>
        current === null
          ? current
          : {
              ...current,
              images: current.images.map((image) =>
                image.imageNumber === entry.imageNumber
                  ? { ...image, manuallyUsed: nextUsed }
                  : image,
              ),
            },
      );
      setManualUsed(entry.imageNumber, nextUsed).catch((error: unknown) => {
        setActionError(
          error instanceof Error ? error.message : "Failed to update.",
        );
        setManifest((current) =>
          current === null
            ? current
            : {
                ...current,
                images: current.images.map((image) =>
                  image.imageNumber === entry.imageNumber
                    ? { ...image, manuallyUsed: !nextUsed }
                    : image,
                ),
              },
        );
      });
    },
    [],
  );

  // Move an image to a different category subdirectory. The grid updates
  // optimistically and reverts to the original category if the move fails.
  const handleChangeCategory = useCallback(
    (entry: ImageManifestEntry, targetCategory: string) => {
      if (targetCategory === entry.category) {
        return;
      }
      const fromCategory = entry.category;
      setActionError(null);
      setManifest((current) =>
        current === null
          ? current
          : {
              ...current,
              images: current.images.map((image) =>
                image.category === fromCategory &&
                image.filename === entry.filename
                  ? { ...image, category: targetCategory }
                  : image,
              ),
            },
      );
      moveImageCategory(fromCategory, entry.filename, targetCategory).catch(
        (error: unknown) => {
          setActionError(
            error instanceof Error ? error.message : "Failed to move image.",
          );
          setManifest((current) =>
            current === null
              ? current
              : {
                  ...current,
                  images: current.images.map((image) =>
                    image.category === targetCategory &&
                    image.filename === entry.filename
                      ? { ...image, category: fromCategory }
                      : image,
                  ),
                },
          );
        },
      );
    },
    [],
  );

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      data-image-viewer-layout="responsive-scroll-shell"
      style={{
        height: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "16px 20px",
        background: "#101417",
        color: "#f7f1df",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flex: "0 0 auto",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.05rem",
            fontWeight: 800,
            lineHeight: 1.1,
          }}
        >
          Image Viewer
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          ·
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          Candidate card art
        </span>
      </header>

      <section
        style={{
          display: "flex",
          flex: "1 1 auto",
          flexDirection: "column",
          minHeight: 0,
          paddingTop: "12px",
          gap: "12px",
        }}
      >
        {loadStatus.kind === "loading" ? (
          <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
            Loading candidate images…
          </p>
        ) : null}

        {loadStatus.kind === "loaded" && manifest !== null ? (
          <>
            <ImageViewerToolbar
              displayState={displayState}
              categories={manifest.categories}
              hasGenericPool={manifest.genericSubdirs.length > 0}
              visibleCount={visibleImages.length}
              totalCount={manifest.images.length}
              onDisplayStateChange={setDisplayState}
            />
            {actionError !== null ? (
              <p
                role="alert"
                style={{ margin: 0, color: "#f0c6bd", fontSize: "0.82rem" }}
              >
                {actionError}
              </p>
            ) : null}
            {visibleImages.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No images match the current filters.
              </p>
            ) : (
              <ImageGrid
                images={visibleImages}
                columns={displayState.columns}
                categories={manifest.categories}
                onToggleUsed={handleToggleUsed}
                onChangeCategory={handleChangeCategory}
              />
            )}
          </>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
              Unable to load images
            </h2>
            <p style={{ margin: "0 0 18px", color: "#f0c6bd" }}>
              {loadStatus.message}
            </p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              style={{
                border: "1px solid rgba(247, 241, 223, 0.35)",
                background: "#1f635d",
                color: "#fff7e0",
                borderRadius: "6px",
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
