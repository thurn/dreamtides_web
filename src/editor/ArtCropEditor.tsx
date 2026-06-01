import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CardView, DEFAULT_ART_CROP } from "../components/CardView";
import type { ArtCrop } from "../types/cards";
import type { EditorCardRecord } from "./types";

/** Percentage points each pan press shifts the crop's focal point. */
const PAN_STEP = 2;
/** Zoom factor change per zoom press. */
const ZOOM_STEP = 0.05;
const OFFSET_MIN = 0;
const OFFSET_MAX = 100;
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
        const next: ArtCrop = {
          x: roundTo(clamp(current.x + (deltas.x ?? 0), OFFSET_MIN, OFFSET_MAX), 1),
          y: roundTo(clamp(current.y + (deltas.y ?? 0), OFFSET_MIN, OFFSET_MAX), 1),
          scale: roundTo(
            clamp(current.scale + (deltas.scale ?? 0), SCALE_MIN, SCALE_MAX),
            2,
          ),
        };
        latestArtRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
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
          <CardView card={previewCard} large suppressHoverHelp />
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
                onClick={() => nudge({ y: -PAN_STEP })}
              />
              <span />
              <ControlButton
                ariaLabel="Pan left"
                label="◀"
                onClick={() => nudge({ x: -PAN_STEP })}
              />
              <ControlButton
                ariaLabel="Pan down"
                label="▼"
                onClick={() => nudge({ y: PAN_STEP })}
              />
              <ControlButton
                ariaLabel="Pan right"
                label="▶"
                onClick={() => nudge({ x: PAN_STEP })}
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
              x {art.x}% · y {art.y}% · {art.scale}×
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
