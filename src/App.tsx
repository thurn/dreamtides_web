import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Cumulus base interaction reset — disables native mobile long-press behaviour
// (selection magnifier, iOS callout, Android context menu) across the `.cumulus`
// subtree so it never fights Cumulus's own long-press-to-reveal gesture. Loaded
// with the game entry only, so the /cumulus docs and editor tools keep normal
// text selection. See src/cumulus/primitives/cumulus-base.css.
import "./cumulus/primitives/cumulus-base.css";
import type { Database } from "firebase/database";
import type { CardData } from "./types/cards";
import type { QuestContent } from "./data/quest-content";
import {
  AFFINITY_GROWN_POOL_VARIANTS,
  buildDreamcallerProvenance,
  buildDreamcallerSeedProvenance,
  buildDreamcallerTides4Provenance,
  loadQuestContent,
  poolVariantNeedsTides4,
} from "./data/quest-content";
import { getFirebaseDatabase } from "./firebase/app-config";
import { RoomGate } from "./coop/RoomGate";
import { CoopProvider } from "./coop/hooks";
import { EventLogViewer } from "./coop/EventLogViewer";
import { registerGameProviders } from "./coop/providers/register-game-providers";
import { useQuest } from "./state/quest-context";
import { CoopQuestProvider } from "./state/coop-quest-context";
import { ScreenRouter } from "./components/ScreenRouter";
import { HUD } from "./components/HUD";
import { DesktopDeckViewerAdapter } from "./screens/cumulus_adapters/DesktopDeckViewerAdapter";
import { MobileDeckViewerAdapter } from "./screens/cumulus_adapters/MobileDeckViewerAdapter";
import { useIsDesktop } from "./cumulus/screens/use-is-desktop";
import { PoolViewer } from "./components/PoolViewer";
import { StartingDeckOverlayAdapter } from "./screens/cumulus_adapters/StartingDeckOverlayAdapter";
import { GlossaryPopup } from "./components/GlossaryPopup";
import { DebugScreen } from "./screens/DebugScreen";
import QuestDebugEditor from "./screens/QuestDebugEditor";
import { CardSourceOverlay } from "./screens/CardSourceOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { STARTER_CARD_NUMBERS } from "./data/starter-cards";
import { getSavedQuest } from "./state/saved-quests";
import { logEvent } from "./logging";
import { regenerateAtlasInPlace } from "./atlas/regenerate-atlas";
import type { RuntimeConfig } from "./runtime/runtime-config";
import { DECK_VIEWER_SCENE_ID, findQaScene } from "./runtime/qa-scenes";
import { useQuestUrlSync } from "./runtime/use-quest-url-sync";
import type { QuestState, SiteState } from "./types/quest";
import {
  isCumulusScreenRegistered,
  isCumulusSiteRegistered,
} from "./screens/cumulus_adapters/registry";
import {
  JourneyExplanationOverlay,
  type JourneyExplanation,
} from "./journeys";

