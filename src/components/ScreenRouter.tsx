import { useCallback, useEffect, useMemo } from "react";
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
