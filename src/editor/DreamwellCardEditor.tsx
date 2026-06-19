import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { DreamwellCardView } from "../components/DreamwellCardView";
import { applySymbolReplacements } from "./symbol-replacements";
import {
  MAX_DREAMWELL_ORDER,
  dreamwellPreviewCard,
  type EditorDreamwellRecord,
  type SavableDreamwellField,
} from "./dreamwell-types";

export type FieldStatus = "idle" | "saving" | "saved" | "error";

export interface DreamwellCardEditorProps {
  record: EditorDreamwellRecord;
  /**
   * Persist a single field. Resolves once the source TOML has confirmed the
   * edit; rejects with an `Error` whose message is shown inline on the field.
   */
  onSave: (field: SavableDreamwellField, value: string | number) => Promise<void>;
  onClose: () => void;
}

const PANEL_BG = "#161b1f";
const ACCENT = "#8edbd1";

function statusLabel(status: FieldStatus, error: string | null): string | null {
  if (error !== null) {
    return error;
  }
  switch (status) {
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Save failed";
    default:
      return null;
  }
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.74rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#9fb0ab",
  marginBottom: "5px",
};

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

/** Parse a whole-number text field, returning null when it is not a >= 0 int. */
function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/u.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

interface SaveState {
  status: FieldStatus;
  error: string | null;
}

const IDLE: SaveState = { status: "idle", error: null };

/**
 * A focused modal for editing one Dreamwell card. The left column renders the
 * in-game {@link DreamwellCardView} live against the working draft so every edit
 * is previewed exactly as it appears in battle; the right column carries the
 * editable fields (name, rules text, energy added, deck order, art image
 * number). Each field commits on blur or Enter and shows its own save status.
 */
