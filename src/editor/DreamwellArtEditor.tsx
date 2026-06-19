import { useEffect, useState, type CSSProperties } from "react";
import { DreamwellCardView } from "../components/DreamwellCardView";
import {
  dreamwellPreviewCard,
  type EditorDreamwellRecord,
} from "./dreamwell-types";

export type ArtSaveStatus = "idle" | "saving" | "saved" | "error";

export interface DreamwellArtEditorProps {
  record: EditorDreamwellRecord;
  saveStatus: ArtSaveStatus;
  saveError: string | null;
  onSaveImageNumber: (imageNumber: number) => void;
  onClose: () => void;
}

const ACCENT = "#8edbd1";

/** Parse the image-number field into a non-negative integer, or null. */
function parseImageNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/u.test(trimmed) ? Number(trimmed) : null;
}

/**
 * The Dreamwell art-edit modal, opened from the editor's art-edit mode (the same
 * affordance the figment editor uses). Dreamwell cards carry no art crop, so the
 * modal only repoints the card at a different art image by number, previewing
 * the result live through {@link DreamwellCardView}.
 */
export default function DreamwellArtEditor({
  record,
  saveStatus,
  saveError,
  onSaveImageNumber,
  onClose,
}: DreamwellArtEditorProps) {
  const [imageText, setImageText] = useState(String(record["image-number"]));
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setImageText(String(record["image-number"]));
  }, [record]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const parsed = parseImageNumber(imageText);
  const previewImageNumber = parsed ?? record["image-number"];

  const submit = (): void => {
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

  const statusText =
    inputError ??
    (saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? (saveError ?? "Save failed")
          : null);
  const statusIsError = inputError !== null || saveStatus === "error";

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
      onClick={onClose}
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
              onClick={onClose}
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
            style={{
              display: "block",
              fontSize: "0.74rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#9fb0ab",
              marginBottom: "5px",
            }}
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
                  submit();
                }
              }}
              style={{ ...fieldStyle, flex: "1 1 auto" }}
            />
            <button
              type="button"
              onClick={submit}
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
          {statusText !== null ? (
            <span
              data-editor-dreamwell-image-number-status="true"
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "0.76rem",
                color: statusIsError ? "#f0a8a0" : ACCENT,
              }}
            >
              {statusText}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
