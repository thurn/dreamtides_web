// Full-screen mockup for SegmentedControl — a Collection screen: the real
// All/Characters/Events type filter (the game's only two CardType values,
// `src/types/cards.ts`) actually filters a small grid of real cards resolved
// by UUID from the live card database, exactly like the demo pattern
// GameCard's own mockup uses. Switching segments visibly changes which real
// cards are shown, so the control's job (filtering a real view) is legible
// rather than merely decorative.

import { useEffect, useState } from "react";
import type { CardData } from "../../../types/cards";
import { loadCardDatabase } from "../../../data/card-database";
import { GameCard } from "../../components/card/CardView";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../components/controls/SegmentedControl";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

// Curated real card UUIDs from data/tabula/cards.toml (a mix of Character
// and Event so the filter has something to actually filter). Resolved and
// keyed by UUID only, never by name.
const CARD_IDS = [
  "1268a899-b209-46bb-bce4-6def1dcd0404", // Character
  "7be2e6d7-abff-4c44-a0c3-35460da1693c", // Character
  "161482b6-af07-4d9e-822d-8c738672beb9", // Character
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a", // Event
  "a911ef71-799c-4240-ad13-8fabd3caeafa", // Event
] as const;

const OPTIONS: SegmentedOption[] = [
  { value: "All", label: "All" },
  { value: "Characters", label: "Characters" },
  { value: "Events", label: "Events" },
];

function resolveCards(database: Map<number, CardData>, ids: readonly string[]): CardData[] {
  const byId = new Map<string, CardData>();
  for (const card of database.values()) {
    byId.set(card.id, card);
  }
  return ids
    .map((id) => byId.get(id))
    .filter((card): card is CardData => card !== undefined);
}

function matchesFilter(card: CardData, filter: string): boolean {
  if (filter === "All") return true;
  if (filter === "Characters") return card.cardType === "Character";
  return card.cardType === "Event";
}

export function SegmentedControlMockup() {
  const [database, setDatabase] = useState<Map<number, CardData> | null>(null);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;
    loadCardDatabase()
      .then((db) => {
        if (!cancelled) setDatabase(db);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = database ? resolveCards(database, CARD_IDS).filter((c) => matchesFilter(c, filter)) : [];

  return (
    <div
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.55) 0%, rgba(8,5,17,0.7) 50%, rgba(8,5,17,0.94) 100%), url(${dreamscapeSceneUrl("grid_city")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: token("--space-3xl"),
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginTop: token("--space-s") }}>
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: 0,
          }}
        >
          Collection
        </p>
        <h1 style={{ font: token("--t-display"), margin: `${token("--space-xs")} 0 0`, color: token("--text-primary") }}>
          Your Cards
        </h1>
      </div>

      <div style={{ margin: `${token("--space-2xl")} 0` }}>
        <SegmentedControl options={OPTIONS} value={filter} onChange={setFilter} />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: token("--space-l"),
          justifyContent: "center",
          alignItems: "flex-start",
          maxWidth: 820,
        }}
      >
        {database === null ? (
          <p style={{ color: token("--text-muted"), font: token("--t-lead") }}>Loading cards…</p>
        ) : cards.length === 0 ? (
          <p style={{ color: token("--text-muted"), font: token("--t-lead") }}>No cards match this filter.</p>
        ) : (
          cards.map((card, index) => (
            <div key={`${card.id}-${String(index)}`} style={{ width: "clamp(120px, 16vw, 168px)" }}>
              <GameCard model={{ cardId: card.id, displaySnapshot: card }} />
            </div>
          ))
        )}
      </div>

    </div>
  );
}
