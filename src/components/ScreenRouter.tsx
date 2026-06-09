import { useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuest } from "../state/quest-context";
import { AtlasScreen } from "../screens/AtlasScreen";
import { QuestStartScreen } from "../screens/QuestStartScreen";
import { QuestCompleteScreen } from "../screens/QuestCompleteScreen";
import { QuestFailedScreen } from "../screens/QuestFailedScreen";
import { DreamscapeScreen } from "../screens/DreamscapeScreen";
import { DraftSiteScreen } from "../screens/DraftSiteScreen";
import { ShopScreen } from "../screens/ShopScreen";
import { EssenceSiteScreen } from "../screens/EssenceSiteScreen";
import { DreamsignOfferingScreen } from "../screens/DreamsignOfferingScreen";
import { DreamsignDraftScreen } from "../screens/DreamsignDraftScreen";
import { PurgeSiteScreen } from "../screens/PurgeSiteScreen";
import { TransfigurationSiteScreen } from "../screens/TransfigurationSiteScreen";
import { DuplicationSiteScreen } from "../screens/DuplicationSiteScreen";
import { RewardSiteScreen } from "../screens/RewardSiteScreen";
import { CleanseSiteScreen } from "../screens/CleanseSiteScreen";
import {
  JourneyScreen,
  buildJourneyContext,
  buildJourneyContentBundle,
  createJourneyMutations,
  type JourneyExplanation,
  type JourneyDebugForcing,
} from "../journeys";
import {
  DreamMerchantScreen,
  buildMerchantContext,
  generateMerchantEncounterWithDebug,
  type MerchantAcceptRequest,
  type MerchantCatalogCard,
  type MerchantDeclineRequest,
  type MerchantGameObject,
} from "../journey_v2";
import { buildCardSourceDebugState } from "../debug/card-source-debug";
import type { QuestContent } from "../data/quest-content";
import { siteTypeName } from "../atlas/atlas-generator";
import { logEvent } from "../logging";
import type { Screen, SiteState } from "../types/quest";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { BattleSiteRoute } from "./BattleSiteRoute";
import { ErrorBoundary } from "./ErrorBoundary";

/** Computes a stable key for AnimatePresence from the current screen. */
function screenKey(screen: Screen): string {
  if (screen.type === "site") {
    return `screen-site-${screen.siteId}`;
  }
  return `screen-${screen.type}`;
}

/** Routes to the correct screen component based on quest state. */
export function ScreenRouter({
  runtimeConfig,
  onJourneyExplanationChange,
}: {
  runtimeConfig: RuntimeConfig;
  onJourneyExplanationChange?: (explanation: JourneyExplanation | null) => void;
}) {
  const { state } = useQuest();
  const { screen } = state;

  function renderScreen() {
    switch (screen.type) {
      case "questStart":
        return <QuestStartScreen />;
      case "atlas":
        return <AtlasScreen />;
      case "dreamscape":
        return <DreamscapeScreen />;
      case "site":
        return (
          <SiteScreen
            siteId={screen.siteId}
            runtimeConfig={runtimeConfig}
            onJourneyExplanationChange={onJourneyExplanationChange}
          />
        );
      case "questComplete":
        return <QuestCompleteScreen />;
      case "questFailed":
        return <QuestFailedScreen />;
    }
  }

  // Per-screen boundary: each screen route gets its own boundary keyed by
  // screen identity. When `state.screen` changes, `resetKey` rotates and the
  // boundary clears any captured error, giving the new screen a fresh
  // render. A crash inside one screen produces a contained fallback while
  // the HUD and app shell stay interactive.
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={screenKey(screen)}
        data-quest-screen={screen.type}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
      >
        <ErrorBoundary
          scope={`screen:${screen.type}`}
          resetKey={screenKey(screen)}
        >
          {renderScreen()}
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

/** Resolves the active site from state and renders the appropriate screen. */
function SiteScreen({
  siteId,
  runtimeConfig,
  onJourneyExplanationChange,
}: {
  siteId: string;
  runtimeConfig: RuntimeConfig;
  onJourneyExplanationChange?: (explanation: JourneyExplanation | null) => void;
}) {
  const { state, cardDatabase } = useQuest();
  const { atlas, currentDreamscape } = state;

  const node = currentDreamscape !== null ? atlas.nodes[currentDreamscape] : undefined;
  const site = node?.sites.find((s) => s.id === siteId);

  if (!site) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-lg opacity-50">Site not found.</p>
      </div>
    );
  }

  if (site.type === "Draft") {
    return <DraftSiteScreen siteId={siteId} />;
  }

  if (site.type === "Battle") {
    return (
      <BattleSiteRoute
        site={site}
        cardDatabase={cardDatabase}
        runtimeConfig={runtimeConfig}
      />
    );
  }

  if (site.type === "Shop" || site.type === "SpecialtyShop") {
    // The Specialty Shop uses identical UI to the regular Shop; ShopScreen
    // detects the variant from `site.type`.
    return <ShopScreen site={site} />;
  }

  if (site.type === "Essence") {
    return <EssenceSiteScreen site={site} />;
  }

  if (site.type === "DreamsignOffering") {
    return <DreamsignOfferingScreen site={site} />;
  }

  if (site.type === "DreamsignDraft") {
    return <DreamsignDraftScreen site={site} />;
  }

  if (site.type === "DreamJourney") {
    if (runtimeConfig.journeyVariant === "v2") {
      return <DreamMerchantSiteScreen site={site} />;
    }

    return (
      <DreamJourneySiteScreen
        site={site}
        runtimeConfig={runtimeConfig}
        onJourneyExplanationChange={onJourneyExplanationChange}
      />
    );
  }

  if (site.type === "Purge") {
    return <PurgeSiteScreen site={site} />;
  }

  if (site.type === "Transfiguration") {
    return <TransfigurationSiteScreen site={site} />;
  }

  if (site.type === "Duplication") {
    return <DuplicationSiteScreen site={site} />;
  }

  if (site.type === "Reward") {
    return <RewardSiteScreen site={site} />;
  }

  if (site.type === "Cleanse") {
    return <CleanseSiteScreen site={site} />;
  }

  return <GenericSitePlaceholder site={site} />;
}

