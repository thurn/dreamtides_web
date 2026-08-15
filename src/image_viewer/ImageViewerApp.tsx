import { useCallback, useEffect, useMemo, useState } from "react";
import { logEvent } from "../logging";
import ImageGrid from "./ImageGrid";
import ImageViewerToolbar from "./ImageViewerToolbar";
import {
  loadImageManifest,
  moveImageCategory,
  setFavorite,
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
  type ImageCategory,
  type ImageManifest,
  type ImageManifestEntry,
  type ImageViewerDisplayState,
  type ImageViewerCategory,
} from "./types";

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded" }
  | { kind: "error"; message: string };

/** Small seedable PRNG (mulberry32) so a shuffle is reproducible for one seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Return a new array with the entries Fisher–Yates shuffled by the given seed.
 * The same seed and input always yield the same order, so the gallery stays
 * stable across unrelated re-renders (filter toggles, used marks) until the
 * curator explicitly reshuffles.
 */
function shuffleBySeed(
  images: ImageManifestEntry[],
  seed: number,
): ImageManifestEntry[] {
  const random = mulberry32(seed);
  const shuffled = images.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Resolve the set of category subdirectories a selection expands to. */
function categoriesForSelection(
  category: ImageViewerCategory,
  manifest: ImageManifest,
): Set<ImageCategory> {
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
  // Seed for the random ordering. Bumped by the toolbar's Shuffle button so the
  // gallery reshuffles only on explicit request, not on every render.
  const [shuffleSeed, setShuffleSeed] = useState(() =>
    Math.floor(Math.random() * 0xffffffff),
  );
  const handleShuffle = useCallback(() => {
    setShuffleSeed(Math.floor(Math.random() * 0xffffffff));
  }, []);
  const isFavoritesPage =
    typeof window !== "undefined" &&
    window.location.pathname.replace(/\/+$/u, "") === "/images/favorites";

  const favoriteImageNumbers = useMemo(
    () =>
      new Set(
        manifest?.images
          .filter((image) => image.favorite)
          .map((image) => image.imageNumber) ?? [],
      ),
    [manifest],
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
    let filtered: ImageManifestEntry[];
    if (isFavoritesPage) {
      filtered = manifest.images.filter((image) =>
        favoriteImageNumbers.has(image.imageNumber),
      );
    } else {
      const selected = categoriesForSelection(displayState.category, manifest);
      filtered = manifest.images.filter(
        (image) =>
          selected.has(image.category) &&
          (displayState.showUsed || !(image.used || image.manuallyUsed)) &&
          (!displayState.onlyNamed || image.cardNames.length > 0),
      );
    }
    return displayState.randomOrder
      ? shuffleBySeed(filtered, shuffleSeed)
      : filtered;
  }, [
    manifest,
    isFavoritesPage,
    favoriteImageNumbers,
    displayState.category,
    displayState.showUsed,
    displayState.onlyNamed,
    displayState.randomOrder,
    shuffleSeed,
  ]);

  const favoriteImageCount = useMemo(
    () =>
      manifest?.images.filter((image) =>
        favoriteImageNumbers.has(image.imageNumber),
      ).length ?? 0,
    [manifest, favoriteImageNumbers],
  );

  const favoritesHref = useMemo(() => {
    const favoritesState: ImageViewerDisplayState = {
      ...displayState,
      category: ALL_CATEGORY,
      showUsed: false,
      onlyNamed: false,
    };
    return `/images/favorites${serializeImageViewerDisplayState(favoritesState)}`;
  }, [displayState]);

  const handleToggleFavorite = useCallback(
    (entry: ImageManifestEntry) => {
      const favorite = !entry.favorite;
      const nextFavoriteCount = favorite
        ? favoriteImageNumbers.size + 1
        : favoriteImageNumbers.size - 1;
      setActionError(null);
      setManifest((current) =>
        current === null
          ? current
          : {
              ...current,
              images: current.images.map((image) =>
                image.imageNumber === entry.imageNumber
                  ? { ...image, favorite }
                  : image,
              ),
            },
      );
      logEvent("image_viewer_favorite_toggled", {
        imageNumber: entry.imageNumber,
        category: entry.category,
        filename: entry.filename,
        favorite,
        favoriteCount: nextFavoriteCount,
      });
      setFavorite(entry.imageNumber, favorite).catch((error: unknown) => {
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
                    ? { ...image, favorite: !favorite }
                    : image,
                ),
              },
        );
      });
    },
    [favoriteImageNumbers],
  );

  // Toggle an image's manual-used mark. The mark is keyed by image number on the
  // server, so every manifest entry sharing that number flips together. The grid
  // updates optimistically and reverts if the request fails.
  const handleToggleUsed = useCallback((entry: ImageManifestEntry) => {
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
    logEvent("image_viewer_manual_used_toggled", {
      imageNumber: entry.imageNumber,
      category: entry.category,
      filename: entry.filename,
      manuallyUsed: nextUsed,
    });
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
  }, []);

  // Move an image to a different category subdirectory. The grid updates
  // optimistically and reverts to the original category if the move fails.
  const handleChangeCategory = useCallback(
    (entry: ImageManifestEntry, targetCategory: ImageCategory) => {
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
          {isFavoritesPage ? "Favorite Images" : "Image Viewer"}
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          ·
        </span>
        <span
          style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}
        >
          {isFavoritesPage ? "Saved in tracked JSON" : "Candidate card art"}
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
              isFavoritesPage={isFavoritesPage}
              favoritesCount={favoriteImageCount}
              favoritesHref={favoritesHref}
              allImagesHref="/images"
              categories={manifest.categories}
              hasGenericPool={manifest.genericSubdirs.length > 0}
              visibleCount={visibleImages.length}
              totalCount={manifest.images.length}
              onDisplayStateChange={setDisplayState}
              onShuffle={handleShuffle}
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
                {isFavoritesPage
                  ? "No favorite images yet."
                  : "No images match the current filters."}
              </p>
            ) : (
              <ImageGrid
                images={visibleImages}
                columns={displayState.columns}
                favoriteImageNumbers={favoriteImageNumbers}
                categories={manifest.categories}
                onToggleFavorite={handleToggleFavorite}
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