/** Inner component that renders the screen router and HUD. */
export function QuestApp({
  cardDatabase,
  runtimeConfig,
}: {
  cardDatabase: Map<number, CardData>;
  runtimeConfig: RuntimeConfig;
}) {
  const { state, mutations, questContent } = useQuest();
  // Reflect the current screen into the address-bar path (e.g.
  // `/dreamscape/ember-wood/purge`, `/atlas`) so the URL shows where the player
  // is. Passive reflection via `history.replaceState`; the `?game=<roomId>`
  // query param remains the resume key. See `useQuestUrlSync`.
  useQuestUrlSync();
  // The starter-deck reveal popup is shown the first time a player picks a
  // Dreamcaller. Visibility is driven entirely by persisted quest state
  // (`dreamcaller` set + `hasSeenStartingDeckPopup` false) so a reload of the
  // same `?game=` URL does not re-open the popup. The flag round-trips
  // through `normalizeQuestState` so a fresh client joining the same room
  // also sees the correct state. The popup uses a full-bleed alpha scrim on
  // mobile and a centered bounded glass panel on desktop, layered on top of the
  // live dreamscape; the HUD and screen return once it is dismissed.
  const showStarterDeckIntro =
    state.dreamcaller !== null && !state.hasSeenStartingDeckPopup;
  const isDesktopViewport = useIsDesktop();
  const activeSite = resolveActiveSite(state);
  const activeSiteType = activeSite?.type ?? null;
  // Registered Cumulus routes receive persistent chrome from ScreenRouter, so
  // the legacy HUD suppression follows the registry automatically.
  const cumulusRouteUsesQuestChrome =
    runtimeConfig.uiVariant === "cumulus"
    && ((state.screen.type !== "questStart"
      && isCumulusScreenRegistered(state.screen))
      || (activeSite !== null && isCumulusSiteRegistered(activeSite)));
  const hidePresencePill =
    runtimeConfig.uiVariant === "cumulus"
    && (activeSiteType === "Purge" || activeSiteType === "Shop");
  const showHud =
    state.screen.type !== "questStart"
    && !isBattleSiteHudHidden(state)
    && !cumulusRouteUsesQuestChrome;
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [poolViewerOpen, setPoolViewerOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [debugScreenOpen, setDebugScreenOpen] = useState(false);
  const [questEditorOpen, setQuestEditorOpen] = useState(false);
  const [cardSourceOverlayOpen, setCardSourceOverlayOpen] = useState(false);
  const [journeyExplanationOpen, setJourneyExplanationOpen] = useState(false);
  const [journeyExplanation, setJourneyExplanation] =
    useState<JourneyExplanation | null>(null);
  const previousScreenTypeRef = useRef(state.screen.type);
  const gotoSceneFiredRef = useRef(false);
  const openDeckFiredRef = useRef(false);
  const loadQuestFiredRef = useRef(false);
  const loadQuestName = runtimeConfig.loadQuestName ?? null;
  // `?loadQuest=<name>` boot flow: 'pending' holds a loading screen until the
  // saved snapshot has been fetched and dispatched; 'error' surfaces a failure;
  // 'done' (or no load requested) lets the game render normally.
  const [loadQuestStatus, setLoadQuestStatus] = useState<
    "idle" | "pending" | "done" | "error"
  >(loadQuestName === null ? "idle" : "pending");
  const [loadQuestError, setLoadQuestError] = useState<string | null>(null);

  // `?goto=<scene>`: replace the freshly created room's empty quest state with
  // one parked on a developer QA scene (e.g. `?goto=atlas`), letting browser QA
  // open screens that are otherwise reachable only by playing battles forward.
  // Fires once per mount, and the multiplayer mutation guards on
  // `dreamcaller === null` so a reload is a no-op.
  useEffect(() => {
    const gotoScene = runtimeConfig.gotoScene ?? null;
    if (
      gotoScene === null ||
      gotoSceneFiredRef.current ||
      state.dreamcaller !== null
    ) {
      return;
    }
    if (mutations.bootstrapQaScene === undefined) {
      return;
    }

    gotoSceneFiredRef.current = true;
    mutations.bootstrapQaScene(gotoScene);
  }, [runtimeConfig.gotoScene, state.dreamcaller, mutations]);

  // `?goto=deckviewer`: the deck-viewer overlay is App-local state, not a
  // `Screen`, so its QA scene parks on the dreamscape (via `bootstrapQaScene`
  // above, giving the run a deck) and this effect opens the overlay once the
  // dreamcaller exists. Fires once per mount.
  useEffect(() => {
    if (
      runtimeConfig.gotoScene !== DECK_VIEWER_SCENE_ID ||
      openDeckFiredRef.current ||
      state.dreamcaller === null
    ) {
      return;
    }
    openDeckFiredRef.current = true;
    setDeckViewerOpen(true);
  }, [runtimeConfig.gotoScene, state.dreamcaller]);

  // `?loadQuest=<name>`: fetch the named snapshot from the dev server and
  // replace the room's quest state with it, then render the loaded run. Once
  // the snapshot is applied, the `loadQuest` param is stripped from the URL so
  // a later reload — including a Vite HMR full reload triggered by editing a
  // file — keeps the in-session run instead of re-applying the snapshot and
  // discarding progress.
  useEffect(() => {
    const questName = loadQuestName;
    if (questName === null || loadQuestFiredRef.current) {
      return;
    }
    if (mutations.loadQuestState === undefined) {
      setLoadQuestError("Loading a saved quest is unavailable in this context.");
      setLoadQuestStatus("error");
      return;
    }

    loadQuestFiredRef.current = true;
    const loadQuestState = mutations.loadQuestState;
    void getSavedQuest(questName)
      .then((loaded) => {
        if (loaded === null) {
          setLoadQuestError(`No saved quest named "${questName}".`);
          setLoadQuestStatus("error");
          return;
        }
        logEvent("debug_quest_loaded", {
          source: "load_quest_url",
          name: questName,
          screen: loaded.screen?.type ?? "unknown",
        });
        loadQuestState(loaded, "load_quest_url");
        stripLoadQuestParam();
        setLoadQuestStatus("done");
      })
      .catch((error: unknown) => {
        setLoadQuestError(
          error instanceof Error ? error.message : "Failed to load the saved quest.",
        );
        setLoadQuestStatus("error");
      });
  }, [loadQuestName, mutations]);

  const hasDraftData = state.resolvedPackage !== null;
  const hasCardSourceDebug = state.cardSourceDebug !== null;

  // In record-replay draft mode the Pool Viewer surfaces the replayed record's
  // own deck and pick log. Resolve the record the draft state points at from
  // the bundled corpus (loaded into `questContent`) so the viewer can show the
  // deck the original drafter built and their pack-by-pack picks.
  const draftState = state.draftState;
  const replayRecord = useMemo(() => {
    if (draftState === null || draftState.mode !== "replay") {
      return null;
    }
    const records = questContent.draftRecords ?? [];
    return records.find((record) => record.id === draftState.recordId) ?? null;
  }, [draftState, questContent.draftRecords]);

  // Recompute the full idf3 provenance for the "Why Cards" overlay on demand
  // from the run seed and the pool corpus. It is deterministic per
  // `(state.seed, dreamcaller.id)`, so it reproduces the exact pool the player
  // is drafting from without ever being persisted. The signature is read from
  // the freshly loaded content (matched by id) rather than the RTDB-round-tripped
  // package, so an empty-array strip cannot silently lose the steer.
  const resolvedDreamcallerId = state.resolvedPackage?.dreamcaller.id ?? null;
  const cardSourceProvenance = useMemo(() => {
    const poolContext = questContent.poolContext;
    if (!cardSourceOverlayOpen || poolContext === undefined) return null;
    if (resolvedDreamcallerId === null) return null;
    const dreamcaller = questContent.dreamcallers.find(
      (dc) => dc.id === resolvedDreamcallerId,
    );
    if (dreamcaller === undefined) return null;
    return buildDreamcallerProvenance(dreamcaller, poolContext, state.seed);
  }, [
    cardSourceOverlayOpen,
    questContent.poolContext,
    questContent.dreamcallers,
    resolvedDreamcallerId,
    state.seed,
  ]);

  // Seed-growth provenance: the random seed card and the affinity growth that
  // built the pool. Recomputed on demand (same determinism guarantees as the
  // idf3 provenance above) for the "Why Cards" overlay and the Pool Viewer, so
  // both surfaces describe the exact pool the player drafts from. Computed for
  // every affinity-grown variant (`seed` and the pick-record family); null for
  // variants that grow no seed (idf3, color_pool, ...).
  const isAffinityGrownVariant =
    runtimeConfig.poolVariant !== undefined &&
    AFFINITY_GROWN_POOL_VARIANTS.has(runtimeConfig.poolVariant);
  const seedProvenanceNeeded =
    isAffinityGrownVariant && (cardSourceOverlayOpen || poolViewerOpen);
  const seedProvenance = useMemo(() => {
    const poolContext = questContent.poolContext;
    if (!seedProvenanceNeeded || poolContext === undefined) return null;
    if (resolvedDreamcallerId === null) return null;
    const dreamcaller = questContent.dreamcallers.find(
      (dc) => dc.id === resolvedDreamcallerId,
    );
    if (dreamcaller === undefined) return null;
    return buildDreamcallerSeedProvenance(dreamcaller, poolContext, state.seed);
  }, [
    seedProvenanceNeeded,
    questContent.poolContext,
    questContent.dreamcallers,
    resolvedDreamcallerId,
    state.seed,
  ]);

  // Tide provenance: which preconstructed tides the run's pool was dealt from
  // (the signature tide, the random subset of theme tides, the broad tail) and
  // which tide each pooled card rode in on. Recomputed on demand (same
  // determinism guarantees as the provenance above) for the "Why Cards" overlay
  // and the Pool Viewer, so both surfaces describe the exact pool the player
  // drafts from. Computed only for the `tides4` variant; null otherwise.
  const isTides4Variant =
    runtimeConfig.poolVariant !== undefined &&
    poolVariantNeedsTides4(runtimeConfig.poolVariant);
  const tides4ProvenanceNeeded =
    isTides4Variant && (cardSourceOverlayOpen || poolViewerOpen);
  const tides4Provenance = useMemo(() => {
    const poolContext = questContent.poolContext;
    if (!tides4ProvenanceNeeded || poolContext === undefined) return null;
    if (resolvedDreamcallerId === null) return null;
    const dreamcaller = questContent.dreamcallers.find(
      (dc) => dc.id === resolvedDreamcallerId,
    );
    if (dreamcaller === undefined) return null;
    return buildDreamcallerTides4Provenance(dreamcaller, poolContext, state.seed);
  }, [
    tides4ProvenanceNeeded,
    questContent.poolContext,
    questContent.dreamcallers,
    resolvedDreamcallerId,
    state.seed,
  ]);

  useEffect(() => {
    // FIND-01-6 (Stage 4): do NOT auto-open the deck viewer when leaving the
    // quest-start screen. The mid-quest-start deck overlay hid the first
    // site beneath a blocking modal. The starter-deck reference is one
    // "View Deck" click away on the HUD; let the player land on the site
    // unobstructed. We still observe the transition to keep the ref
    // up-to-date in case future logic needs it.
    //
    // `STARTER_CARD_NUMBERS` import retained for future starter-deck flows
    // (e.g. per-dreamcaller tutorials); underscore prefix silences unused
    // warnings without deleting the import, which other tests still rely on.
    void STARTER_CARD_NUMBERS;
    previousScreenTypeRef.current = state.screen.type;
  }, [state.deck, state.dreamcaller, state.screen.type]);

  useEffect(() => {
    if (!hasCardSourceDebug) {
      setCardSourceOverlayOpen(false);
    }
  }, [hasCardSourceDebug]);

  useEffect(() => {
    if (journeyExplanation === null) {
      setJourneyExplanationOpen(false);
    }
  }, [journeyExplanation]);

  const handleOpenDeckViewer = useCallback(() => {
    setDeckViewerOpen(true);
  }, []);

  const handleCloseDeckViewer = useCallback(() => {
    setDeckViewerOpen(false);
  }, []);

  const handleOpenPoolViewer = useCallback(() => {
    setPoolViewerOpen(true);
  }, []);

  const handleClosePoolViewer = useCallback(() => {
    setPoolViewerOpen(false);
  }, []);

  const handleOpenGlossary = useCallback(() => {
    setGlossaryOpen(true);
  }, []);

  const handleCloseGlossary = useCallback(() => {
    setGlossaryOpen(false);
  }, []);

  const handleBeginQuest = useCallback(() => {
    mutations.dismissStartingDeckPopup();
  }, [mutations]);

  const handleOpenDebugScreen = useCallback(() => {
    setDebugScreenOpen(true);
  }, []);

  const handleCloseDebugScreen = useCallback(() => {
    setDebugScreenOpen(false);
  }, []);

  const handleOpenQuestEditor = useCallback(() => {
    setQuestEditorOpen(true);
  }, []);

  const handleCloseQuestEditor = useCallback(() => {
    setQuestEditorOpen(false);
  }, []);

  const handleToggleCardSourceOverlay = useCallback(() => {
    setCardSourceOverlayOpen((prev) => !prev);
  }, []);

  const handleCloseCardSourceOverlay = useCallback(() => {
    setCardSourceOverlayOpen(false);
  }, []);

  const handleToggleJourneyExplanation = useCallback(() => {
    setJourneyExplanationOpen((prev) => !prev);
  }, []);

  const handleRegenerateAtlas = useCallback(() => {
    regenerateAtlasInPlace({
      state,
      questContent,
      updateAtlas: mutations.updateAtlas,
      setCurrentDreamscape: mutations.setCurrentDreamscape,
    });
  }, [state, questContent, mutations]);

  const handleCloseJourneyExplanation = useCallback(() => {
    setJourneyExplanationOpen(false);
  }, []);

  // `?goto=<scene>`: hold a loading screen — rather than the Dreamcaller
  // selection screen — until `bootstrapQaScene` round-trips through Firebase,
  // so QA lands directly on the requested scene (e.g. the Dream Atlas). Scenes
  // whose destination *is* the Dreamcaller selection screen (`landsOnQuestStart`)
  // are exempt: their state keeps `dreamcaller` null, so this gate — which waits
  // for a Dreamcaller to be selected — would otherwise spin forever.
  const gotoSceneName = runtimeConfig.gotoScene ?? null;
  const gotoScene = gotoSceneName === null ? null : findQaScene(gotoSceneName);
  if (
    gotoScene !== null &&
    gotoScene.landsOnQuestStart !== true &&
    state.dreamcaller === null
  ) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <p className="text-lg opacity-80">Opening QA scene...</p>
      </div>
    );
  }

  // Hold a loading screen while the `?loadQuest=` snapshot is being fetched and
  // applied, so the player lands directly on the loaded run rather than the
  // Dreamcaller selection screen.
  if (loadQuestStatus === "pending") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <p className="text-lg opacity-80">
          Loading saved quest &ldquo;{loadQuestName}&rdquo;...
        </p>
      </div>
    );
  }

  if (loadQuestStatus === "error") {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div
          role="alert"
          className="max-w-2xl w-full rounded-lg border border-red-500/60 bg-red-950/40 p-6 shadow-lg"
        >
          <h1 className="mb-3 text-xl font-semibold text-red-200">
            Could not load saved quest
          </h1>
          <p className="font-mono text-sm text-red-100">{loadQuestError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: showHud ? "64px" : "0" }}>
      {/*
        App-shell boundary: catches anything the screen router and HUD throw
        before it reaches the React root. Without this, a render-time crash
        produces a blank #root with no fallback UI.
      */}
      <ErrorBoundary scope="app-shell">
        {hidePresencePill && <style>{`[data-connected-count]{display:none}`}</style>}
        <ScreenRouter
          runtimeConfig={runtimeConfig}
          onJourneyExplanationChange={setJourneyExplanation}
          cumulusChromeHandlers={{
            onViewDeck: handleOpenDeckViewer,
            onOpenGlossary: handleOpenGlossary,
            onOpenPoolViewer: handleOpenPoolViewer,
            onOpenDebugScreen: handleOpenDebugScreen,
            onOpenQuestEditor: handleOpenQuestEditor,
            hasDraftData,
            onLoadQuestState: mutations.loadQuestState,
            onRegenerateAtlas: handleRegenerateAtlas,
            elevated: deckViewerOpen && !isDesktopViewport,
          }}
        />
        {showHud && (
          <ErrorBoundary scope="overlay:hud">
            <HUD
              onOpenDeckViewer={handleOpenDeckViewer}
              onOpenGlossary={handleOpenGlossary}
              onOpenPoolViewer={handleOpenPoolViewer}
              onOpenDebugScreen={handleOpenDebugScreen}
              onOpenQuestEditor={handleOpenQuestEditor}
              onToggleCardSourceOverlay={handleToggleCardSourceOverlay}
              hasDraftData={hasDraftData}
              hasCardSourceDebug={hasCardSourceDebug}
              isCardSourceOverlayOpen={cardSourceOverlayOpen}
              hasJourneyExplanation={journeyExplanation !== null}
              isJourneyExplanationOpen={journeyExplanationOpen}
              onToggleJourneyExplanation={handleToggleJourneyExplanation}
              onLoadQuestState={mutations.loadQuestState}
            />
          </ErrorBoundary>
        )}
        {/*
          Per-overlay boundaries: each major modal/panel is isolated so that
          a crash inside (for example) DeckViewer leaves the dreamscape screen
          underneath interactive. `onClose` lets the user dismiss the overlay
          from the fallback.
        */}
        <ErrorBoundary scope="overlay:deck-viewer" onClose={handleCloseDeckViewer}>
          {isDesktopViewport ? (
            <DesktopDeckViewerAdapter
              isOpen={deckViewerOpen}
              onClose={handleCloseDeckViewer}
            />
          ) : (
            <MobileDeckViewerAdapter
              isOpen={deckViewerOpen}
              onClose={handleCloseDeckViewer}
            />
          )}
        </ErrorBoundary>
        <ErrorBoundary scope="overlay:pool-viewer" onClose={handleClosePoolViewer}>
          <PoolViewer
            cardDatabase={cardDatabase}
            draftState={state.draftState}
            resolvedPackage={state.resolvedPackage}
            poolVariant={runtimeConfig.poolVariant}
            replayRecord={replayRecord}
            seedProvenance={seedProvenance}
            tides4Provenance={tides4Provenance}
            isOpen={poolViewerOpen}
            onClose={handleClosePoolViewer}
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:starting-deck-modal"
          onClose={handleBeginQuest}
        >
          <StartingDeckOverlayAdapter
            isOpen={showStarterDeckIntro}
            onClose={handleBeginQuest}
          />
        </ErrorBoundary>
        <ErrorBoundary scope="overlay:glossary" onClose={handleCloseGlossary}>
          <GlossaryPopup isOpen={glossaryOpen} onClose={handleCloseGlossary} />
        </ErrorBoundary>
        <ErrorBoundary scope="overlay:debug-screen" onClose={handleCloseDebugScreen}>
          <DebugScreen
            isOpen={debugScreenOpen}
            onClose={handleCloseDebugScreen}
            draftState={state.draftState}
            cardDatabase={cardDatabase}
            resolvedPackage={state.resolvedPackage}
            remainingDreamsignPool={state.remainingDreamsignPool}
            dreamsignTemplates={questContent.dreamsignTemplates}
            onForceLegendaryOffer={mutations.setDraftState}
            questState={state}
            onLoadQuestState={mutations.loadQuestState}
          />
        </ErrorBoundary>
        <ErrorBoundary scope="overlay:quest-editor" onClose={handleCloseQuestEditor}>
          <QuestDebugEditor
            isOpen={questEditorOpen}
            onClose={handleCloseQuestEditor}
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:card-source"
          onClose={handleCloseCardSourceOverlay}
        >
          <CardSourceOverlay
            cardSourceDebug={state.cardSourceDebug}
            idf3Provenance={cardSourceProvenance}
            seedProvenance={seedProvenance}
            tides4Provenance={tides4Provenance}
            isOpen={cardSourceOverlayOpen}
            onClose={handleCloseCardSourceOverlay}
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:journey-explanation"
          onClose={handleCloseJourneyExplanation}
        >
          <JourneyExplanationOverlay
            explanation={journeyExplanation}
            isOpen={journeyExplanationOpen}
            onClose={handleCloseJourneyExplanation}
          />
        </ErrorBoundary>
      </ErrorBoundary>
    </div>
  );
}

