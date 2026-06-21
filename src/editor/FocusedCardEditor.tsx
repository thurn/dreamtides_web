import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DEFAULT_ART_CROP,
  FIGMENT_ART_SAFE_AREA_TARGET,
  artPanStep,
  artSafeAreaTarget,
  minArtOffsetY,
  minArtScale,
} from "../components/CardView";
import {
  DEFAULT_DREAMWELL_ART_CROP,
  DREAMWELL_ART_OFFSET_MAX,
  DREAMWELL_ART_OFFSET_MIN,
  DREAMWELL_ART_SCALE_MAX,
  DREAMWELL_ART_SCALE_MIN,
  dreamwellArtPanStep,
} from "../components/DreamwellCardView";
import { cardImageUrl, hasAssignedImage } from "../data/card-database";
import type { ArtCrop } from "../types/cards";
import CardTagEditor from "./CardTagEditor";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import { applySymbolReplacements } from "./symbol-replacements";
import type { EditorTag } from "./types";

/**
 * The single "focused editor" surface shared by the card, figment, and Dreamwell
 * editors. It opens over one record and edits everything about it — the scalar
 * fields, the facet lists (tags / tides), the art image, and the art crop — in a
 * live-previewing modal. Every control applies on its own: text fields commit on
 * blur (and on close), selects and facet chips apply immediately, and the
 * pan / zoom / image controls persist a short moment after the last press. There
 * are no save buttons; the surrounding app reflects each change as its save
 * resolves.
 */

export type FocusedSaveStatus = "idle" | "saving" | "saved" | "error";

/** A scalar field rendered as a single control in the focused editor. */
export interface FocusedFieldSpec {
  /** Field key, e.g. `name`, `energy-cost`, `card-type`. */
  field: string;
  label: string;
  kind: "text" | "multiline" | "number" | "select";
  /** Options for `select` controls; ignored otherwise. */
  options?: readonly { value: string; label: string }[];
  /** Confirmed value, as the app currently holds it. */
  value: EditableFieldValue;
  /** Inline save-state entry, surfaced as a small status line under the field. */
  saveEntry?: EditableFieldSaveEntry | null;
  /**
   * Persist a committed value. Called on blur / Enter / close for text controls
   * and immediately for selects. The app validates and may no-op an unchanged or
   * invalid value.
   */
  onCommit: (value: EditableFieldValue) => void;
}

/** A facet (tags / tides) chip editor section. */
export interface FocusedTagSection {
  noun: string;
  values: string[];
  available: EditorTag[];
  saving: boolean;
  error: string | null;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onOpenManage: () => void;
}

/**
 * Which card frame the preview uses and which crop bounds the pan / zoom controls
 * respect. `card` frames a regular card (the safe area follows the measured rules
 * box, or the full bleed when `figment`); `dreamwell` frames a Dreamwell card with
 * its own fixed bounds.
 */
export type FocusedArtModel =
  | { kind: "card"; figment?: boolean }
  | { kind: "dreamwell" };

export interface FocusedArtSpec {
  model: FocusedArtModel;
  /** Confirmed crop. */
  art: ArtCrop;
  /** Confirmed image number. */
  imageNumber: number;
  onSaveArt: (art: ArtCrop) => void;
  onSaveImageNumber: (imageNumber: number) => void;
  artStatus: FocusedSaveStatus;
  artError: string | null;
  imageStatus: FocusedSaveStatus;
  imageError: string | null;
}

/** Live (pre-save) values handed to the caller so the preview tracks edits. */
export interface FocusedPreviewState {
  art: ArtCrop;
  imageNumber: number;
  /** Field drafts keyed by field, including values not yet committed. */
  fieldDrafts: Record<string, EditableFieldValue>;
  /** Wire this to a card preview's `onBoxTopFracChange` so crop bounds track it. */
  onBoxTopFracChange: (frac: number | null) => void;
}

