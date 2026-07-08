// Registry demo entry for GameCard (the Dreamtides game card, exported as
// GameCard from ../../components/CardView). GameCard's `card` prop is a full
// CardData object, which the registry's `ComponentType<Record<string, unknown>>`
// signature and the auto-generated control panel cannot synthesize. So this
// wrapper loads the real card database and renders a curated, deterministic set
// of cards identified by UUID (never by name — names are not unique). The
// control-panel args (size, selection, dense mode, figment frame) are forwarded
// to every card so toggling a control demonstrates that affordance live across
// the whole set; `docName` still points at the real GameCard so the props table
// reports its actual API.
//
// The curated UUIDs are read live from data/tabula/cards_v2.toml (via the served
// card-data.json), so the demo always reflects current card data rather than
// hardcoding stats or rules text that would drift. The set exercises the card's
// real variety: keyword highlighting, trigger carets, fast/interrupt bolts,
// Character vs Event chrome, and the Legendary rarity shimmer.

import { useEffect, useState } from "react";
import type { CardData } from "../../../types/cards";
import { loadCardDatabase } from "../../../data/card-database";
import { GameCard } from "../../components/card/CardView";
import { type TangoColor } from "../../primitives/color";
import type { TangoComponent } from "../registry";

/**
 * Curated, deterministic real card UUIDs from data/tabula/cards_v2.toml. Ordered
 * for a coherent showcase; each is annotated with what facet of the card it
 * exercises so the set stays intentional if it is ever re-curated.
 */
const CURATED_CARD_IDS = [
  // Character, 3●/3✦ — Support + Reclaim keyword highlighting, multi-line box.
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  // Character, 3●/1✦ — a ▸Challenge trigger caret.
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  // Character, 2●/2✦ — a Fast card (speed bolt before the name).
  "161482b6-af07-4d9e-822d-8c738672beb9",
  // Event, 4● — no spark orb, Fast; Event type-line chrome.
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
  // Event, 3● — Legendary rarity (the shimmer overlay).
  "a911ef71-799c-4240-ad13-8fabd3caeafa",
] as const;

interface GameCardDemoArgs {
  /** Larger card + text sizing (the compact-vs-large affordance). */
  large?: boolean;
  /** Draw the selection ring. */
  selected?: boolean;
  /** Selection ring color. */
  selectionColor?: TangoColor;
  /** Dense/compact surface: hide the rules text, keep identity + stats. */
  hideRulesText?: boolean;
  /** Render the full-bleed figment frame. */
  figment?: boolean;
}

function GameCardDemo({
  large = false,
  selected = false,
  selectionColor,
  hideRulesText = false,
  figment = false,
}: GameCardDemoArgs) {
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCardDatabase()
      .then((database) => {
        if (cancelled) {
          return;
        }
        // Resolve the curated UUIDs against the loaded database. Keying by `id`
        // (UUID) — never by name, which is not unique.
        const byId = new Map<string, CardData>();
        for (const card of database.values()) {
          byId.set(card.id, card);
        }
        setCards(
          CURATED_CARD_IDS.map((id) => byId.get(id)).filter(
            (card): card is CardData => card !== undefined,
          ),
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) {
    return (
      <div style={{ color: "var(--rose-300, #fda4af)" }}>
        Failed to load card data: {error}
      </div>
    );
  }
  if (cards === null) {
    return <div style={{ opacity: 0.7 }}>Loading cards…</div>;
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      {cards.map((card) => (
        <div key={card.id} style={{ width: large ? 240 : 168, flex: "0 0 auto" }}>
          <GameCard
            card={card}
            large={large}
            selected={selected}
            selectionColor={selectionColor}
            hideRulesText={hideRulesText}
            figment={figment}
          />
        </div>
      ))}
    </div>
  );
}

export const gameCardDemo: TangoComponent = {
  id: "game-card",
  title: "Game Card",
  blurb:
    "The playable card object — art, cost, stats, and rules text — rendered at any size and always resolved by UUID, never by name.",
  callout:
    "Hover-zoom is built in: hover a medium card and it grows in place — a portaled, pointer-events-none copy is drawn over the card's original footprint and scaled up (capped at 1.5x and toward a legible reading width), with the glossary term stack portaled beside it. It is automatic; there is nothing to opt into. `large` and `hideRulesText` cards already read legibly, so they skip the portal and use the slight in-place press/hover scale instead.",
  group: "Components",
  docName: "GameCard",
  Component: GameCardDemo,
  usage: [
    {
      label: "Render a card",
      note: "Give it a resolved `CardData` (loaded by UUID from the card database — never by name). `large` switches to the bigger card + text sizing.",
      code: `import { GameCard } from "src/tango/components/card/CardView";

<GameCard card={card} large />`,
    },
    {
      label: "Selected in a picker",
      note: "Draw the selection ring with `selected`; `hideRulesText` gives the dense identity-only surface used in tight lists.",
      code: `<GameCard
  card={card}
  selected
  selectionColor="#f97316"
  hideRulesText
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      large: false,
      selected: false,
      hideRulesText: false,
      figment: false,
    },
  },
};