export default function DreamwellCardEditor({
  record,
  onSave,
  onClose,
}: DreamwellCardEditorProps) {
  const [name, setName] = useState(record.name);
  const [rulesText, setRulesText] = useState(record["rendered-text"]);
  const [energyText, setEnergyText] = useState(String(record["energy-added"]));
  const [imageText, setImageText] = useState(String(record["image-number"]));
  const [order, setOrder] = useState(record.order);

  const [saveStates, setSaveStates] = useState<
    Record<SavableDreamwellField, SaveState>
  >({
    name: IDLE,
    "rendered-text": IDLE,
    "energy-added": IDLE,
    order: IDLE,
    "image-number": IDLE,
  });

  const rulesRef = useRef<HTMLTextAreaElement | null>(null);

  // Re-seed the working draft when the confirmed record changes (a save returns
  // the re-read source record), so an in-flight field that was not edited still
  // reflects the canonical value.
  useEffect(() => {
    setName(record.name);
    setRulesText(record["rendered-text"]);
    setEnergyText(String(record["energy-added"]));
    setImageText(String(record["image-number"]));
    setOrder(record.order);
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

  const setFieldState = useCallback(
    (field: SavableDreamwellField, next: SaveState) => {
      setSaveStates((current) => ({ ...current, [field]: next }));
    },
    [],
  );

  const commit = useCallback(
    (field: SavableDreamwellField, value: string | number, confirmed: string | number) => {
      if (String(value) === String(confirmed)) {
        setFieldState(field, IDLE);
        return;
      }
      setFieldState(field, { status: "saving", error: null });
      onSave(field, value)
        .then(() => {
          setFieldState(field, { status: "saved", error: null });
        })
        .catch((error: unknown) => {
          setFieldState(field, {
            status: "error",
            error: error instanceof Error ? error.message : "Save failed.",
          });
        });
    },
    [onSave, setFieldState],
  );

  const previewCard = useMemo(
    () =>
      dreamwellPreviewCard({
        ...record,
        name: name.trim() === "" ? record.name : name,
        "rendered-text": rulesText,
        "energy-added": parseWholeNumber(energyText) ?? record["energy-added"],
        "image-number": parseWholeNumber(imageText) ?? record["image-number"],
      }),
    [record, name, rulesText, energyText, imageText],
  );

  const renderStatus = (field: SavableDreamwellField) => {
    const state = saveStates[field];
    const text = statusLabel(state.status, state.error);
    if (text === null) {
      return <span style={{ minHeight: "1em", display: "block" }} />;
    }
    const isError = state.status === "error";
    return (
      <span
        style={{
          display: "block",
          marginTop: "4px",
          fontSize: "0.74rem",
          color: isError ? "#f0a8a0" : ACCENT,
        }}
      >
        {text}
      </span>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${record.name}`}
      data-dreamwell-editor-modal={record.id}
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
          gap: "26px",
          maxWidth: "860px",
          width: "100%",
          maxHeight: "calc(100dvh - 48px)",
          overflowY: "auto",
          background: PANEL_BG,
          border: "1px solid rgba(247, 241, 223, 0.16)",
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 24px 70px rgba(0, 0, 0, 0.6)",
        }}
      >
        <div style={{ flex: "0 0 320px", maxWidth: "320px" }}>
          <DreamwellCardView card={previewCard} />
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "0.76rem",
              color: "#7f8b87",
              textAlign: "center",
            }}
          >
            Card #{record["card-number"]} · deck slot {order}
          </p>
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
              Edit Dreamwell card
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close editor"
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

          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle} htmlFor="dreamwell-name">
              Name
            </label>
            <input
              id="dreamwell-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              onBlur={() => {
                commit("name", name.trim(), record.name);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              style={fieldStyle}
            />
            {renderStatus("name")}
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle} htmlFor="dreamwell-rules">
              Rules text
            </label>
            <textarea
              id="dreamwell-rules"
              ref={rulesRef}
              value={rulesText}
              rows={3}
              onChange={(event) => {
                const { value, selectionStart } = event.target;
                const replaced = applySymbolReplacements(value, selectionStart ?? value.length);
                setRulesText(replaced.value);
                if (replaced.value !== value) {
                  requestAnimationFrame(() => {
                    const node = rulesRef.current;
                    if (node !== null) {
                      node.setSelectionRange(replaced.caret, replaced.caret);
                    }
                  });
                }
              }}
              onBlur={() => {
                commit("rendered-text", rulesText, record["rendered-text"]);
              }}
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.4 }}
            />
            <span
              style={{
                display: "block",
                marginTop: "3px",
                fontSize: "0.7rem",
                color: "#6f7a76",
              }}
            >
              Shortcuts: \e ● · \c ⧗ · \s ✦ · \f ❖ · \d – · \t ▸
            </span>
            {renderStatus("rendered-text")}
          </div>

          <div style={{ display: "flex", gap: "14px", marginBottom: "14px" }}>
            <div style={{ flex: "1 1 0" }}>
              <label style={labelStyle} htmlFor="dreamwell-energy">
                Energy added ●
              </label>
              <input
                id="dreamwell-energy"
                type="number"
                min={0}
                value={energyText}
                onChange={(event) => {
                  setEnergyText(event.target.value);
                }}
                onBlur={() => {
                  const parsed = parseWholeNumber(energyText);
                  if (parsed === null) {
                    setEnergyText(String(record["energy-added"]));
                    setFieldState("energy-added", {
                      status: "error",
                      error: "Enter a whole number of 0 or more.",
                    });
                    return;
                  }
                  commit("energy-added", parsed, record["energy-added"]);
                }}
                style={fieldStyle}
              />
              {renderStatus("energy-added")}
            </div>

            <div style={{ flex: "1 1 0" }}>
              <label style={labelStyle} htmlFor="dreamwell-order">
                Deck order
              </label>
              <select
                id="dreamwell-order"
                value={order}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setOrder(next);
                  commit("order", next, record.order);
                }}
                style={fieldStyle}
              >
                {Array.from({ length: MAX_DREAMWELL_ORDER + 1 }, (_, slot) => (
                  <option key={slot} value={slot}>
                    {slot === 0 ? "0 (starting card)" : String(slot)}
                  </option>
                ))}
              </select>
              {renderStatus("order")}
            </div>
          </div>

          <div style={{ marginBottom: "4px" }}>
            <label style={labelStyle} htmlFor="dreamwell-image">
              Art image number
            </label>
            <input
              id="dreamwell-image"
              type="number"
              min={0}
              value={imageText}
              onChange={(event) => {
                setImageText(event.target.value);
              }}
              onBlur={() => {
                const parsed = parseWholeNumber(imageText);
                if (parsed === null) {
                  setImageText(String(record["image-number"]));
                  setFieldState("image-number", {
                    status: "error",
                    error: "Enter a whole number of 0 or more.",
                  });
                  return;
                }
                commit("image-number", parsed, record["image-number"]);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              style={fieldStyle}
            />
            <span
              style={{
                display: "block",
                marginTop: "3px",
                fontSize: "0.7rem",
                color: "#6f7a76",
              }}
            >
              Resolves to /cards/&lt;n&gt;.webp. 0 renders a generated identicon.
            </span>
            {renderStatus("image-number")}
          </div>
        </div>
      </div>
    </div>
  );
}
