import { useState } from "react";
import type { CardData } from "../types/cards";
import type { CardId } from "../types/card-identity";
import type { CardSizePreset } from "./card-size";
import { SIZE_PRESETS } from "./card-size";
import { CardView } from "../cumulus/components/card/CardView";
import CardBrowserGrid from "./card-browser/CardBrowserGrid";
import { StandaloneGlyph } from "../cumulus/components/controls/StandaloneGlyph";
import { GLYPHS, glyph } from "../cumulus/primitives/glyph";
import { RESONANCE_DATA } from "../data/resonance-data";
import { tideAccentColor, tideColorChip } from "./tide-visuals";
import type { Tides4DeckJson } from "../draft/pool/tides4-io";
import type { Resonance } from "../types/resonance-data";
import type { EditableTideField, EditorAvatar } from "./tides-types";
import type { AvatarId } from "../types/identifiers";

export type TideSaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

interface TidesDetailViewProps {
  tide: Tides4DeckJson;
  avatarById: ReadonlyMap<AvatarId, EditorAvatar>;
  cardById: ReadonlyMap<CardId, CardData>;
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
  cardById: ReadonlyMap<CardId, CardData>,
): ResolvedTideCard[] {
  const resolved: ResolvedTideCard[] = [];
  for (const entry of tide.cards) {
    const card = cardById.get(entry.id);
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
  cardById,
}: {
  tide: Tides4DeckJson;
  cardById: ReadonlyMap<CardId, CardData>;
}) {
  const first = tide.cards[0];
  if (first !== undefined) {
    const card = cardById.get(first.id);
    if (card === undefined) return null;
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 200, flex: "0 0 200px" }}>
          <CardView card={card} large />
        </div>
        <div>
          <div
            style={{ fontSize: "0.78rem", color: "rgba(247, 241, 223, 0.5)" }}
          >
            First card in curated order
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>
            {card.name}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function ResonancePicker({
  value,
  onChange,
}: {
  value: Resonance;
  onChange: (resonance: Resonance) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {RESONANCE_DATA.resonances.map((definition) => {
        const resonance = definition.id;
        const chip = tideColorChip(resonance);
        const selected = resonance === value;
        return (
          <button
            key={resonance}
            type="button"
            aria-pressed={selected}
            data-tide-resonance-option={resonance}
            onClick={() => onChange(resonance)}
            title={definition.displayName}
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
                ? `2px solid ${tideAccentColor(resonance)}`
                : `1px solid ${chip.border}`,
              boxShadow: selected ? `0 0 0 2px rgba(0,0,0,0.4)` : "none",
            }}
          >
            <StandaloneGlyph glyph={chip.icon} color="white" />
            {definition.displayName}
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
  cardById,
  size,
  saveStatus,
  onSizeChange,
  onSaveField,
  onBack,
}: TidesDetailViewProps) {
  const chip = tideColorChip(tide.resonance);
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
    if (next !== (tide.displayDescription ?? ""))
      onSaveField("displayDescription", next);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: "1 1 auto",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: "0 0 auto",
        }}
      >
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
          <StandaloneGlyph glyph={GLYPHS.chevronLeft} color="white" />
          All tides
        </button>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          style={{
            background: chip.background,
            borderColor: chip.border,
            color: "#ffffff",
          }}
        >
          <StandaloneGlyph glyph={glyph(`bx ${chip.icon}`)} color="white" />
          {tide.role}
        </span>
        <span
          style={{ color: "rgba(247, 241, 223, 0.55)", fontSize: "0.82rem" }}
        >
          {tide.id}
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
            cardById={cardById}
          />
          <div
            style={{
              flex: "1 1 320px",
              minWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
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
              <label
                style={FIELD_LABEL_STYLE}
                htmlFor="tide-display-description"
              >
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
              <span style={FIELD_LABEL_STYLE}>Resonance</span>
              <ResonancePicker
                value={tide.resonance}
                onChange={(resonance) =>
                  onSaveField("resonance", resonance)
                }
              />
            </div>
          </div>
        </section>

        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>
              Cards
              <span
                style={{
                  marginLeft: 8,
                  color: "rgba(247, 241, 223, 0.4)",
                  fontWeight: 600,
                }}
              >
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
            containerProps={{
              "aria-label": "Tide cards",
              style: { flex: "0 0 auto", overflow: "visible" },
            }}
            renderItem={(entry) => (
              <div style={{ position: "relative" }}>
                <CardView card={entry.card} />
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
