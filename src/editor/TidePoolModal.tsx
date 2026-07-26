import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Tides4Color } from "../draft/pool/tides4-io";
import type {
  EditorDreamAvatarRecord,
  EditorTideOption,
  EditorTidePool,
} from "./dream-avatar-types";

export const TIDE_DOT_COLOR: Record<Tides4Color, string> = {
  purple: "#c084fc",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  orange: "#fb923c",
};

export interface TidePoolModalProps {
  dreamAvatar: EditorDreamAvatarRecord;
  tides: readonly EditorTideOption[];
  saving: boolean;
  saveError: string | null;
  onSave: (pool: EditorTidePool) => void;
  onClose: () => void;
}

function tideLabel(tide: EditorTideOption): string {
  return tide.displayName !== "" ? tide.displayName : tide.shortName !== "" ? tide.shortName : tide.name;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "rgba(4, 8, 10, 0.72)",
};

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "min(720px, 100%)",
  maxHeight: "100%",
  borderRadius: "12px",
  border: "1px solid rgba(142, 219, 209, 0.4)",
  background: "#10181b",
  color: "#f7f1df",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
  overflow: "hidden",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "0.78rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#8edbd1",
};

function tideChipStyle(active: boolean, color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "999px",
    border: active ? `1px solid ${color}` : "1px solid rgba(247, 241, 223, 0.22)",
    background: active ? "rgba(255, 255, 255, 0.08)" : "rgba(12, 18, 20, 0.85)",
    color: "#eef4f1",
    font: "inherit",
    fontSize: "0.8rem",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  };
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flex: "0 0 auto",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background: color,
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
      }}
    />
  );
}

export default function TidePoolModal({
  dreamAvatar,
  tides,
  saving,
  saveError,
  onSave,
  onClose,
}: TidePoolModalProps) {
  const [starter, setStarter] = useState<string | null>(dreamAvatar.tidePool.starter);
  const [facets, setFacets] = useState<string[]>(dreamAvatar.tidePool.facets);
  const [neutral, setNeutral] = useState<string[]>(dreamAvatar.tidePool.neutral);

  const { signatureTides, facetTides, neutralTides } = useMemo(() => {
    return {
      signatureTides: tides.filter((tide) => tide.role === "signature"),
      facetTides: tides.filter((tide) => tide.role === "facet"),
      neutralTides: tides.filter((tide) => tide.role === "neutral"),
    };
  }, [tides]);

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const facetsEmpty = facets.length === 0;
  const canSave = !saving && !facetsEmpty;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit tides for ${dreamAvatar.name}`}
      data-dream-avatar-tide-modal={dreamAvatar.id}
      style={overlayStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div style={panelStyle}>
        <header
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "baseline",
            gap: "10px",
            padding: "16px 18px",
            borderBottom: "1px solid rgba(247, 241, 223, 0.12)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 850 }}>Tides</h2>
          <span style={{ color: "#8edbd1", fontSize: "0.85rem", fontWeight: 700 }}>
            {dreamAvatar.name}
          </span>
        </header>

        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <section>
            <h3 style={sectionTitleStyle}>Starter (signature tide)</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                aria-pressed={starter === null}
                onClick={() => setStarter(null)}
                style={tideChipStyle(starter === null, "#94a3b8")}
              >
                None
              </button>
              {signatureTides.map((tide) => (
                <button
                  key={tide.id}
                  type="button"
                  aria-pressed={starter === tide.id}
                  title={`${tide.name} (${tide.id})`}
                  onClick={() => setStarter(starter === tide.id ? null : tide.id)}
                  style={tideChipStyle(starter === tide.id, TIDE_DOT_COLOR[tide.color])}
                >
                  <ColorDot color={TIDE_DOT_COLOR[tide.color]} />
                  <span>{tideLabel(tide)}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 style={sectionTitleStyle}>
              Facets ({facets.length}) — a random subset is drawn each run
            </h3>
            {facetsEmpty ? (
              <p style={{ margin: "0 0 8px", color: "#f0c6bd", fontSize: "0.78rem" }}>
                Select at least one facet tide.
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {facetTides.map((tide) => {
                const active = facets.includes(tide.id);
                return (
                  <button
                    key={tide.id}
                    type="button"
                    aria-pressed={active}
                    title={`${tide.name} (${tide.id})`}
                    onClick={() => setFacets((current) => toggle(current, tide.id))}
                    style={tideChipStyle(active, TIDE_DOT_COLOR[tide.color])}
                  >
                    <ColorDot color={TIDE_DOT_COLOR[tide.color]} />
                    <span>{tideLabel(tide)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 style={sectionTitleStyle}>Neutral ({neutral.length}) — broad fill tides</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {neutralTides.map((tide) => {
                const active = neutral.includes(tide.id);
                return (
                  <button
                    key={tide.id}
                    type="button"
                    aria-pressed={active}
                    title={`${tide.name} (${tide.id})`}
                    onClick={() => setNeutral((current) => toggle(current, tide.id))}
                    style={tideChipStyle(active, TIDE_DOT_COLOR[tide.color])}
                  >
                    <ColorDot color={TIDE_DOT_COLOR[tide.color]} />
                    <span>{tideLabel(tide)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <footer
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
            padding: "14px 18px",
            borderTop: "1px solid rgba(247, 241, 223, 0.12)",
          }}
        >
          {saveError !== null ? (
            <span style={{ marginRight: "auto", color: "#f0c6bd", fontSize: "0.8rem" }}>
              {saveError}
            </span>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            style={{
              border: "1px solid rgba(247, 241, 223, 0.28)",
              background: "transparent",
              color: "#d9e1dd",
              borderRadius: "6px",
              padding: "9px 14px",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave({ starter, facets, neutral })}
            style={{
              border: "1px solid rgba(142, 219, 209, 0.6)",
              background: canSave ? "#1f635d" : "#1a2a2c",
              color: canSave ? "#fff7e0" : "#7f928d",
              borderRadius: "6px",
              padding: "9px 16px",
              fontWeight: 800,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving..." : "Save tides"}
          </button>
        </footer>
      </div>
    </div>
  );
}
