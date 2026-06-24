import { useState } from "react";
import type { CardData } from "../types/cards";
import type { CardSizePreset } from "../components/card-size";
import { SIZE_PRESETS } from "../components/card-size";
import { CardView } from "../components/CardView";
import CardBrowserGrid from "../components/card-browser/CardBrowserGrid";
import { DreamcallerPortrait } from "../components/DreamcallerPortrait";
import { RulesText } from "../components/RulesText";
import { TIDE_ACCENT_COLOR, TIDE_COLOR_CHIP } from "../components/tide-visuals";
import {
  TIDES4_COLORS,
  type Tides4Color,
  type Tides4DeckJson,
} from "../draft/pool/tides4-io";
import type { EditableTideField, EditorDreamcaller } from "./tides-types";

export type TideSaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

interface TidesDetailViewProps {
  tide: Tides4DeckJson;
  dreamcallerById: ReadonlyMap<string, EditorDreamcaller>;
  cardById: ReadonlyMap<string, CardData>;
  size: CardSizePreset;
  saveStatus: TideSaveStatus;
  onSizeChange: (size: CardSizePreset) => void;
  onSaveField: (field: EditableTideField, value: string) => void;
  onBack: () => void;
}

/** A resolved tide card: the catalog entry plus the copies in this tide. */
interface ResolvedTideCard {
  card: CardData;
  copies: number;
  /** A grid key that is unique even if the same card appears twice. */
  key: string;
}

function resolveTideCards(
  tide: Tides4DeckJson,
  cardById: ReadonlyMap<string, CardData>,
): ResolvedTideCard[] {
  const resolved: ResolvedTideCard[] = [];
  for (const entry of tide.cards) {
    const card = cardById.get(entry.id.toLowerCase());
    if (card === undefined) continue;
    resolved.push({ card, copies: entry.copies, key: entry.id });
  }
  return resolved;
}

function SaveStatusBadge({ saveStatus }: { saveStatus: TideSaveStatus }) {
  if (saveStatus.status === "idle") return null;
  const text =
    saveStatus.status === "saving"
      ? "Saving…"
      : saveStatus.status === "saved"
        ? "Saved"
        : saveStatus.message;
  const color = saveStatus.status === "error" ? "#f0a8a8" : "#8edbd1";
  return (
    <span role="status" style={{ fontSize: "0.78rem", color }}>
      {text}
    </span>
  );
}

/** The large featured token at the top of the detail view. */
function FeaturedSource({
  tide,
  dreamcallerById,
  cardById,
}: {
  tide: Tides4DeckJson;
  dreamcallerById: ReadonlyMap<string, EditorDreamcaller>;
  cardById: ReadonlyMap<string, CardData>;
}) {
  if (tide.role === "signature" && tide.dreamcallerId !== undefined) {
    const dreamcaller = dreamcallerById.get(tide.dreamcallerId.toLowerCase());
    if (dreamcaller === undefined) return null;
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <DreamcallerPortrait
          dreamcaller={dreamcaller}
          variant="panel"
          style={{ width: 160, flex: "0 0 160px" }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{dreamcaller.name}</div>
          <div style={{ color: "#8edbd1", fontSize: "0.85rem", marginBottom: 8 }}>
            {dreamcaller.title}
          </div>
          <div style={{ fontSize: "0.9rem", lineHeight: 1.4, maxWidth: 460 }}>
            <RulesText text={dreamcaller.renderedText} />
          </div>
        </div>
      </div>
    );
  }

  if (tide.leanCardId !== undefined) {
    const card = cardById.get(tide.leanCardId.toLowerCase());
    if (card === undefined) return null;
    const heading = tide.role === "facet" ? "Lean card" : "Seed card";
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 200, flex: "0 0 200px" }}>
          <CardView card={card} large suppressHoverHelp />
        </div>
        <div>
          <div style={{ fontSize: "0.78rem", color: "rgba(247, 241, 223, 0.5)" }}>
            {heading}
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{card.name}</div>
        </div>
      </div>
    );
  }

  return null;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: Tides4Color;
  onChange: (color: Tides4Color) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {TIDES4_COLORS.map((color) => {
        const chip = TIDE_COLOR_CHIP[color];
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            aria-pressed={selected}
            data-tide-color-option={color}
            onClick={() => onChange(color)}
            title={color}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 999,
              cursor: "pointer",
              textTransform: "capitalize",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "#ffffff",
              background: chip.background,
              border: selected
                ? `2px solid ${TIDE_ACCENT_COLOR[color]}`
                : `1px solid ${chip.border}`,
              boxShadow: selected ? `0 0 0 2px rgba(0,0,0,0.4)` : "none",
            }}
          >
            <i aria-hidden="true" className={`bx ${chip.icon} text-sm leading-none`} />
            {color}
          </button>
        );
      })}
    </div>
  );
}