export interface FocusedCardEditorProps {
  title: string;
  fields: readonly FocusedFieldSpec[];
  tagSections?: readonly FocusedTagSection[];
  art: FocusedArtSpec;
  renderPreview: (live: FocusedPreviewState) => ReactNode;
  onClose: () => void;
}

/** On-screen pan distance per press, as a fraction of the card. */
const PAN_CARD_FRACTION = 0.03;
/** Pan step applied to the raw crop offset until the source aspect is known. */
const PAN_STEP = 0.1;
/** Zoom factor change per press. */
const ZOOM_STEP = 0.1;
const OFFSET_MIN = -1;
const OFFSET_MAX = 1;
/** Zoom-out floor used until the source aspect is known. */
const SCALE_MIN = 1;
const SCALE_MAX = 5;
/** Delay before a pan / zoom adjustment persists, coalescing rapid presses. */
const SAVE_DEBOUNCE_MS = 400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function defaultCropFor(model: FocusedArtModel): ArtCrop {
  return model.kind === "dreamwell"
    ? { ...DEFAULT_DREAMWELL_ART_CROP }
    : { ...DEFAULT_ART_CROP };
}

/** Apply a pan / zoom delta to a crop, clamped to the model's bounds. */
function clampNudge(
  model: FocusedArtModel,
  current: ArtCrop,
  deltas: Partial<ArtCrop>,
  ctx: { aspect: number | null; boxTopFrac: number | null },
): ArtCrop {
  if (model.kind === "dreamwell") {
    return {
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
  }

  // A figment is full-bleed; a regular card's safe area follows the measured
  // rules box so a lower zoom leaves less overscan and the up-pan floor rises.
  const target = model.figment
    ? FIGMENT_ART_SAFE_AREA_TARGET
    : artSafeAreaTarget(ctx.boxTopFrac);
  const scaleMin =
    ctx.aspect !== null ? minArtScale(ctx.aspect, target) : SCALE_MIN;
  const scale = roundTo(
    clamp(current.scale + (deltas.scale ?? 0), scaleMin, SCALE_MAX),
    2,
  );
  const minY =
    ctx.aspect !== null ? minArtOffsetY(ctx.aspect, scale, target) : OFFSET_MIN;
  return {
    x: roundTo(clamp(current.x + (deltas.x ?? 0), OFFSET_MIN, OFFSET_MAX), 3),
    y: roundTo(clamp(current.y + (deltas.y ?? 0), minY, OFFSET_MAX), 3),
    scale,
  };
}

function panStepFor(
  model: FocusedArtModel,
  aspect: number | null,
  scale: number,
): { x: number; y: number } {
  if (aspect === null) {
    return { x: PAN_STEP, y: PAN_STEP };
  }
  return model.kind === "dreamwell"
    ? dreamwellArtPanStep(aspect, scale, PAN_CARD_FRACTION)
    : artPanStep(aspect, scale, PAN_CARD_FRACTION);
}

function parseImageNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/u.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : null;
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
  position: "relative",
  display: "flex",
  gap: "28px",
  alignItems: "stretch",
  maxWidth: "min(960px, 96vw)",
  width: "100%",
  maxHeight: "calc(100dvh - 48px)",
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

const inputStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  padding: "0 10px",
  height: "40px",
  borderRadius: "8px",
  border: "1px solid rgba(247, 241, 223, 0.28)",
  background: "#16242a",
  color: "#f7f1df",
  fontSize: "0.95rem",
  fontWeight: 600,
  fontFamily: "inherit",
};

function statusFor(
  entry: EditableFieldSaveEntry | null | undefined,
): { isError: boolean; text: string } | null {
  if (entry === null || entry === undefined) {
    return null;
  }
  const hasMessage = entry.message !== null && entry.message !== "";
  if (entry.status === "error") {
    return { isError: true, text: hasMessage ? entry.message ?? "" : "Save failed" };
  }
  if (entry.status === "editing" && hasMessage) {
    return { isError: true, text: entry.message ?? "" };
  }
  if (entry.status === "saving") {
    return { isError: false, text: "Saving…" };
  }
  if (entry.status === "saved") {
    return { isError: false, text: "Saved ✓" };
  }
  return null;
}