/**
 * Remove the `loadQuest` query param from the current URL without reloading the
 * page. Called once the named snapshot has been applied so a later reload — for
 * example a Vite HMR full reload after editing a file — keeps the in-session run
 * rather than re-fetching the snapshot and discarding progress.
 */
function stripLoadQuestParam(): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (!url.searchParams.has("loadQuest")) {
    return;
  }
  url.searchParams.delete("loadQuest");
  window.history.replaceState(window.history.state, "", url.toString());
}

/** The site the run is currently parked on, or null when it cannot be resolved. */
function resolveActiveSite(state: QuestState): SiteState | null {
  if (state.screen.type !== "site" || state.currentDreamscape === null) {
    return null;
  }
  const siteId = state.screen.siteId;
  const site = state.atlas.nodes[state.currentDreamscape]?.sites.find(
    (candidate) => candidate.id === siteId,
  );
  return site ?? null;
}

function isBattleSiteHudHidden(state: QuestState): boolean {
  if (state.screen.type !== "site") {
    return false;
  }

  if (state.currentDreamscape === null) {
    return false;
  }

  const siteId = state.screen.siteId;
  return state.atlas.nodes[state.currentDreamscape]
    ?.sites.some((site) => site.id === siteId && site.type === "Battle")
    ?? false;
}