const FIELD_LABEL_STYLE = {
  display: "block",
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "rgba(247, 241, 223, 0.6)",
  marginBottom: 4,
} as const;

const TEXT_INPUT_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(247, 241, 223, 0.2)",
  background: "#0e1215",
  color: "#f7f1df",
  fontSize: "0.9rem",
} as const;

export default function TidesDetailView({
  tide,
  dreamcallerById,
  cardById,
  size,
  saveStatus,
  onSizeChange,
  onSaveField,
  onBack,
}: TidesDetailViewProps) {
  const chip = TIDE_COLOR_CHIP[tide.color];
  const [displayName, setDisplayName] = useState(tide.displayName ?? "");
  const [displayDescription, setDisplayDescription] = useState(
    tide.displayDescription ?? "",
  );
  const resolvedCards = resolveTideCards(tide, cardById);

  function commitDisplayName() {
    const next = displayName.trim();
    if (next !== (tide.displayName ?? "")) onSaveField("displayName", next);
  }
  function commitDisplayDescription() {
    const next = displayDescription.trim();
    if (next !== (tide.displayDescription ?? "")) onSaveField("displayDescription", next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: "1 1 auto", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
        <button
          type="button"
          data-tide-back=""
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid rgba(247, 241, 223, 0.25)",
            background: "#1f635d",
            color: "#fff7e0",
            borderRadius: 8,
            padding: "8px 12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <i aria-hidden="true" className="bx bx-chevron-left text-base leading-none" />
          All tides
        </button>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          style={{ background: chip.background, borderColor: chip.border, color: "#ffffff" }}
        >
          <i aria-hidden="true" className={`bx ${chip.icon} text-sm leading-none`} />
          {tide.role}
        </span>
        <span style={{ color: "rgba(247, 241, 223, 0.55)", fontSize: "0.82rem" }}>
          {tide.name}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <SaveStatusBadge saveStatus={saveStatus} />
        </span>
      </div>

      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          paddingRight: 4,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <section
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            padding: 16,
            borderRadius: 12,
            border: `1px solid ${chip.border}`,
            background: "#171b1f",
          }}
        >
          <FeaturedSource
            tide={tide}
            dreamcallerById={dreamcallerById}
            cardById={cardById}
          />
          <div style={{ flex: "1 1 320px", minWidth: 280, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={FIELD_LABEL_STYLE} htmlFor="tide-display-name">
                Display name
              </label>
              <input
                id="tide-display-name"
                type="text"
                data-tide-field="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onBlur={commitDisplayName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                placeholder="A narrative, thematic name"
                style={TEXT_INPUT_STYLE}
              />
            </div>
            <div>
              <label style={FIELD_LABEL_STYLE} htmlFor="tide-display-description">
                Display description
              </label>
              <textarea
                id="tide-display-description"
                data-tide-field="displayDescription"
                value={displayDescription}
                onChange={(event) => setDisplayDescription(event.target.value)}
                onBlur={commitDisplayDescription}
                placeholder="A 10–20 word player-facing blurb"
                rows={3}
                style={{ ...TEXT_INPUT_STYLE, resize: "vertical" }}
              />
            </div>
            <div>
              <span style={FIELD_LABEL_STYLE}>Color</span>
              <ColorPicker
                value={tide.color}
                onChange={(color) => onSaveField("color", color)}
              />
            </div>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>
              Cards
              <span style={{ marginLeft: 8, color: "rgba(247, 241, 223, 0.4)", fontWeight: 600 }}>
                {resolvedCards.length}
              </span>
            </h2>
            <div style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
              {(["small", "medium", "large"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={size === preset}
                  onClick={() => onSizeChange(preset)}
                  style={{
                    width: 30,
                    height: 28,
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: "0.78rem",
                    color: size === preset ? "#0e1215" : "#f7f1df",
                    background: size === preset ? "#8edbd1" : "#1a1f23",
                    border: "1px solid rgba(247, 241, 223, 0.2)",
                  }}
                >
                  {SIZE_PRESETS[preset].label}
                </button>
              ))}
            </div>
          </div>
          <CardBrowserGrid
            items={resolvedCards}
            size={size}
            getKey={(entry) => entry.key}
            containerProps={{ "aria-label": "Tide cards", style: { flex: "0 0 auto", overflow: "visible" } }}
            renderItem={(entry) => (
              <div style={{ position: "relative" }}>
                <CardView card={entry.card} suppressHoverHelp />
                {entry.copies > 1 ? (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.78)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                    }}
                  >
                    ×{entry.copies}
                  </span>
                ) : null}
              </div>
            )}
          />
        </section>
      </div>
    </div>
  );
}
