import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DreamwellCardView,
  DEFAULT_DREAMWELL_ART_CROP,
  DREAMWELL_ART_OFFSET_MAX,
  DREAMWELL_ART_OFFSET_MIN,
  DREAMWELL_ART_SCALE_MAX,
  DREAMWELL_ART_SCALE_MIN,
  dreamwellArtPanStep,
} from "../components/DreamwellCardView";
import { cardImageUrl, hasAssignedImage } from "../data/card-database";
import type { ArtCrop } from "../types/cards";
import {
  dreamwellPreviewCard,
  type EditorDreamwellRecord,
} from "./dreamwell-types";

export type ArtSaveStatus = "idle" | "saving" | "saved" | "error";

export interface DreamwellArtEditorProps {
  record: EditorDreamwellRecord;
  imageNumberSaveStatus: ArtSaveStatus;
  imageNumberSaveError: string | null;
  cropSaveStatus: ArtSaveStatus;
  cropSaveError: string | null;
  onSaveImageNumber: (imageNumber: number) => void;
  onSaveArt: (art: ArtCrop) => void;
  onClose: () => void;
}

const ACCENT = "#8edbd1";

/**
 * On-screen distance (as a fraction of the card) the art shifts per pan press,
 * matching the regular card editor so a press moves the image the same visible
 * amount on both axes regardless of the source aspect.
 */
const PAN_CARD_FRACTION = 0.03;
/** Pan step used on the raw offset until the source aspect is known. */
const PAN_STEP = 0.1;
/** Zoom factor change per zoom press. */
const ZOOM_STEP = 0.1;
/** Delay before a pan/zoom adjustment is persisted, coalescing rapid presses. */
const SAVE_DEBOUNCE_MS = 400;

/** Parse the image-number field into a non-negative integer, or null. */
function parseImageNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/u.test(trimmed) ? Number(trimmed) : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Read the record's saved crop, or the default centered crop when unframed. */
function readRecordArt(record: EditorDreamwellRecord): ArtCrop {
  return record.art !== undefined ? { ...record.art } : { ...DEFAULT_DREAMWELL_ART_CROP };
}

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
  color: ACCENT,
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

function statusLabel(status: ArtSaveStatus, error: string | null): string {
  switch (status) {
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return error ?? "Save failed";
    case "idle":
      return "";
  }
}

/**
 * The Dreamwell art-edit modal, opened from the editor's art-edit mode (the same
 * affordance the figment editor uses). It repoints the card at a different art
 * image by number and frames that image with the same pan/zoom crop the regular
 * card editor offers, previewing the result live through {@link DreamwellCardView}.
 */
