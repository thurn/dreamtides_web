// Registry demo entry for GameCard (the Dreamtides game card, exported as
// GameCard from ../../components/CardView). GameCard's `card` prop is a full
// CardData object, which the registry's `ComponentType<Record<string, unknown>>`
// signature and the auto-generated control panel cannot synthesize. So this
// wrapper loads the real card database and renders a curated, deterministic set
// of cards identified by UUID (never by name — names are not unique). The
// control-panel args (selection, dense mode, figment frame) are forwarded
// to every card so toggling a control demonstrates that affordance live across
// the whole set; `docName` still points at the real GameCard so the props table
// reports its actual API.
//
// The curated UUIDs are read live from data/tabula/cards.toml (via the served
// card-data.json), so the demo always reflects current card data rather than
// hardcoding stats or rules text that would drift. The set exercises the card's
// real variety: a resolved text-changing transfiguration, keyword highlighting,
// Unicode trigger markers, fast/interrupt bolts, Character vs Event chrome, and
// the Legendary rarity shimmer.

import { useEffect, useState } from "react";
import type { CardData } from "../../../types/cards";
import { loadCardDatabase } from "../../../data/card-database";
import { loadFigmentDatabase } from "../../../data/figment-database";
import { TRANSFIGURATION_TINT_COLORS } from "../../../runtime/transfiguration-display";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../../../runtime/transfigure-markers";
import {
  GameCard,
  type GameCardModel,
  type GameCardPresentation,
} from "../../components/card/CardView";
import { type CumulusColor } from "../../primitives/color";
import type { CumulusComponent } from "../registry";

/**
 * Curated, deterministic real card UUIDs from data/tabula/cards.toml. Ordered
 * for a coherent showcase; each is annotated with what facet of the card it
 * exercises so the set stays intentional if it is ever re-curated.
 */
const CURATED_CARD_IDS = [
  // Character, 3●/3✦ — Support + Reclaim keyword highlighting, multi-line box.
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  // Character, 3●/1✦ — a ▸Challenge trigger marker.
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  // Character, 2●/2✦ — a Fast card (speed bolt before the name).
  "161482b6-af07-4d9e-822d-8c738672beb9",
  // Event, 4● — no spark orb, Fast; Event type-line chrome.
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
  // Event, 3● — Legendary rarity (the shimmer overlay).
  "a911ef71-799c-4240-ad13-8fabd3caeafa",
  // Character, 3●/2✦ — Materialized trigger plus the Legionnaire figment preview.
  "4b4cc613-2e28-4851-975f-14146286a062",
] as const;

interface GameCardDemoArgs {
  /** Draw the selection ring. */
  selected?: boolean;
  /** Selection ring color. */
  selectionColor?: CumulusColor;
  /** Dense/compact surface: hide the rules text, keep identity + stats. */
  hideRulesText?: boolean;
  /** Include the glossary-backed exhausted status in the reveal stack. */
  exhausted?: boolean;
  /** Render the full-bleed figment frame. */
  figment?: boolean;
  /** Show the complete card or its art-and-spark battlefield face. */
  presentation?: GameCardPresentation;
}

/**
 * Presentation-only Amplified fixture for the first showcase card. The real
 * transfiguration logic lives outside Cumulus; this mirrors the resolved model
 * a caller supplies by incrementing and marking the first authored number.
 */
function amplifiedDemoModel(card: CardData): GameCardModel {
  const match = /\d+/.exec(card.renderedText);
  if (match === null || match.index === undefined) {
    return { cardId: card.id, displaySnapshot: card };
  }
  const amplifiedNumber = String(Number(match[0]) + 1);
  const before = card.renderedText.slice(0, match.index);
  const after = card.renderedText.slice(match.index + match[0].length);
  const renderedText = `${before}${amplifiedNumber}${after}`;
  return {
    cardId: card.id,
    displaySnapshot: { ...card, renderedText },
    transfiguration: {
      type: "Amplified",
      color: TRANSFIGURATION_TINT_COLORS.Amplified,
      markedText: `${before}${TRANSFIGURE_MARK_START}${amplifiedNumber}${TRANSFIGURE_MARK_END}${after}`,
      energyChanged: false,
      sparkChanged: false,
      fastChanged: false,
    },
  };
}