function StatusLine({
  isError,
  text,
  testId,
}: {
  isError: boolean;
  text: string;
  testId?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      data-editor-focused-status={testId}
      style={{
        display: "block",
        marginTop: "4px",
        minHeight: "1.1em",
        fontSize: "0.78rem",
        fontWeight: 700,
        color: isError ? "#f0a8a0" : "#8edbd1",
      }}
    >
      {text}
    </span>
  );
}

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

/**
 * A single scalar control (text / multiline / number / select). Text controls
 * hold a local draft that previews live and commits on blur or unmount; selects
 * commit immediately. There is no save button — the value applies on its own.
 */
function FocusedScalarField({
  spec,
  onDraft,
}: {
  spec: FocusedFieldSpec;
  onDraft: (field: string, value: EditableFieldValue) => void;
}) {
  const isSelect = spec.kind === "select";
  const [draft, setDraft] = useState<string>(() => String(spec.value));
  // Track focus so an external confirmed-value change does not clobber an open
  // edit, and keep the latest draft in a ref for the unmount flush.
  const focusedRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onCommitRef = useRef(spec.onCommit);
  onCommitRef.current = spec.onCommit;
  const confirmedRef = useRef(spec.value);
  confirmedRef.current = spec.value;
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  // Re-seed the draft from the confirmed value when it changes underneath an
  // idle field (e.g. a save resolved to a normalized value).
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(spec.value));
    }
  }, [spec.value]);

  // Commit the final draft when the field unmounts (modal closed) so a pending
  // edit is never silently dropped.
  useEffect(
    () => () => {
      if (String(draftRef.current) !== String(confirmedRef.current)) {
        onCommitRef.current(draftRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) {
      return;
    }
    pendingCaretRef.current = null;
    editorRef.current?.setSelectionRange(caret, caret);
  }, [draft]);

  const commit = useCallback(() => {
    if (String(draftRef.current) !== String(confirmedRef.current)) {
      spec.onCommit(draftRef.current);
    }
  }, [spec]);

  if (isSelect) {
    return (
      <label style={{ display: "block" }}>
        <span style={sectionLabelStyle}>{spec.label}</span>
        <select
          aria-label={spec.label}
          data-editor-focused-field={spec.field}
          value={String(spec.value)}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            onDraft(spec.field, next);
            spec.onCommit(next);
          }}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {(spec.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {(() => {
          const status = statusFor(spec.saveEntry);
          return status === null ? null : (
            <StatusLine
              isError={status.isError}
              text={status.text}
              testId={spec.field}
            />
          );
        })()}
      </label>
    );
  }

  const handleChange = (value: string, caret: number) => {
    const { value: nextValue, caret: nextCaret } = applySymbolReplacements(
      value,
      caret,
    );
    pendingCaretRef.current = nextValue === value ? null : nextCaret;
    setDraft(nextValue);
    onDraft(spec.field, nextValue);
  };

  const status = statusFor(spec.saveEntry);

  return (
    <label style={{ display: "block" }}>
      <span style={sectionLabelStyle}>{spec.label}</span>
      {spec.kind === "multiline" ? (
        <textarea
          aria-label={spec.label}
          data-editor-focused-field={spec.field}
          ref={(element) => {
            editorRef.current = element;
          }}
          value={draft}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(event) =>
            handleChange(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? event.currentTarget.value.length,
            )
          }
          onBlur={() => {
            focusedRef.current = false;
            commit();
          }}
          rows={4}
          style={{
            ...inputStyle,
            height: "auto",
            minHeight: "92px",
            padding: "8px 10px",
            lineHeight: 1.35,
            resize: "vertical",
          }}
        />
      ) : (
        <input
          type="text"
          inputMode={spec.kind === "number" ? "numeric" : undefined}
          aria-label={spec.label}
          data-editor-focused-field={spec.field}
          ref={(element) => {
            editorRef.current = element;
          }}
          value={draft}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(event) =>
            handleChange(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? event.currentTarget.value.length,
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={() => {
            focusedRef.current = false;
            commit();
          }}
          style={inputStyle}
        />
      )}
      {status === null ? (
        <span style={{ display: "block", minHeight: "1.1em", marginTop: "4px" }} />
      ) : (
        <StatusLine isError={status.isError} text={status.text} testId={spec.field} />
      )}
    </label>
  );
}