export default function App({ runtimeConfig }: { runtimeConfig: RuntimeConfig }) {
  const [questContent, setQuestContent] = useState<QuestContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [database, setDatabase] = useState<Database | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  // Long-press context-menu suppression for the Cumulus subtree. The CSS reset
  // (cumulus-base.css) kills selection and the iOS callout, but Android raises a
  // context menu when an image is held, and desktop shows the browser menu on
  // right-click — neither is expressible in CSS. One delegated listener cancels
  // it for any target inside a `.cumulus` element (cards, art, controls), leaving
  // non-Cumulus surfaces untouched. Scoped to the game because this effect only
  // mounts with the game app.
  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(".cumulus")) {
        event.preventDefault();
      }
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useEffect(() => {
    loadQuestContent(
      runtimeConfig.poolVariant,
      runtimeConfig.draftMode,
      runtimeConfig.fresh20PackSize,
      runtimeConfig.journeyVariant,
    )
      .then((content) => {
        // Register the five real reducer content providers from the loaded
        // content BEFORE any room folds an event. Until this runs, every
        // provider-backed event (START_QUEST, SELECT_DREAMCALLER, ADD_CARD,
        // ADD_DREAMSIGN, content-coupled OPEN_SITE / REROLL_SHOP / BEGIN_BATTLE)
        // bounces. Registering here — before `setQuestContent` unblocks the
        // render that mounts RoomGate / CoopProvider — guarantees the ordering,
        // and the registration is identical across clients on the same build.
        registerGameProviders(content);
        setQuestContent(content);
        setLoadError(null);
      })
      .catch((error) => {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load quest content.",
        );
      });
  }, [
    runtimeConfig.poolVariant,
    runtimeConfig.draftMode,
    runtimeConfig.fresh20PackSize,
    runtimeConfig.journeyVariant,
  ]);

  useEffect(() => {
    if (questContent === null) {
      return;
    }

    try {
      setDatabase(getFirebaseDatabase(runtimeConfig.databaseMode));
      setFirebaseError(null);
    } catch (error) {
      setDatabase(null);
      setFirebaseError(
        error instanceof Error ? error.message : "Failed to initialize Firebase.",
      );
    }
  }, [questContent, runtimeConfig.databaseMode]);

  if (loadError !== null) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div
          role="alert"
          className="max-w-3xl w-full rounded-lg border border-red-500/60 bg-red-950/40 p-6 shadow-lg"
        >
          <h1 className="mb-3 text-xl font-semibold text-red-200">
            Quest content failed to load
          </h1>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-black/40 p-4 font-mono text-xs text-red-100">
            {loadError}
          </pre>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(loadError);
              }}
              className="rounded border border-red-400/50 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20"
            >
              Copy details
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (questContent === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <p className="text-lg opacity-80">Loading quest content...</p>
      </div>
    );
  }

  if (firebaseError !== null) {
    return (
      <main>
        <h1>Firebase setup issue</h1>
        <div>
          <p>{firebaseError}</p>
          <p>{firebaseSetupHelp(runtimeConfig.databaseMode)}</p>
        </div>
      </main>
    );
  }

  if (database === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <p className="text-lg opacity-80">Loading quest content...</p>
      </div>
    );
  }

  // `?viewLogs=<roomId>`: render the read-only log viewer instead of joining a
  // game, so a production run's persisted log can be inspected without playing.
  const viewLogsRoomId = runtimeConfig.viewLogs ?? null;
  if (viewLogsRoomId !== null) {
    return <EventLogViewer db={database} gameId={viewLogsRoomId} />;
  }

  return (
    <RoomGate db={database} gameId={runtimeConfig.gameId} runtimeConfig={runtimeConfig}>
      {(context) => (
        <CoopProvider context={context}>
          <CoopQuestProvider questContent={questContent}>
            <QuestApp
              cardDatabase={questContent.cardDatabase}
              runtimeConfig={runtimeConfig}
            />
          </CoopQuestProvider>
        </CoopProvider>
      )}
    </RoomGate>
  );
}

function firebaseSetupHelp(databaseMode: RuntimeConfig["databaseMode"]): string {
  if (databaseMode === "emulator") {
    return "Run npm start to launch the Firebase Realtime Database emulator with Vite.";
  }

  return "Required env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.";
}