/**
 * Wrapper that bridges the quest prototype's site state to the journeys
 * module. Builds the `JourneyContext` from live quest state + content via
 * the adapter boundary, and forwards `onClose` to the
 * `completeDreamJourneySite` mutation. The `site_completed` log event the
 * screen produces fires inside `completeDreamJourneySite` so analytics
 * stay consistent with other site types.
 */
function DreamJourneySiteScreen({
  site,
  runtimeConfig,
  onJourneyExplanationChange,
}: {
  site: SiteState;
  runtimeConfig: RuntimeConfig;
  onJourneyExplanationChange?: (explanation: JourneyExplanation | null) => void;
}) {
  const { state, mutations, questContent } = useQuest();

  useEffect(() => {
    logEvent("site_entered", {
      siteType: "DreamJourney",
      isEnhanced: site.isEnhanced,
    });
  }, [site.id, site.isEnhanced]);

  const handleClose = useCallback(() => {
    mutations.completeDreamJourneySite(site.id);
  }, [mutations, site.id]);

  const contentBundle = useMemo(
    () => buildContentBundleFor(questContent),
    [questContent],
  );

  // Memoize the journey context on the inputs that actually feed it so React's
  // strict-mode double render does not regenerate the manifest seed.
  const journeyContext = useMemo(
    () => buildJourneyContext(state, contentBundle, site),
    [contentBundle, site, state],
  );

  // Bridge `QuestMutations` into the `JourneyMutations` surface the screen's
  // apply pass uses. Catalog lookups (cards, banes) live inside the underlying
  // reducer, so the adapter takes no extra content arg.
  const journeyMutations = useMemo(
    () => createJourneyMutations(mutations),
    [mutations],
  );
  const debugForcing = useMemo(
    () => debugJourneyForcingFor(runtimeConfig),
    [runtimeConfig],
  );

  return (
    <JourneyScreen
      context={journeyContext}
      onClose={handleClose}
      siteId={site.id}
      mutations={journeyMutations}
      debugForcing={debugForcing}
      onExplanationChange={onJourneyExplanationChange}
    />
  );
}

