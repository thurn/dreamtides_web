import type { CardData } from "../types/cards";
import type {
  DreamsignTemplate,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { DraftState } from "../types/draft";
import type { CardSourceDebugState } from "../types/quest";
import { CardSourceOverlay } from "../screens/CardSourceOverlay";
import { DebugScreen } from "../screens/DebugScreen";

function makeCard(cardNumber: number, name: string): CardData {
  return {
    id: `demo-card-${String(cardNumber)}`,
    name,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    tides: ["warrior_pressure"],
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

const cardDatabase = new Map<number, CardData>([
  [1, makeCard(1, "Lantern Vanguard")],
  [2, makeCard(2, "Archive Sentry")],
]);

const draftState: DraftState = {
  draftPoolCopiesByCard: { "1": 2, "2": 1 },
  remainingCopiesByCard: { "1": 2, "2": 1 },
  currentOffer: [1, 2],
  activeSiteId: "demo-site",
  pickNumber: 1,
  sitePicksCompleted: 0,
};

const resolvedPackage: ResolvedDreamcallerPackage = {
  dreamcaller: {
    id: "demo-dreamcaller",
    name: "Debug Tidecaller",
    title: "Fixture Dreamcaller",
    renderedText: "",
    imageNumber: "0001",
    startingEssence: 250,
    mandatoryTides: ["warrior_pressure"],
    optionalTides: ["big_energy", "fast_setup", "hand_cycling"],
  },
  mandatoryTides: ["warrior_pressure"],
  optionalSubset: ["big_energy", "fast_setup", "hand_cycling"],
  selectedTides: ["warrior_pressure", "big_energy", "fast_setup", "hand_cycling"],
  draftPoolCopiesByCard: { "1": 2, "2": 1 },
  dreamsignPoolIds: ["demo-sign"],
  mandatoryOnlyPoolSize: 2,
  draftPoolSize: 3,
  doubledCardCount: 1,
  legalSubsetCount: 1,
  preferredSubsetCount: 1,
};

const dreamsignTemplates: readonly DreamsignTemplate[] = [
  {
    id: "demo-sign",
    name: "Iron Omen",
    effectDescription: "Gain 1 essence.",
    packageTides: ["warrior_pressure", "big_energy"],
  },
];

const cardSourceDebug: CardSourceDebugState = {
  screenLabel: "Demo Cards",
  surface: "Draft",
  entries: [
    {
      cardNumber: 1,
      cardName: "Lantern Vanguard",
      inStarterDecklist: true,
      draftPoolCopies: 0,
    },
  ],
};

export function TideDocumentationHoverDemo() {
  const surface =
    new URLSearchParams(window.location.search).get("surface") ?? "debug";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {surface === "cards" ? (
        <CardSourceOverlay
          cardSourceDebug={cardSourceDebug}
          isOpen
          onClose={() => {}}
        />
      ) : (
        <DebugScreen
          isOpen
          onClose={() => {}}
          draftState={draftState}
          cardDatabase={cardDatabase}
          resolvedPackage={resolvedPackage}
          remainingDreamsignPool={["demo-sign"]}
          dreamsignTemplates={dreamsignTemplates}
        />
      )}
    </div>
  );
}
