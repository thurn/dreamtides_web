import type { CardData } from "../types/cards";
import type { Tides4DeckJson, Tides4Role } from "../draft/pool/tides4-io";
import { tideColorChip } from "./tide-visuals";
import { TideSourcePreview } from "./TideSourcePreview";
import { StandaloneGlyph } from "../cumulus/components/controls/StandaloneGlyph";
import type { EditorAvatar } from "./tides-types";
import type { CardId } from "../types/card-identity";
import type { AvatarId, TideId } from "../types/identifiers";

interface TidesListViewProps {
  tides: readonly Tides4DeckJson[];
  avatarById: ReadonlyMap<AvatarId, EditorAvatar>;
  cardById: ReadonlyMap<CardId, CardData>;
  onSelectTide: (tideId: TideId) => void;
}

/** The role groups shown on the list, in display order, with section labels. */
const ROLE_GROUPS: { role: Tides4Role; label: string; blurb: string }[] = [
  {
    role: "signature",
    label: "Signature",
    blurb: "One per signatured avatar — its always-joined identity floor.",
  },
  {
    role: "facet",
    label: "Facet",
    blurb:
      "Single-anchor lean pools — the variety engine a pool draws a few of.",
  },
  {
    role: "neutral",
    label: "Neutral",
    blurb: "Broad, format-spanning tides that top a pool up to full size.",
  },
];

/** The player-facing label for a tide, preferring its curated names. */
export function tideLabel(tide: Tides4DeckJson): string {
  return tide.displayName !== "" ? tide.displayName : tide.id;
}

function tideCardCount(tide: Tides4DeckJson): number {
  return tide.cards.reduce((sum, card) => sum + card.copies, 0);
}

function TideTile({
  tide,
  avatarById,
  cardById,
  onSelectTide,
}: {
  tide: Tides4DeckJson;
  avatarById: ReadonlyMap<AvatarId, EditorAvatar>;
  cardById: ReadonlyMap<CardId, CardData>;
  onSelectTide: (tideId: TideId) => void;
}) {
  const chip = tideColorChip(tide.resonance);
  const label = tideLabel(tide);
  const thumbSize = tide.role === "signature" ? 48 : 64;

  return (
    <button
      type="button"
      data-tide-id={tide.id}
      onClick={() => onSelectTide(tide.id)}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        textAlign: "left",
        width: 320,
        maxWidth: "100%",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${chip.border}`,
        background: "#171b1f",
        color: "#f7f1df",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: `0 0 ${thumbSize}px`,
        }}
      >
        <TideSourcePreview
          tide={tide}
          avatarById={avatarById}
          cardById={cardById}
          size={thumbSize}
        />
      </div>
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          style={{
            background: chip.background,
            borderColor: chip.border,
            color: "#ffffff",
          }}
        >
          <StandaloneGlyph glyph={chip.icon} color="white" />
          <span className="truncate">{label}</span>
        </span>
        <div
          style={{
            marginTop: 6,
            fontSize: "0.78rem",
            color: "rgba(247, 241, 223, 0.65)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {tide.id}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: "0.72rem",
            color: "rgba(247, 241, 223, 0.45)",
          }}
        >
          {tide.cards.length} cards · {tideCardCount(tide)} copies
        </div>
      </div>
    </button>
  );
}

export default function TidesListView({
  tides,
  avatarById,
  cardById,
  onSelectTide,
}: TidesListViewProps) {
  return (
    <div
      style={{
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
        paddingRight: 4,
        paddingBottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {ROLE_GROUPS.map(({ role, label, blurb }) => {
        const groupTides = tides.filter((tide) => tide.role === role);
        if (groupTides.length === 0) return null;
        return (
          <section key={role}>
            <header style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>
                {label}
                <span
                  style={{
                    marginLeft: 8,
                    color: "rgba(247, 241, 223, 0.4)",
                    fontWeight: 600,
                  }}
                >
                  {groupTides.length}
                </span>
              </h2>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "0.76rem",
                  color: "rgba(247, 241, 223, 0.5)",
                }}
              >
                {blurb}
              </p>
            </header>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {groupTides.map((tide) => (
                <TideTile
                  key={tide.id}
                  tide={tide}
                  avatarById={avatarById}
                  cardById={cardById}
                  onSelectTide={onSelectTide}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