export default function DreamwellArtEditor({
  record,
  imageNumberSaveStatus,
  imageNumberSaveError,
  cropSaveStatus,
  cropSaveError,
  onSaveImageNumber,
  onSaveArt,
  onClose,
}: DreamwellArtEditorProps) {
  const [imageText, setImageText] = useState(String(record["image-number"]));
  const [inputError, setInputError] = useState<string | null>(null);
  const [art, setArt] = useState<ArtCrop>(() => readRecordArt(record));

  const parsed = parseImageNumber(imageText);
  const previewImageNumber = parsed ?? record["image-number"];

  // The pan step depends on the source aspect (and current zoom), so the image is
  // loaded to learn its aspect; until it resolves a fixed offset step is used.
  // The aspect tracks the previewed image so swapping art re-derives the step.
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  useEffect(() => {
    if (!hasAssignedImage(previewImageNumber)) {
      setImageAspect(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setImageAspect(image.naturalWidth / image.naturalHeight);
      }
    };
    image.src = cardImageUrl(previewImageNumber);
    return () => {
      image.onload = null;
    };
  }, [previewImageNumber]);

  // Persist the latest crop shortly after the user stops pressing buttons so a
  // burst of pan/zoom clicks results in a single save. The newest value is held
  // in a ref so the unmount/close flush always saves the final crop.
  const onSaveArtRef = useRef(onSaveArt);
  onSaveArtRef.current = onSaveArt;
  const latestArtRef = useRef(art);
  latestArtRef.current = art;
  const savedArtRef = useRef<ArtCrop>(readRecordArt(record));
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
    onSaveArtRef.current(next);
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

  useEffect(() => () => flush(), [flush]);

  // Deltas are applied through the functional updater so a rapid burst of clicks
  // accumulates from the latest state rather than a stale render value.
  const nudge = useCallback(
    (deltas: Partial<ArtCrop>) => {
      setArt((current) => {
        const next: ArtCrop = {
          x: roundTo(
            clamp(
              current.x + (deltas.x ?? 0),
              DREAMWELL_ART_OFFSET_MIN,
              DREAMWELL_ART_OFFSET_MAX,
            ),
            3,
          ),
          y: roundTo(
            clamp(
              current.y + (deltas.y ?? 0),
              DREAMWELL_ART_OFFSET_MIN,
              DREAMWELL_ART_OFFSET_MAX,
            ),
            3,
          ),
          scale: roundTo(
            clamp(
              current.scale + (deltas.scale ?? 0),
              DREAMWELL_ART_SCALE_MIN,
              DREAMWELL_ART_SCALE_MAX,
            ),
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
      const next: ArtCrop = { ...DEFAULT_DREAMWELL_ART_CROP };
      latestArtRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const handleClose = useCallback(() => {
    flush();
    onClose();
  }, [flush, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [handleClose]);

  const submitImageNumber = (): void => {
    const value = parseImageNumber(imageText);
    if (value === null) {
      setInputError("Enter a whole number of 0 or more.");
      return;
    }
    setInputError(null);
    if (value === record["image-number"]) {
      return;
    }
    onSaveImageNumber(value);
  };

  const panStep =
    imageAspect !== null
      ? dreamwellArtPanStep(imageAspect, art.scale, PAN_CARD_FRACTION)
      : { x: PAN_STEP, y: PAN_STEP };

  const imageStatusText =
    inputError ?? statusLabel(imageNumberSaveStatus, imageNumberSaveError);
  const imageStatusIsError =
    inputError !== null || imageNumberSaveStatus === "error";
  const cropStatusText = statusLabel(cropSaveStatus, cropSaveError);

  const fieldStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    background: "#0c1013",
    color: "#fff7e0",
    border: "1px solid rgba(247, 241, 223, 0.22)",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "0.9rem",
    fontFamily: "inherit",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit art for ${record.name}`}
      data-dreamwell-art-modal={record.id}
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(5, 8, 10, 0.74)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        style={{
          display: "flex",
          gap: "24px",
          maxWidth: "760px",
          width: "100%",
          background: "#161b1f",
          border: "1px solid rgba(247, 241, 223, 0.16)",
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 24px 70px rgba(0, 0, 0, 0.6)",
        }}
      >
        <div style={{ flex: "0 0 320px", maxWidth: "320px" }}>
          <DreamwellCardView
            card={{
              ...dreamwellPreviewCard(record),
              imageNumber: previewImageNumber,
              art,
            }}
          />
        </div>

        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
              {record.name} — art
            </h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close art editor"
              style={{
                background: "transparent",
                border: "1px solid rgba(247, 241, 223, 0.25)",
                color: "#f7f1df",
                borderRadius: "6px",
                padding: "4px 10px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Close
            </button>
          </div>

          <label
            htmlFor="dreamwell-art-image-number"
            style={sectionLabelStyle}
          >
            Art image number
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="dreamwell-art-image-number"
              data-editor-dreamwell-image-number-input="true"
              type="number"
              min={0}
              value={imageText}
              onChange={(event) => {
                setImageText(event.target.value);
                setInputError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitImageNumber();
                }
              }}
              style={{ ...fieldStyle, flex: "1 1 auto" }}
            />
            <button
              type="button"
              onClick={submitImageNumber}
              style={{
                border: "1px solid rgba(247, 241, 223, 0.35)",
                background: "#1f635d",
                color: "#fff7e0",
                borderRadius: "6px",
                padding: "0 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
          <span
            style={{
              display: "block",
              marginTop: "6px",
              fontSize: "0.72rem",
              color: "#6f7a76",
            }}
          >
            Resolves to /cards/&lt;n&gt;.webp. 0 renders a generated identicon.
          </span>
          {imageStatusText !== "" ? (
            <span
              data-editor-dreamwell-image-number-status="true"
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "0.76rem",
                color: imageStatusIsError ? "#f0a8a0" : ACCENT,
              }}
            >
              {imageStatusText}
            </span>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: "28px",
              marginTop: "20px",
              flexWrap: "wrap",
            }}
          >
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
              <button
                type="button"
                onClick={resetCrop}
                style={{
                  ...controlButtonStyle,
                  minWidth: "auto",
                  padding: "0 14px",
                  fontSize: "0.85rem",
                  marginTop: "10px",
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              fontSize: "0.78rem",
              color: "#c9d3cf",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span data-editor-dreamwell-art-values="true">
              x {Math.round(art.x * 100)}% · y {Math.round(art.y * 100)}% ·{" "}
              {art.scale}×
            </span>
            {cropStatusText !== "" ? (
              <span
                data-editor-dreamwell-art-status="true"
                style={{
                  color: cropSaveStatus === "error" ? "#f0a8a0" : ACCENT,
                  fontWeight: 700,
                }}
              >
                {cropStatusText}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