function GameCardDemo({
  selected = false,
  selectionColor,
  hideRulesText = false,
  exhausted = false,
  figment = false,
  presentation = "full",
}: GameCardDemoArgs) {
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCardDatabase(),
      loadFigmentDatabase().catch(() => undefined),
    ])
      .then(([database]) => {
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
      {cards.map((card, index) => (
        <div key={card.id} style={{ width: 168, flex: "0 0 auto" }}>
          <GameCard
            model={
              index === 0
                ? amplifiedDemoModel(card)
                : { cardId: card.id, displaySnapshot: card }
            }
            selected={selected}
            selectionColor={selectionColor}
            hideRulesText={hideRulesText}
            exhausted={exhausted}
            figment={figment}
            presentation={presentation}
          />
        </div>
      ))}
    </div>
  );
}

export const gameCardDemo: CumulusComponent = {
  id: "game-card",
  title: "Game Card",
  blurb:
    "The playable card object — art, cost, stats, and rules text — rendered at any size and always resolved by UUID, never by name.",
  callout:
    "GameCard registers its canonical UUID and complete display snapshot with the shared reveal coordinator. CardView.css owns the complete card frame, rarity, figment, event, and responsive typography treatment, including canonical fallbacks that keep those treatments intact outside a Cumulus token scope; every figment uses the same \"<Identity> Figment\" title bar and authored art crop. Transfiguration changes use the shared hammer-in-circle marker on changed stats and in the rules panel whenever marked rules text is present. The card-aspect.ts contract is the source for full-card, battlefield, art-region, corner-radius, and draft-offer geometry across renderers. Compact cards read at 240px on desktop and 45vw on mobile; glossary definitions, exhausted status, focus, press, activation, and drag dismissal are automatic. On desktop, rules that explicitly materialize an authored figment add a small UUID-backed card with a violet glowing border beyond the definition stack; that adjacent figment keeps its card size and enlarges only its rules text by 50 percent. A figment's own reading copy stays unoutlined. Touch layouts keep the compact reading pair.",
  group: "Components",
  docName: "GameCard",
  Component: GameCardDemo,
  usage: [
    {
      label: "Render a card",
      note: "Give it a resolved `CardData` (loaded by UUID from the card database — never by name). Size the wrapper; GameCard fills its width and applies the mobile typography treatment automatically.",
      code: `import { GameCard } from "src/cumulus/components/card/CardView";

<div style={{ width: 240 }}>
  <GameCard model={{ cardId: card.id, displaySnapshot: card }} />
</div>`,
    },
    {
      label: "Selected in a picker",
      note: "Draw the selection ring with `selected`; `hideRulesText` gives the dense identity-only surface used in tight lists.",
      code: `<GameCard
  model={{ cardId: card.id, displaySnapshot: card }}
  selected
  selectionColor="#f97316"
  hideRulesText
/>`,
    },
    {
      label: "On the battlefield",
      note: "Use the strict battlefield presentation for in-play cards. Its rounded square frame widens the art viewport at the portrait card's vertical scale, showing only art and enlarged spark while hover, focus, or touch-hold reveals the complete original card. Pass `exhausted` when the battle instance is exhausted so its glossary definition joins the reveal stack.",
      code: `<GameCard
  model={{ cardId: card.id, displaySnapshot: card }}
  exhausted={instance.status.isExhausted}
  presentation="battlefield"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      selected: false,
      hideRulesText: false,
      exhausted: false,
      figment: false,
      presentation: "full",
    },
  },
};