export default function FocusedCardEditor({
  title,
  fields,
  tagSections = [],
  art: artSpec,
  renderPreview,
  onClose,
}: FocusedCardEditorProps) {
  const { model } = artSpec;

  const [art, setArt] = useState<ArtCrop>(() => ({ ...artSpec.art }));
  const [imageText, setImageText] = useState<string>(() =>
    String(artSpec.imageNumber),
  );
  const [imageInputError, setImageInputError] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [boxTopFrac, setBoxTopFrac] = useState<number | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<
    Record<string, EditableFieldValue>
  >(() => {
    const initial: Record<string, EditableFieldValue> = {};
    for (const field of fields) {
      initial[field.field] = field.value;
    }
    return initial;
  });

  const handleFieldDraft = useCallback(
    (field: string, value: EditableFieldValue) => {
      setFieldDrafts((current) =>
        current[field] === value ? current : { ...current, [field]: value },
      );
    },
    [],
  );

  const parsedImageNumber = parseImageNumber(imageText);
  const effectiveImageNumber = parsedImageNumber ?? artSpec.imageNumber;

  const handleBoxTopFracChange = useCallback((frac: number | null) => {
    setBoxTopFrac((prev) => (prev === frac ? prev : frac));
  }, []);

  // Load the previewed image to learn its aspect; the crop bounds depend on it.
  useEffect(() => {
    if (!hasAssignedImage(effectiveImageNumber)) {
      setImageAspect(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setImageAspect(image.naturalWidth / image.naturalHeight);
      }
    };
    image.src = cardImageUrl(effectiveImageNumber);
    return () => {
      image.onload = null;
    };
  }, [effectiveImageNumber]);

  // Persist the latest crop shortly after the user stops pressing buttons so a
  // burst of pan / zoom clicks results in a single save.
  const onSaveArtRef = useRef(artSpec.onSaveArt);
  onSaveArtRef.current = artSpec.onSaveArt;
  const latestArtRef = useRef(art);
  latestArtRef.current = art;
  const savedArtRef = useRef<ArtCrop>({ ...artSpec.art });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushArt = useCallback(() => {
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

  const scheduleArtSave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushArt();
    }, SAVE_DEBOUNCE_MS);
  }, [flushArt]);

  useEffect(() => () => flushArt(), [flushArt]);

  const nudge = useCallback(
    (deltas: Partial<ArtCrop>) => {
      setArt((current) => {
        const next = clampNudge(model, current, deltas, {
          aspect: imageAspect,
          boxTopFrac,
        });
        latestArtRef.current = next;
        return next;
      });
      scheduleArtSave();
    },
    [model, imageAspect, boxTopFrac, scheduleArtSave],
  );

  const resetCrop = useCallback(() => {
    setArt(() => {
      const next = defaultCropFor(model);
      latestArtRef.current = next;
      return next;
    });
    scheduleArtSave();
  }, [model, scheduleArtSave]);

  // Persist the image number on blur / Enter; an invalid entry shows an error
  // and keeps the prior image.
  const commitImageNumber = useCallback(() => {
    const parsed = parseImageNumber(imageText);
    if (parsed === null) {
      setImageInputError("Enter a non-negative whole number.");
      return;
    }
    setImageInputError(null);
    if (parsed !== artSpec.imageNumber) {
      artSpec.onSaveImageNumber(parsed);
    }
  }, [imageText, artSpec]);

  const handleClose = useCallback(() => {
    flushArt();
    onClose();
  }, [flushArt, onClose]);

  // Close on Escape from anywhere in the document, so the editor dismisses
  // whether or not focus currently sits inside the dialog. Nested popups (the
  // tag dropdown) intercept Escape in the capture phase and stop propagation,
  // so this only fires when no inner control is consuming the key.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  const panStep = panStepFor(model, imageAspect, art.scale);

  const imageStatusText =
    imageInputError ??
    (artSpec.imageStatus === "saving"
      ? "Saving…"
      : artSpec.imageStatus === "saved"
        ? "Saved ✓"
        : artSpec.imageStatus === "error"
          ? artSpec.imageError ?? "Save failed"
          : "");
  const imageStatusIsError =
    imageInputError !== null || artSpec.imageStatus === "error";

  const artStatusText =
    artSpec.artStatus === "saving"
      ? "Saving…"
      : artSpec.artStatus === "saved"
        ? "Saved ✓"
        : artSpec.artStatus === "error"
          ? artSpec.artError ?? "Save failed"
          : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${title}`}
      data-editor-focused-editor="true"
      style={overlayStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div style={panelStyle}>
        <button
          type="button"
          aria-label="Close editor"
          onClick={handleClose}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            width: "34px",
            height: "34px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: "8px",
            background: "transparent",
            color: "#c9d3cf",
            fontSize: "1.8rem",
            lineHeight: 1,
            cursor: "pointer",
            zIndex: 1,
          }}
        >
          ×
        </button>
        <div
          style={{
            flex: "0 0 auto",
            width: "min(440px, 48vw)",
            alignSelf: "flex-start",
          }}
        >
          {renderPreview({
            art,
            imageNumber: effectiveImageNumber,
            fieldDrafts,
            onBoxTopFracChange: handleBoxTopFracChange,
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            minWidth: 0,
            flex: "1 1 auto",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "12px",
              paddingRight: "32px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>{title}</h2>
          </div>

          {fields.map((field) => (
            <FocusedScalarField
              key={field.field}
              spec={field}
              onDraft={handleFieldDraft}
            />
          ))}

          <div>
            <p style={sectionLabelStyle}>Image number</p>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Image number"
              data-editor-focused-image-number="true"
              value={imageText}
              onChange={(event) => {
                setImageText(event.target.value);
                setImageInputError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitImageNumber();
                }
              }}
              onBlur={commitImageNumber}
              style={inputStyle}
            />
            <StatusLine
              isError={imageStatusIsError}
              text={imageStatusText}
              testId="image-number"
            />
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
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
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
              <button
                type="button"
                onClick={resetCrop}
                style={{
                  ...controlButtonStyle,
                  minWidth: "auto",
                  padding: "0 14px",
                  fontSize: "0.85rem",
                }}
              >
                Reset
              </button>
            </div>
            <div
              style={{
                marginTop: "6px",
                fontSize: "0.78rem",
                color: "#c9d3cf",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <span data-editor-focused-art-values="true">
                x {Math.round(art.x * 100)}% · y {Math.round(art.y * 100)}% ·{" "}
                {art.scale}×
              </span>
              <span
                role="status"
                aria-live="polite"
                style={{
                  minHeight: "1.1em",
                  color: artSpec.artStatus === "error" ? "#f0a8a0" : "#8edbd1",
                  fontWeight: 700,
                }}
              >
                {artStatusText}
              </span>
            </div>
          </div>

          {tagSections.map((section) => (
            <div key={section.noun}>
              <p style={sectionLabelStyle}>{`${section.noun}s`}</p>
              <CardTagEditor
                noun={section.noun}
                cardTags={section.values}
                availableTags={section.available}
                saving={section.saving}
                error={section.error}
                onAddTag={section.onAdd}
                onRemoveTag={section.onRemove}
                onOpenManageTags={section.onOpenManage}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
