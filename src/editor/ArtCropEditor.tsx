import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  CardView,
  DEFAULT_ART_CROP,
  artPanStep,
  artSafeAreaTarget,
  minArtOffsetY,
  minArtScale,
} from "../components/CardView";
import { cardImageUrl, hasAssignedImage } from "../data/card-database";
import type { ArtCrop } from "../types/cards";
import type { EditorCardRecord } from "./types";

/**
 * On-screen distance (as a fraction of the card) the art shifts per pan press.
 * The actual `art` offset step is derived per axis from this so a press moves
 * the image the same visible amount horizontally and vertically (see
 * `artPanStep`), rather than the crop offset stepping by a fixed amount and the
 * visible move differing wildly with the source's aspect.
 */
const PAN_CARD_FRACTION = 0.03;
/**
 * Pan step used until the source aspect is known (no image, or still loading),
 * applied to the raw crop offset on both axes.
 */
const PAN_STEP = 0.1;
/** Zoom factor change per zoom press. */
const ZOOM_STEP = 0.1;
const OFFSET_MIN = -1;
const OFFSET_MAX = 1;
/**
 * Fallback zoom-out floor used until the source aspect is known. Once it loads,
 * the floor becomes the box-relative `minArtScale`, which keeps the art from
 * zooming out past the point where it would no longer cover down to under the
 * box's first text line.
 */
const SCALE_MIN = 1;
const SCALE_MAX = 5;
/** Delay before an adjustment is persisted, coalescing rapid button presses. */
const SAVE_DEBOUNCE_MS = 400;

export type ArtSaveStatus = "idle" | "saving" | "saved" | "error";

export interface ArtCropEditorProps {
  card: EditorCardRecord;
  saveStatus: ArtSaveStatus;
  saveError: string | null;
  onSave: (art: ArtCrop) => void;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function readCardArt(card: EditorCardRecord): ArtCrop {
  const art = card.preview.art;
  if (art === undefined) {
    return { ...DEFAULT_ART_CROP };
  }
  return { x: art.x, y: art.y, scale: art.scale };
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "rgba(6, 12, 14, 0.78)",
};

const panelStyle: CSSProperties = {
  display: "flex",
  gap: "24px",
  flexWrap: "wrap",
  alignItems: "stretch",
  maxWidth: "640px",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid rgba(247, 241, 223, 0.18)",
  background: "#121c1f",
  color: "#f7f1df",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.55)",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const controlButtonStyle: CSSProperties = {
  minWidth: "40px",
  minHeight: "40px",
  border: "1px solid rgba(247, 241, 223, 0.28)",
  borderRadius: "8px",
  background: "#16242a",
  color: "#f7f1df",
  fontSize: "1.05rem",
  fontWeight: 800,
  cursor: "pointer",
};

const sectionLabelStyle: CSSProperties = {
  margin: "0 0 6px",
  color: "#8edbd1",
  fontSize: "0.74rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

function ControlButton({
  label,
  ariaLabel,
  onClick,
}: {
  label: ReactNode;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={controlButtonStyle}
    >
      {label}
    </button>
  );
}

function saveStatusLabel(status: ArtSaveStatus, error: string | null): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved ✓";
    case "error":
      return error ?? "Save failed";
    case "idle":
      return "";
  }
}

