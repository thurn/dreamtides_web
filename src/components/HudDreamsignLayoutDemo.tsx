import { DreamsignRevelationScreen } from "../screens/DreamsignRevelationScreen";
import {
  createDefaultState,
  QuestContextProvider,
  type QuestContextValue,
  type QuestMutations,
} from "../state/quest-context";
import type { DreamcallerContent, DreamsignTemplate } from "../types/content";
import type { CardData } from "../types/cards";
import type { CardSourceDebugState, Dreamsign, SiteState } from "../types/quest";
import { HUD } from "./HUD";

const noop = () => undefined;
const noopAddCard = () => null;

const demoDreamcaller: DreamcallerContent = {
  id: "demo-dreamcaller",
  name: "Mira of Lanterns",
  title: "Keeper of Lantern Glass",
  renderedText: "Begin with steady light.",
  imageNumber: "0005",
  startingEssence: 250,
};

const demoDreamsigns: Dreamsign[] = [
  {
    id: "embers-whisper",
    name: "Ember's Whisper",
    effectDescription: "Gain 50 essence after every battle.",
    isBane: false,
  },
  {
    id: "glacial-insight",
    name: "Glacial Insight",
    effectDescription: "Draft offers contain one extra option.",
    isBane: false,
  },
  {
    id: "verdant-accord",
    name: "Verdant Accord",
    effectDescription: "Heal after accepting a dreamsign.",
    isBane: false,
  },
];

const demoTemplates: DreamsignTemplate[] = [
  {
    id: "embers-whisper",
    name: "Ember's Whisper",
    effectDescription: "Gain 50 essence after every battle.",
  },
  {
    id: "glacial-insight",
    name: "Glacial Insight",
    effectDescription: "Draft offers contain one extra option.",
  },
  {
    id: "verdant-accord",
    name: "Verdant Accord",
    effectDescription: "Heal after accepting a dreamsign.",
  },
];

const demoSite: SiteState = {
  id: "demo-dreamsign-revelation",
  type: "DreamsignRevelation",
  isEnhanced: true,
  isVisited: false,
};

const demoCardSourceDebug: CardSourceDebugState = {
  screenLabel: "Dreamsign Layout Demo",
  surface: "Draft",
  entries: [],
};

const mutations: QuestMutations = {
  changeEssence: noop,
  startQuest: noop,
  completeSite: noop,
  ensureRewardSiteRuntime: noop,
  acceptRewardSite: noop,
  ensureDreamsignOfferRuntime: noop,
  acceptDreamsignOffer: noop,
  rejectDreamsignOffer: noop,
  ensureEssenceSiteRuntime: noop,
  acceptEssenceSite: noop,
  ensureShopRuntime: noop,
  buyShopSlot: noop,
  rerollShop: noop,
  ensureCardChoiceRuntime: noop,
  acceptTransfigurationChoice: noop,
  acceptDuplicationChoice: noop,
  completeDreamAugurySite: noop,
  acceptDreamMerchantOffer: noop,
  declineDreamMerchant: noop,
  pickDraftCard: noop,
  addCard: noop,
  addBaneCard: noop,
  removeCard: noop,
  transfigureCard: noop,
  changeDeckEntryType: noop,
  changeDeckEntryKeywords: noop,
  setDreamcallerSelection: noop,
  setCardSourceDebug: noop,
  addDreamsign: noop,
  removeDreamsign: noop,
  setRemainingDreamsignPool: noop,
  incrementCompletionLevel: noop,
  setScreen: noop,
  markSiteVisited: noop,
  setCurrentDreamscape: noop,
  updateAtlas: noop,
  setDraftState: noop,
  setFailureSummary: noop,
  dismissStartingDeckPopup: noop,
  bootstrapStartInBattle: noop,
  resetQuest: noop,
  setEssence: noop,
  changeMaxEssence: noop,
  addCardById: noopAddCard,
  addCardByIdWithTransfiguration: noopAddCard,
  addBaneCardById: noop,
  removeDeckEntry: noop,
  purgeDeckCards: noop,
  duplicateDeckEntry: noop,
  purgeRandomBaneCards: noop,
  purgeAllBaneCards: noop,
  pushBattleRewardModifier: noop,
  pushTemporaryBaneGrant: noop,
  addSiteToDreamscape: noop,
  replaceSiteType: noop,
  removeSiteTypeFromNextDreamscapes: noop,
  grantFreeShopRerolls: noop,
  applyShopEssenceDiscount: noop,
  boostSiteAppearance: noop,
};

const demoQuestContext: QuestContextValue = {
  state: {
    ...createDefaultState(),
    essence: 250,
    maxDreamsigns: 12,
    deck: [
      {
        entryId: "demo-card-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: "demo-card-2",
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: "demo-card-3",
        cardNumber: 3,
        transfiguration: null,
        isBane: false,
      },
    ],
    dreamcaller: demoDreamcaller,
    cardSourceDebug: demoCardSourceDebug,
    remainingDreamsignPool: ["stormthread-sigil", "ashbloom-mantle"],
    dreamsigns: demoDreamsigns,
    completionLevel: 2,
    screen: { type: "site", siteId: demoSite.id },
    activeSiteId: demoSite.id,
    hasSeenStartingDeckPopup: true,
    siteRuntime: {
      [demoSite.id]: {
        kind: "dreamsignOffer",
        offeredDreamsigns: demoDreamsigns,
        remainingDreamsignPool: ["stormthread-sigil", "ashbloom-mantle"],
        accepted: false,
      },
    },
  },
  mutations,
  cardDatabase: new Map<number, CardData>(),
  questContent: {
    cardDatabase: new Map(),
    dreamcallers: [demoDreamcaller],
    dreamwellCards: [],
    dreamsignTemplates: demoTemplates,
    dreamscapes: [],
    affiliations: [], guides: [],
    atlasConfig: {
      layerSpecs: [],
      connectionAverage: 2,
      bonusReveal: { min: 0, max: 2, mode: 1 },
      repeatDiscourageStrength: 2,
      knownDreamsign: {
        maxPerAtlas: 2,
        eligibleLayers: [3, 4, 5, 6],
        placementProbability: 0.5,
        earlyRevealBias: 1,
      },
    },
  },
};

export function HudDreamsignLayoutDemo() {
  return (
    <QuestContextProvider value={demoQuestContext}>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <DreamsignRevelationScreen site={demoSite} />
        <HUD
          onOpenDeckViewer={noop}
          onOpenGlossary={noop}
          onOpenPoolViewer={noop}
          onOpenDebugScreen={noop}
          onToggleCardSourceOverlay={noop}
          onToggleJourneyExplanation={noop}
          hasDraftData={true}
          hasCardSourceDebug={true}
          hasJourneyExplanation={false}
          isCardSourceOverlayOpen={false}
          isJourneyExplanationOpen={false}
        />
      </div>
    </QuestContextProvider>
  );
}
