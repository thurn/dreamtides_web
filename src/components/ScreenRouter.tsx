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
import { DreamsignRevelationScreen } from "../screens/DreamsignRevelationScreen";
import { PurgeSiteScreen } from "../screens/PurgeSiteScreen";
import { TransfigurationSiteScreen } from "../screens/TransfigurationSiteScreen";
import { DuplicationSiteScreen } from "../screens/DuplicationSiteScreen";
import { RewardSiteScreen } from "../screens/RewardSiteScreen";
import { StubSiteScreen } from "../screens/StubSiteScreen";
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
  buildMerchantDeckSnapshot,
  generateMerchantEncounterWithDebug,
  type MerchantAcceptRequest,
  type MerchantArchetypeId,
  type MerchantCatalogCard,
  type MerchantDeclineRequest,
  type MerchantGameObject,
} from "../journey_v2";
import { buildCardSourceDebugState } from "../debug/card-source-debug";
import {
  cumulusScreenFor,
  cumulusSiteScreenFor,
  isCumulusSiteRegistered,
} from "../screens/cumulus_adapters/registry";
import type { QuestContent } from "../data/quest-content";
import { siteTypeName } from "../atlas/atlas-generator";
import { logEvent } from "../logging";
import type { Screen, SiteState } from "../types/quest";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { BattleSiteRoute } from "./BattleSiteRoute";
import {
  CumulusQuestChrome,
  type CumulusQuestChromeHandlers,
} from "./CumulusQuestChrome";
import { SiteGuide } from "./SiteGuide";
import { guideForSiteType } from "../data/dreamscapes";
import { ErrorBoundary } from "./ErrorBoundary";
import { SiteSceneBackdrop } from "./SiteSceneBackdrop";
import type { ReactNode } from "react";
import { useDreamAuguryQuestMenuActions } from "./DreamAuguryQuestMenu";

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
  cumulusChromeHandlers,
}: {
  runtimeConfig: RuntimeConfig;
  onJourneyExplanationChange?: (explanation: JourneyExplanation | null) => void;
  cumulusChromeHandlers?: CumulusQuestChromeHandlers;
}) {
  const { state } = useQuest();
  const { screen } = state;

  // Prefer the Cumulus implementation of this screen when `?ui=cumulus` (the
  // default); a screen not yet migrated resolves to null and falls through to
  // the legacy switch below, so the app stays fully navigable during migration.
  const cumulusScreen =
    runtimeConfig.uiVariant === "cumulus"
      ? cumulusScreenFor(screen)
      : null;

  // Record which UI served each screen, one entry per navigation, so a
  // production run's screen-by-screen variant history is reconstructable from
  // logs/quest-log.jsonl during the migration. Deduped against the last logged
  // navigation so the entry fires exactly once per screen change: the effect
  // itself runs more than once for a single navigation (React StrictMode
  // double-invokes effects in dev, and unrelated re-renders re-run it), which
  // would otherwise emit a duplicate `screen_rendered` line each time. The
  // signature only re-fires the log when the visible navigation actually
  // changes — the same guard idiom `useQuestUrlSync` uses for `quest_url_synced`.
  const siteId = screen.type === "site" ? screen.siteId : null;
  const activeSite =
    screen.type === "site" && state.currentDreamscape !== null
      ? state.atlas.nodes[state.currentDreamscape]?.sites.find(
          (candidate) => candidate.id === screen.siteId,
        )
      : undefined;
  const servedByCumulus =
    cumulusScreen !== null ||
    (runtimeConfig.uiVariant === "cumulus" &&
      activeSite !== undefined &&
      isCumulusSiteRegistered(activeSite));
  const lastLoggedNavigationRef = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${runtimeConfig.uiVariant}|${screen.type}|${siteId ?? ""}|${String(servedByCumulus)}`;
    if (lastLoggedNavigationRef.current === signature) {
      return;
    }
    lastLoggedNavigationRef.current = signature;
    logEvent("screen_rendered", {
      uiVariant: runtimeConfig.uiVariant,
      screenType: screen.type,
      siteId,
      servedByCumulus,
    });
  }, [runtimeConfig.uiVariant, screen.type, siteId, servedByCumulus]);

  function renderScreen() {
    if (cumulusScreen !== null) {
      return screen.type === "questStart" ? (
        cumulusScreen
      ) : (
        <CumulusQuestChrome
          handlers={cumulusChromeHandlers}
          showAtlasRegenerate={screen.type === "atlas"}
          showStatusBar={
            screen.type !== "questComplete" && screen.type !== "questFailed"
          }
        >
          {cumulusScreen}
        </CumulusQuestChrome>
      );
    }
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
            cumulusChromeHandlers={cumulusChromeHandlers}
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
  cumulusChromeHandlers,
}: {
  siteId: string;
  runtimeConfig: RuntimeConfig;
  onJourneyExplanationChange?: (explanation: JourneyExplanation | null) => void;
  cumulusChromeHandlers?: CumulusQuestChromeHandlers;
}) {
  const { state, cardDatabase } = useQuest();
  const { atlas, currentDreamscape } = state;
  const node = currentDreamscape !== null ? atlas.nodes[currentDreamscape] : undefined;
  const site = node?.sites.find((s) => s.id === siteId);
  const dreamAuguryMenuActions = useDreamAuguryQuestMenuActions(site, node);

  if (!site) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-lg opacity-50">Site not found.</p>
      </div>
    );
  }

  // The keeper battle runs in its own full-screen shell with its own backdrop,
  // so it is not wrapped in the dreamscape scene backdrop.
  if (site.type === "Battle") {
    return (
      <BattleSiteRoute
        site={site}
        cardDatabase={cardDatabase}
        runtimeConfig={runtimeConfig}
        cumulusChromeHandlers={cumulusChromeHandlers}
      />
    );
  }

  // A Cumulus site screen (`?ui=cumulus`) draws its own full-bleed scene and the
  // router supplies persistent quest chrome around it. It renders directly,
  // without the legacy dimmed backdrop wrapper. An unmigrated site type resolves
  // to null and falls through to the legacy screens over the scene backdrop.
  const cumulusSite =
    runtimeConfig.uiVariant === "cumulus"
      ? cumulusSiteScreenFor(site)
      : null;
  if (cumulusSite !== null) {
    const handlers =
      dreamAuguryMenuActions.length === 0
        ? cumulusChromeHandlers
        : {
            ...cumulusChromeHandlers,
            contextualActions: [
              ...(cumulusChromeHandlers?.contextualActions ?? []),
              ...dreamAuguryMenuActions,
            ],
          };
    return (
      <CumulusQuestChrome handlers={handlers}>
        {cumulusSite}
      </CumulusQuestChrome>
    );
  }

  let content: ReactNode;
  if (site.type === "Draft") {
    content = <DraftSiteScreen siteId={siteId} />;
  } else if (site.type === "Shop" || site.type === "DreamsignMarket") {
    // The Dreamsign Market shares the regular Shop UI; ShopScreen detects the
    // variant from `site.type`.
    content = <ShopScreen site={site} />;
  } else if (site.type === "Essence") {
    content = <EssenceSiteScreen site={site} />;
  } else if (site.type === "DreamsignRevelation") {
    // The Dreamsign Revelation reveals several dreamsigns over the scene and
    // lets the player take one as an immersive, full-bleed offer.
    content = <DreamsignRevelationScreen site={site} />;
  } else if (site.type === "DreamAugury") {
    content =
      runtimeConfig.journeyVariant === "v2" ? (
        <DreamMerchantSiteScreen site={site} />
      ) : (
        <DreamAugurySiteScreen
          site={site}
          runtimeConfig={runtimeConfig}
          onJourneyExplanationChange={onJourneyExplanationChange}
        />
      );
  } else if (site.type === "Purge") {
    content = <PurgeSiteScreen site={site} />;
  } else if (site.type === "Transfiguration") {
    content = <TransfigurationSiteScreen site={site} />;
  } else if (site.type === "Duplication") {
    content = <DuplicationSiteScreen site={site} />;
  } else if (site.type === "Reward") {
    content = <RewardSiteScreen site={site} />;
  } else if (
    site.type === "TemptingOffer" ||
    site.type === "Gamble" ||
    site.type === "TemporalFork"
  ) {
    content = <StubSiteScreen site={site} />;
  } else {
    content = <GenericSitePlaceholder site={site} />;
  }

  return (
    <>
      <SiteSceneBackdrop />
      <div className="site-screen-content">{content}</div>
    </>
  );
}

/**
 * Wrapper that bridges the quest prototype's site state to the journeys
 * module. Builds the `JourneyContext` from live quest state + content via
 * the adapter boundary, and forwards `onClose` to the
 * `completeDreamAugurySite` mutation. The `site_completed` log event the
 * screen produces fires inside `completeDreamAugurySite` so analytics
 * stay consistent with other site types.
 */
function DreamAugurySiteScreen({
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
      siteType: "DreamAugury",
      isEnhanced: site.isEnhanced,
    });
  }, [site.id, site.isEnhanced]);

  const handleClose = useCallback(() => {
    mutations.completeDreamAugurySite(site.id);
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
    <>
      <SiteGuide siteType="DreamAugury" isEnhanced={site.isEnhanced} />
      <JourneyScreen
        context={journeyContext}
        onClose={handleClose}
        siteId={site.id}
        mutations={journeyMutations}
        debugForcing={debugForcing}
        onExplanationChange={onJourneyExplanationChange}
      />
    </>
  );
}

function DreamMerchantSiteScreen({ site }: { site: SiteState }) {
  const { state, mutations, questContent } = useQuest();
  const loggedOfferSignatureRef = useRef<string | null>(null);
  const publishedCardSourceSignatureRef = useRef<string | null>(null);
  const cardSourceLifetimeGenerationRef = useRef(0);
  const setCardSourceDebugRef = useRef(mutations.setCardSourceDebug);

  useEffect(() => {
    setCardSourceDebugRef.current = mutations.setCardSourceDebug;
  }, [mutations.setCardSourceDebug]);

  useEffect(() => {
    logEvent("site_entered", {
      siteType: "DreamAugury",
      isEnhanced: site.isEnhanced,
    });
  }, [site.id, site.isEnhanced]);

  // The resident guide (Aldric) is the central figure of this scene. Resolve his
  // name + a greeting line so the merchant screen can caption him from inside the
  // scaled composition rather than from a viewport-fixed corner dock.
  const guide = useMemo(
    () => guideForSiteType(questContent.guides, "DreamAugury"),
    [questContent.guides],
  );
  const guideLine = useMemo(() => {
    if (guide === null || guide.dialog.length === 0) return null;
    return guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }, [guide]);

  useEffect(() => {
    if (guide === null) return;
    logEvent("dream_guide_presented", {
      guideId: guide.id,
      siteType: "DreamAugury",
      isEnhanced: site.isEnhanced,
    });
  }, [guide, site.isEnhanced]);

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
    const { encounter, debug } = encounterResult;
    // The deck the merchant scored against — emitted once per encounter (it is
    // shared by both offers). Each `merchant_offer_built` line back-references it
    // by `deckSize` + `deckHash`; the raw feature tallies live only here.
    const deck = buildMerchantDeckSnapshot(merchantContext);
    logEvent("merchant_encounter_generated", {
      siteId: site.id,
      encounterSignature: encounter.encounterSignature,
      offerCount: encounter.offers.length,
      deck,
      debug,
    });
    // One per-offer event carrying the builder's trace (candidate set, scores,
    // band, branch). Cross-linked to the encounter by `encounterSignature`.
    for (const offer of encounter.offers) {
      logEvent("merchant_offer_built", {
        siteId: site.id,
        encounterSignature: offer.encounterSignature,
        offerId: offer.offerId,
        archetypeId: offer.archetypeId,
        family: offer.family,
        targetKey: offer.targetKey,
        isChooser: offer.choiceRequest !== undefined,
        deckSize: deck.size,
        deckHash: deck.hash,
        trace: offer.trace ?? null,
      });
    }
  }, [encounterResult, merchantContext, site.id]);

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
    if (!encounterResult.ok) return;
    if (
      publishedCardSourceSignatureRef.current ===
      encounterResult.encounter.encounterSignature
    ) {
      return;
    }
    publishedCardSourceSignatureRef.current =
      encounterResult.encounter.encounterSignature;
    setCardSourceDebugRef.current(
      cardSourceDebugState,
      "merchant_grant_cards_shown",
    );
  }, [cardSourceDebugState, encounterResult]);

  useEffect(() => {
    const generation = cardSourceLifetimeGenerationRef.current + 1;
    cardSourceLifetimeGenerationRef.current = generation;
    return () => {
      queueMicrotask(() => {
        if (cardSourceLifetimeGenerationRef.current !== generation) return;
        publishedCardSourceSignatureRef.current = null;
        setCardSourceDebugRef.current(null, "merchant_grant_cards_hidden");
      });
    };
  }, [site.id]);

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
  const handleReroll = useCallback(() => {
    mutations.rerollDreamAugury?.(site.id);
  }, [mutations, site.id]);
  const handleForceArchetype = useCallback(
    (archetypeId: MerchantArchetypeId | null) => {
      mutations.forceDreamAuguryArchetype?.(site.id, archetypeId);
    },
    [mutations, site.id],
  );

  const handleFallbackWalkAway = useCallback(() => {
    logEvent("merchant_offer_validation_failed", {
      siteId: site.id,
      reason: "encounter_unavailable",
      message: encounterResult.ok ? undefined : encounterResult.message,
    });
    mutations.completeDreamAugurySite(site.id);
  }, [encounterResult, mutations, site.id]);

  if (!encounterResult.ok) {
    return (
      <main
        className="min-h-full bg-[#090b10] p-6 text-slate-100"
        data-testid="dream-merchant-v2-fallback"
      >
        <SiteGuide siteType="DreamAugury" isEnhanced={site.isEnhanced} />
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
      // Reset the screen's local selection state whenever the encounter
      // changes (e.g. after a debug reroll regenerates the offers).
      key={encounterResult.encounter.encounterSignature}
      site={site}
      context={merchantContext}
      questState={state}
      guideName={guide?.name}
      guideLine={guideLine}
      encounter={encounterResult.encounter}
      onAcceptOffer={handleAcceptOffer}
      onDecline={handleDecline}
      onReroll={handleReroll}
      onForceArchetype={
        mutations.forceDreamAuguryArchetype === undefined
          ? undefined
          : handleForceArchetype
      }
      eligibleArchetypeIds={encounterResult.debug.eligibleArchetypeIds}
      forcedArchetypeId={merchantContext.forcedArchetypeId ?? null}
    />
  );
}

function collectVisibleGrantCards(
  offers: readonly { gameObjects: readonly MerchantGameObject[]; choiceRequest?: { candidates: readonly { gameObjects: readonly MerchantGameObject[] }[] } }[],
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
    collect(offer.gameObjects);
    for (const candidate of offer.choiceRequest?.candidates ?? []) {
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