export default function ArtCropEditor({
  card,
  saveStatus,
  saveError,
  onSave,
  onClose,
}: ArtCropEditorProps) {
  const [art, setArt] = useState<ArtCrop>(() => readCardArt(card));

  // The lowest valid up-pan depends on the source aspect (and the current zoom),
  // so load the image to learn its aspect. Until it resolves, pan is clamped to
  // the editor's plain `OFFSET_MIN`; once known, `minArtOffsetY` bounds the up
  // arrow so it stops where the art would otherwise pull the watermark strip
  // into view and expose the fill band above the rules box.
  const imageNumber = card.preview.imageNumber;
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  // The preview card measures its rules-box top and reports it here, so the
  // zoom-out floor and up-pan bound track the same box-relative safe area the
  // card renders with (a taller box lets the art zoom out further).
  const [boxTopFrac, setBoxTopFrac] = useState<number | null>(null);
  const handleBoxTopFracChange = useCallback((frac: number | null) => {
    setBoxTopFrac((prev) => (prev === frac ? prev : frac));
  }, []);
  useEffect(() => {
    if (!hasAssignedImage(imageNumber)) {
      setImageAspect(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setImageAspect(image.naturalWidth / image.naturalHeight);
      }
    };
    image.src = cardImageUrl(imageNumber);
    return () => {
      image.onload = null;
    };
  }, [imageNumber]);

  // Persist the latest art shortly after the user stops pressing buttons so a
  // burst of pan/zoom clicks results in a single save. The newest value is
  // captured in a ref so the unmount flush always saves the final crop.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const latestArtRef = useRef(art);
  latestArtRef.current = art;
  const savedArtRef = useRef<ArtCrop>(readCardArt(card));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = latestArtRef.current;
    const saved = savedArtRef.current;
    if (next.x === saved.x && next.y === saved.y && next.scale === saved.scale) {
      return;
    }
    savedArtRef.current = next;
    onSaveRef.current(next);
  }, []);

  const scheduleSave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // Flush any pending change when the editor unmounts.
  useEffect(() => () => flush(), [flush]);

  // Deltas are applied through the functional updater so a rapid burst of
  // clicks accumulates from the latest state rather than a stale render value.
  const nudge = useCallback(
    (deltas: Partial<ArtCrop>) => {
      setArt((current) => {
        // The safe-area target follows the measured box, so the zoom-out floor
        // and up-pan bound are both resolved against it: zooming out cannot pull
        // the art above the box's first text line, and a lower zoom leaves less
        // overscan so the up-pan floor rises with it.
        const target = artSafeAreaTarget(boxTopFrac);
        const scaleMin =
          imageAspect !== null ? minArtScale(imageAspect, target) : SCALE_MIN;
        const scale = roundTo(
          clamp(current.scale + (deltas.scale ?? 0), scaleMin, SCALE_MAX),
          2,
        );
        const minY =
          imageAspect !== null
            ? minArtOffsetY(imageAspect, scale, target)
            : OFFSET_MIN;
        const next: ArtCrop = {
          x: roundTo(clamp(current.x + (deltas.x ?? 0), OFFSET_MIN, OFFSET_MAX), 3),
          y: roundTo(clamp(current.y + (deltas.y ?? 0), minY, OFFSET_MAX), 3),
          scale,
        };
        latestArtRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave, imageAspect, boxTopFrac],
  );

  const resetCrop = useCallback(() => {
    setArt(() => {
      const next: ArtCrop = { ...DEFAULT_ART_CROP };
      latestArtRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const handleClose = useCallback(() => {
    flush();
    onClose();
  }, [flush, onClose]);

  const previewCard = { ...card.preview, art };
  const statusText = saveStatusLabel(saveStatus, saveError);

  // Per-axis offset step that moves the art the same visible fraction of the
  // card on each press, derived from the source aspect and current zoom. Falls
  // back to the fixed offset step until the aspect is known.
  const panStep =
    imageAspect !== null
      ? artPanStep(imageAspect, art.scale, PAN_CARD_FRACTION)
      : { x: PAN_STEP, y: PAN_STEP };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit art crop for ${card.name}`}
      data-editor-art-editor="true"
      style={overlayStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          handleClose();
        }
      }}
    >
      <div style={panelStyle}>
        <div style={{ width: "260px", maxWidth: "60vw" }}>
          <CardView
            card={previewCard}
            large
            suppressHoverHelp
            onBoxTopFracChange={handleBoxTopFracChange}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            minWidth: "180px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>
              {card.name}
            </h2>
            <button
              type="button"
              aria-label="Close art editor"
              onClick={handleClose}
              style={{
                border: "none",
                background: "transparent",
                color: "#c9d3cf",
                fontSize: "1.3rem",
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          <div>
            <p style={sectionLabelStyle}>Pan</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 40px)",
                gridTemplateRows: "repeat(2, 40px)",
                gap: "6px",
                alignItems: "center",
                justifyItems: "center",
              }}
            >
              <span />
              <ControlButton
                ariaLabel="Pan up"
                label="▲"
                onClick={() => nudge({ y: -panStep.y })}
              />
              <span />
              <ControlButton
                ariaLabel="Pan left"
                label="◀"
                onClick={() => nudge({ x: -panStep.x })}
              />
              <ControlButton
                ariaLabel="Pan down"
                label="▼"
                onClick={() => nudge({ y: panStep.y })}
              />
              <ControlButton
                ariaLabel="Pan right"
                label="▶"
                onClick={() => nudge({ x: panStep.x })}
              />
            </div>
          </div>

          <div>
            <p style={sectionLabelStyle}>Zoom</p>
            <div style={{ display: "flex", gap: "6px" }}>
              <ControlButton
                ariaLabel="Zoom out"
                label="−"
                onClick={() => nudge({ scale: -ZOOM_STEP })}
              />
              <ControlButton
                ariaLabel="Zoom in"
                label="+"
                onClick={() => nudge({ scale: ZOOM_STEP })}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={resetCrop}
            style={{
              ...controlButtonStyle,
              minWidth: "auto",
              padding: "0 14px",
              fontSize: "0.85rem",
              alignSelf: "flex-start",
            }}
          >
            Reset
          </button>

          <div
            style={{
              marginTop: "auto",
              fontSize: "0.78rem",
              color: "#c9d3cf",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span data-editor-art-values="true">
              x {Math.round(art.x * 100)}% · y {Math.round(art.y * 100)}% ·{" "}
              {art.scale}×
            </span>
            <span
              role="status"
              aria-live="polite"
              style={{
                minHeight: "1.1em",
                color: saveStatus === "error" ? "#f0a8a0" : "#8edbd1",
                fontWeight: 700,
              }}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