function DreamMerchantSiteScreen({ site }: { site: SiteState }) {
  const { state, mutations, questContent } = useQuest();
  const loggedOfferSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    logEvent("site_entered", {
      siteType: "DreamJourney",
      isEnhanced: site.isEnhanced,
    });
  }, [site.id, site.isEnhanced]);

  const merchantContext = useMemo(
    () =>
      buildMerchantContext({
        questState: state,
        questContent,
        site,
      }),
    [questContent, site, state],
  );
  const encounterResult = useMemo(
    () => {
      try {
        return {
          ok: true as const,
          ...generateMerchantEncounterWithDebug(merchantContext),
        };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [merchantContext],
  );

  useEffect(() => {
    if (merchantContext.fitModel === undefined) {
      logEvent("merchant_fit_model_missing", {
        siteId: site.id,
      });
    }
  }, [merchantContext.fitModel, site.id]);

  useEffect(() => {
    if (!encounterResult.ok) return;
    if (
      loggedOfferSignatureRef.current ===
      encounterResult.encounter.encounterSignature
    ) {
      return;
    }
    loggedOfferSignatureRef.current = encounterResult.encounter.encounterSignature;
    logEvent("merchant_encounter_generated", {
      siteId: site.id,
      encounterSignature: encounterResult.encounter.encounterSignature,
      offerCount: encounterResult.encounter.offers.length,
      debug: encounterResult.debug,
    });
  }, [encounterResult, site.id]);

  const visibleGrantCards = useMemo(
    () =>
      encounterResult.ok
        ? collectVisibleGrantCards(encounterResult.encounter.offers)
        : [],
    [encounterResult],
  );

  const cardSourceDebugState = useMemo(
    () =>
      buildCardSourceDebugState(
        "Dream Merchant Offers",
        "Reward",
        visibleGrantCards.map((catalogCard) => catalogCard.card),
        state.resolvedPackage,
      ),
    [state.resolvedPackage, visibleGrantCards],
  );

  useEffect(() => {
    mutations.setCardSourceDebug(
      cardSourceDebugState,
      "merchant_grant_cards_shown",
    );
  }, [cardSourceDebugState, mutations]);

  useEffect(
    () => () => {
      mutations.setCardSourceDebug(null, "merchant_grant_cards_hidden");
    },
    [mutations],
  );

  const handleAcceptOffer = useCallback(
    (request: MerchantAcceptRequest) => {
      return mutations.acceptDreamMerchantOffer(site.id, request);
    },
    [mutations, site.id],
  );
  const handleDecline = useCallback(
    (request: MerchantDeclineRequest) => {
      mutations.declineDreamMerchant(site.id, request);
    },
    [mutations, site.id],
  );

  const handleFallbackWalkAway = useCallback(() => {
    logEvent("merchant_offer_validation_failed", {
      siteId: site.id,
      reason: "encounter_unavailable",
      message: encounterResult.ok ? undefined : encounterResult.message,
    });
    mutations.completeDreamJourneySite(site.id);
  }, [encounterResult, mutations, site.id]);

  if (!encounterResult.ok) {
    return (
      <main
        className="min-h-full bg-[#090b10] p-6 text-slate-100"
        data-testid="dream-merchant-v2-fallback"
      >
        <section className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center text-center">
          <div className="grid gap-4">
            <h2 className="text-2xl font-bold">Dream Merchant</h2>
            <p className="text-sm leading-relaxed text-slate-300">
              The counter is bare tonight. The road remains open.
            </p>
            <button
              type="button"
              className="min-h-12 rounded-md border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
              data-testid="merchant-fallback-walk-away"
              onClick={handleFallbackWalkAway}
            >
              Walk away
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <DreamMerchantScreen
      site={site}
      context={merchantContext}
      questState={state}
      encounter={encounterResult.encounter}
      onAcceptOffer={handleAcceptOffer}
      onDecline={handleDecline}
    />
  );
}

function collectVisibleGrantCards(
  offers: readonly { reward: { gameObjects: readonly MerchantGameObject[]; choiceRequest?: { candidates: readonly { gameObjects: readonly MerchantGameObject[] }[] } } }[],
): MerchantCatalogCard[] {
  const byUuid = new Map<string, MerchantCatalogCard>();
  const collect = (objects: readonly MerchantGameObject[]) => {
    for (const object of objects) {
      if (object.objectType === "catalogCard") {
        byUuid.set(object.cardUuid, object);
      }
    }
  };

  for (const offer of offers) {
    collect(offer.reward.gameObjects);
    for (const candidate of offer.reward.choiceRequest?.candidates ?? []) {
      collect(candidate.gameObjects);
    }
  }

  return [...byUuid.values()];
}

function debugJourneyForcingFor(
  runtimeConfig: RuntimeConfig,
): JourneyDebugForcing | undefined {
  if (!import.meta.env.DEV) {
    return undefined;
  }

  const debugForcing = {
    shapeId: runtimeConfig.debugJourneyShape ?? null,
    rewardTemplateId: runtimeConfig.debugJourneyReward ?? null,
    costTemplateId: runtimeConfig.debugJourneyCost ?? null,
  };

  if (
    !debugForcing.shapeId &&
    !debugForcing.rewardTemplateId &&
    !debugForcing.costTemplateId
  ) {
    return undefined;
  }

  return debugForcing;
}

function buildContentBundleFor(questContent: QuestContent) {
  return buildJourneyContentBundle({
    cards: Array.from(questContent.cardDatabase.values()),
    dreamcallers: questContent.dreamcallers,
    dreamsignTemplates: questContent.dreamsignTemplates,
  });
}

/** Auto-complete placeholder for non-battle site types. */
function GenericSitePlaceholder({ site }: { site: SiteState }) {
  const { mutations } = useQuest();

  const handleAutoComplete = useCallback(() => {
    logEvent("site_completed", {
      siteType: site.type,
      outcome: "auto-completed",
    });
    mutations.markSiteVisited(site.id);
    mutations.setScreen({ type: "dreamscape" });
  }, [site, mutations]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-2xl font-bold" style={{ color: "#a855f7" }}>
        {siteTypeName(site.type)}
      </h2>
      {site.isEnhanced && (
        <span
          className="rounded-full px-3 py-1 text-sm font-bold"
          style={{
            background: "rgba(168, 85, 247, 0.15)",
            color: "#c084fc",
            border: "1px solid rgba(168, 85, 247, 0.3)",
          }}
        >
          {"\u2B50"} Enhanced
        </span>
      )}
      <p className="opacity-50">
        This site will be implemented in a later task.
      </p>
      <button
        className="rounded-lg px-5 py-2.5 font-medium text-white"
        style={{ backgroundColor: "#7c3aed" }}
        onClick={handleAutoComplete}
      >
        Auto-complete
      </button>
    </div>
  );
}
