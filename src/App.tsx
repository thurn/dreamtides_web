import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Cumulus base interaction reset — disables native mobile long-press behaviour
// (selection magnifier, iOS callout, Android context menu) across the `.cumulus`
// subtree so it never fights Cumulus's own long-press-to-reveal gesture. Loaded
// with the game entry only, so the /cumulus docs and editor tools keep normal
// text selection. See src/cumulus/primitives/cumulus-base.css.
import "./cumulus/primitives/cumulus-base.css";
import type { Database } from "firebase/database";
import type { CardData } from "./types/cards";
import type { JourneyContent } from "./data/journey-content";
import {
  AFFINITY_GROWN_POOL_VARIANTS,
  buildDreamAvatarProvenance,
  buildDreamAvatarSeedProvenance,
  buildDreamAvatarTides4Provenance,
  loadJourneyContent,
  poolVariantNeedsTides4,
} from "./data/journey-content";
import { loadTutorialConfiguration } from "./data/tutorial-actions";
import { getFirebaseDatabase } from "./firebase/app-config";
import { RoomGate } from "./coop/RoomGate";
import {
  CoopProvider,
  useConfirmedHead,
  useConnectedCount,
} from "./coop/hooks";
import { EventLogViewer } from "./coop/EventLogViewer";
import { registerGameProviders } from "./coop/providers/register-game-providers";
import { useJourney } from "./state/journey-context";
import { CoopJourneyProvider } from "./state/coop-journey-context";
import { FrontDoorProvider } from "./state/front-door-context";
import { FrontDoorRouter } from "./components/FrontDoorRouter";
import { HostedPlaytestShell } from "./coop/HostedPlaytestShell";
import { FuzzProbe } from "./coop/FuzzProbe";
import { ScreenRouter } from "./components/ScreenRouter";
import { DesktopDeckViewerAdapter } from "./screens/cumulus_adapters/DesktopDeckViewerAdapter";
import { MobileDeckViewerAdapter } from "./screens/cumulus_adapters/MobileDeckViewerAdapter";
import { useIsDesktop } from "./cumulus/screens/use-is-desktop";
import { ApplicationStateScreen } from "./cumulus/screens/ApplicationStateScreen";
import { PoolViewerAdapter } from "./screens/cumulus_adapters/PoolViewerAdapter";
import { StartingDeckOverlayAdapter } from "./screens/cumulus_adapters/StartingDeckOverlayAdapter";
import { DebugScreen } from "./screens/DebugScreen";
import JourneyDebugEditor from "./screens/JourneyDebugEditor";
import { CardSourceOverlay } from "./screens/CardSourceOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { STARTER_CARD_NUMBERS } from "./data/starter-cards";
import { getSavedJourney } from "./state/saved-journeys";
import { logEvent } from "./logging";
import type { RuntimeConfig } from "./runtime/runtime-config";
import {
  DECK_VIEWER_SCENE_ID,
  POOL_VIEWER_SCENE_ID,
  findQaScene,
} from "./runtime/qa-scenes";
import { useJourneyUrlSync } from "./runtime/use-journey-url-sync";
import type { JourneyState, SiteState } from "./types/journey";

/** Inner component that renders the gameplay router and retained app overlays. */
export function JourneyApp({
  cardDatabase,
  runtimeConfig,
}: {
  cardDatabase: Map<number, CardData>;
  runtimeConfig: RuntimeConfig;
}) {
  const { state, mutations, journeyContent } = useJourney();
  // Reflect the current screen into the address-bar path (e.g.
  // `/dreamscape/ember-wood/purge`, `/atlas`) so the URL shows where the player
  // is. Passive reflection via `history.replaceState`; the `?game=<roomId>`
  // query param remains the resume key. See `useJourneyUrlSync`.
  useJourneyUrlSync();
  // The starter-deck reveal popup is shown the first time a player picks a
  // DreamAvatar. Visibility is driven entirely by persisted journey state
  // (`dreamAvatar` set + `hasSeenStartingDeckPopup` false) so a reload of the
  // same `?game=` URL does not re-open the popup. The flag round-trips
  // through `normalizeJourneyState` so a fresh client joining the same room
  // also sees the correct state. The popup uses a full-bleed alpha scrim on
  // mobile and a centered bounded glass panel on desktop, layered on top of the
  // live dreamscape; the HUD and screen return once it is dismissed.
  const showStarterDeckIntro =
    state.dreamAvatar !== null && !state.hasSeenStartingDeckPopup;
  const isDesktopViewport = useIsDesktop();
  const activeSite = resolveActiveSite(state);
  const activeSiteType = activeSite?.type ?? null;
  const showConnectedCount =
    activeSiteType === "Purge" || activeSiteType === "Shop";
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [poolViewerOpen, setPoolViewerOpen] = useState(false);
  const [debugScreenOpen, setDebugScreenOpen] = useState(false);
  const [journeyEditorOpen, setJourneyEditorOpen] = useState(false);
  const [cardSourceOverlayOpen, setCardSourceOverlayOpen] = useState(false);
  const confirmedHead = useConfirmedHead();
  const connectedCount = useConnectedCount();
  const previousScreenTypeRef = useRef(state.screen.type);
  const gotoSceneFiredRef = useRef(false);
  const openDeckFiredRef = useRef(false);
  const openPoolViewerFiredRef = useRef(false);
  const loadJourneyFiredRef = useRef(false);
  const loadJourneyName = runtimeConfig.loadJourneyName ?? null;
  // `?loadJourney=<name>` boot flow: 'pending' holds a loading screen until the
  // saved snapshot has been fetched and dispatched; 'error' surfaces a failure;
  // 'done' (or no load requested) lets the game render normally.
  const [loadJourneyStatus, setLoadJourneyStatus] = useState<
    "idle" | "pending" | "done" | "error"
  >(loadJourneyName === null ? "idle" : "pending");
  const [loadJourneyError, setLoadJourneyError] = useState<string | null>(null);

  // `?goto=<scene>`: replace the freshly created room's empty journey state with
  // one parked on a developer QA scene (e.g. `?goto=atlas`), letting browser QA
  // open screens that are otherwise reachable only by playing battles forward.
  // Fires once per mount, and the multiplayer mutation guards on
  // `dreamAvatar === null` so a reload is a no-op.
  useEffect(() => {
    const gotoScene = runtimeConfig.gotoScene ?? null;
    if (
      gotoScene === null ||
      gotoSceneFiredRef.current ||
      confirmedHead !== 0 ||
      state.dreamAvatar !== null
    ) {
      return;
    }
    if (mutations.bootstrapQaScene === undefined) {
      return;
    }

    gotoSceneFiredRef.current = true;
    mutations.bootstrapQaScene(
      gotoScene,
      runtimeConfig.explorationCardId ?? null,
    );
  }, [
    confirmedHead,
    runtimeConfig.explorationCardId,
    runtimeConfig.gotoScene,
    state.dreamAvatar,
    mutations,
  ]);

  // `?goto=deckviewer`: the deck-viewer overlay is App-local state, not a
  // `Screen`, so its QA scene parks on the dreamscape (via `bootstrapQaScene`
  // above, giving the run a deck) and this effect opens the overlay once the
  // dreamAvatar exists. Fires once per mount.
  useEffect(() => {
    if (
      runtimeConfig.gotoScene !== DECK_VIEWER_SCENE_ID ||
      openDeckFiredRef.current ||
      state.dreamAvatar === null
    ) {
      return;
    }
    openDeckFiredRef.current = true;
    setDeckViewerOpen(true);
  }, [runtimeConfig.gotoScene, state.dreamAvatar]);

  useEffect(() => {
    if (
      runtimeConfig.gotoScene !== POOL_VIEWER_SCENE_ID ||
      openPoolViewerFiredRef.current ||
      state.dreamAvatar === null
    ) {
      return;
    }
    openPoolViewerFiredRef.current = true;
    setPoolViewerOpen(true);
  }, [runtimeConfig.gotoScene, state.dreamAvatar]);

  // `?loadJourney=<name>`: fetch the named snapshot from the dev server and
  // replace the room's journey state with it, then render the loaded run. Once
  // the snapshot is applied, the `loadJourney` param is stripped from the URL so
  // a later reload — including a Vite HMR full reload triggered by editing a
  // file — keeps the in-session run instead of re-applying the snapshot and
  // discarding progress.
  useEffect(() => {
    const journeyName = loadJourneyName;
    if (journeyName === null || loadJourneyFiredRef.current) {
      return;
    }
    if (mutations.loadJourneyState === undefined) {
      setLoadJourneyError(
        "Loading a saved journey is unavailable in this context.",
      );
      setLoadJourneyStatus("error");
      return;
    }

    loadJourneyFiredRef.current = true;
    const loadJourneyState = mutations.loadJourneyState;
    void getSavedJourney(journeyName)
      .then((loaded) => {
        if (loaded === null) {
          setLoadJourneyError(`No saved journey named "${journeyName}".`);
          setLoadJourneyStatus("error");
          return;
        }
        logEvent("debug_journey_loaded", {
          source: "load_journey_url",
          name: journeyName,
          screen: loaded.screen?.type ?? "unknown",
        });
        loadJourneyState(loaded, "load_journey_url");
        stripLoadJourneyParam();
        setLoadJourneyStatus("done");
      })
      .catch((error: unknown) => {
        setLoadJourneyError(
          error instanceof Error
            ? error.message
            : "Failed to load the saved journey.",
        );
        setLoadJourneyStatus("error");
      });
  }, [loadJourneyName, mutations]);

  const hasDraftData = state.resolvedPackage !== null;
  const hasCardSourceDebug = state.cardSourceDebug !== null;

  // In record-replay draft mode the Pool Viewer surfaces the replayed record's
  // own deck and pick log. Resolve the record the draft state points at from
  // the bundled corpus (loaded into `journeyContent`) so the viewer can show the
  // deck the original drafter built and their pack-by-pack picks.
  const draftState = state.draftState;
  const replayRecord = useMemo(() => {
    if (draftState === null || draftState.mode !== "replay") {
      return null;
    }
    const records = journeyContent.draftRecords ?? [];
    return records.find((record) => record.id === draftState.recordId) ?? null;
  }, [draftState, journeyContent.draftRecords]);

  // Recompute the full idf3 provenance for the "Why Cards" overlay on demand
  // from the run seed and the pool corpus. It is deterministic per
  // `(state.seed, dreamAvatar.id)`, so it reproduces the exact pool the player
  // is drafting from without ever being persisted. The signature is read from
  // the freshly loaded content (matched by id) rather than the RTDB-round-tripped
  // package, so an empty-array strip cannot silently lose the steer.
  const resolvedDreamAvatarId = state.resolvedPackage?.dreamAvatar.id ?? null;
  const cardSourceProvenance = useMemo(() => {
    const poolContext = journeyContent.poolContext;
    if (!cardSourceOverlayOpen || poolContext === undefined) return null;
    if (resolvedDreamAvatarId === null) return null;
    const dreamAvatar = journeyContent.dreamAvatars.find(
      (dc) => dc.id === resolvedDreamAvatarId,
    );
    if (dreamAvatar === undefined) return null;
    return buildDreamAvatarProvenance(dreamAvatar, poolContext, state.seed);
  }, [
    cardSourceOverlayOpen,
    journeyContent.poolContext,
    journeyContent.dreamAvatars,
    resolvedDreamAvatarId,
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
    const poolContext = journeyContent.poolContext;
    if (!seedProvenanceNeeded || poolContext === undefined) return null;
    if (resolvedDreamAvatarId === null) return null;
    const dreamAvatar = journeyContent.dreamAvatars.find(
      (dc) => dc.id === resolvedDreamAvatarId,
    );
    if (dreamAvatar === undefined) return null;
    return buildDreamAvatarSeedProvenance(dreamAvatar, poolContext, state.seed);
  }, [
    seedProvenanceNeeded,
    journeyContent.poolContext,
    journeyContent.dreamAvatars,
    resolvedDreamAvatarId,
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
    const poolContext = journeyContent.poolContext;
    if (!tides4ProvenanceNeeded || poolContext === undefined) return null;
    if (resolvedDreamAvatarId === null) return null;
    const dreamAvatar = journeyContent.dreamAvatars.find(
      (dc) => dc.id === resolvedDreamAvatarId,
    );
    if (dreamAvatar === undefined) return null;
    return buildDreamAvatarTides4Provenance(
      dreamAvatar,
      poolContext,
      state.seed,
    );
  }, [
    tides4ProvenanceNeeded,
    journeyContent.poolContext,
    journeyContent.dreamAvatars,
    resolvedDreamAvatarId,
    state.seed,
  ]);

  useEffect(() => {
    // FIND-01-6 (Stage 4): do NOT auto-open the deck viewer when leaving the
    // journey-start screen. The mid-journey-start deck overlay hid the first
    // site beneath a blocking modal. The starter-deck reference is one
    // "View Deck" click away on the HUD; let the player land on the site
    // unobstructed. We still observe the transition to keep the ref
    // up-to-date in case future logic needs it.
    //
    // `STARTER_CARD_NUMBERS` import retained for future starter-deck flows
    // (e.g. per-dream-avatar tutorials); underscore prefix silences unused
    // warnings without deleting the import, which other tests still rely on.
    void STARTER_CARD_NUMBERS;
    previousScreenTypeRef.current = state.screen.type;
  }, [state.deck, state.dreamAvatar, state.screen.type]);

  useEffect(() => {
    if (!hasCardSourceDebug) {
      setCardSourceOverlayOpen(false);
    }
  }, [hasCardSourceDebug]);

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

  const handleBeginJourney = useCallback(() => {
    mutations.dismissStartingDeckPopup();
  }, [mutations]);

  const handleOpenDebugScreen = useCallback(() => {
    setDebugScreenOpen(true);
  }, []);

  const handleCloseDebugScreen = useCallback(() => {
    setDebugScreenOpen(false);
  }, []);

  const handleOpenJourneyEditor = useCallback(() => {
    setJourneyEditorOpen(true);
  }, []);

  const handleCloseJourneyEditor = useCallback(() => {
    setJourneyEditorOpen(false);
  }, []);

  const handleToggleCardSourceOverlay = useCallback(() => {
    setCardSourceOverlayOpen((prev) => !prev);
  }, []);

  const handleCloseCardSourceOverlay = useCallback(() => {
    setCardSourceOverlayOpen(false);
  }, []);

  const handleRegenerateAtlas = useCallback(() => {
    mutations.regenerateAtlas?.();
  }, [mutations]);

  // `?goto=<scene>`: hold a loading screen — rather than the DreamAvatar
  // selection screen — until `bootstrapQaScene` round-trips through Firebase,
  // so QA lands directly on the requested scene (e.g. the Dream Atlas). Scenes
  // whose destination *is* the DreamAvatar selection screen (`landsOnJourneyStart`)
  // are exempt: their state keeps `dreamAvatar` null, so this gate — which waits
  // for a DreamAvatar to be selected — would otherwise spin forever.
  const gotoSceneName = runtimeConfig.gotoScene ?? null;
  const gotoScene = gotoSceneName === null ? null : findQaScene(gotoSceneName);
  if (
    gotoScene !== null &&
    gotoScene.landsOnJourneyStart !== true &&
    state.dreamAvatar === null
  ) {
    return (
      <ApplicationStateScreen
        view={{
          kind: "loading",
          title: "Opening QA Scene",
          message: "Preparing this journey state.",
          busyLabel: "Opening QA Scene",
        }}
      />
    );
  }

  // Hold a loading screen while the `?loadJourney=` snapshot is being fetched and
  // applied, so the player lands directly on the loaded run rather than the
  // DreamAvatar selection screen.
  if (loadJourneyStatus === "pending") {
    return (
      <ApplicationStateScreen
        view={{
          kind: "loading",
          title: "Loading Saved Journey",
          message: `Loading ${loadJourneyName ?? "saved journey"}.`,
          busyLabel: "Loading Saved Journey",
        }}
      />
    );
  }

  if (loadJourneyStatus === "error") {
    return (
      <ApplicationStateScreen
        view={{
          kind: "recoverableError",
          title: "Could Not Load Saved Journey",
          message: "The saved journey could not be opened.",
          detail: loadJourneyError ?? "Failed to load saved journey.",
        }}
      />
    );
  }

  return (
    <div>
      {/*
        App-shell boundary: catches anything the screen router and HUD throw
        before it reaches the React root. Without this, a render-time crash
        produces a blank #root with no fallback UI.
      */}
      <ErrorBoundary scope="app-shell">
        <ScreenRouter
          runtimeConfig={runtimeConfig}
          cumulusChromeHandlers={{
            onViewDeck: handleOpenDeckViewer,
            onOpenPoolViewer: handleOpenPoolViewer,
            onOpenDebugScreen: handleOpenDebugScreen,
            onOpenJourneyEditor: handleOpenJourneyEditor,
            onToggleCardSourceOverlay: handleToggleCardSourceOverlay,
            hasCardSourceDebug,
            isCardSourceOverlayOpen: cardSourceOverlayOpen,
            hasDraftData,
            onLoadJourneyState: mutations.loadJourneyState,
            onRegenerateAtlas: handleRegenerateAtlas,
            elevated: deckViewerOpen && !isDesktopViewport,
            showConnectedCount: !showConnectedCount,
            connectedCount,
          }}
        />
        {/*
          Per-overlay boundaries: each major modal/panel is isolated so that
          a crash inside (for example) DeckViewer leaves the dreamscape screen
          underneath interactive. `onClose` lets the user dismiss the overlay
          from the fallback.
        */}
        <ErrorBoundary
          scope="overlay:deck-viewer"
          onClose={handleCloseDeckViewer}
        >
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
        <ErrorBoundary
          scope="overlay:pool-viewer"
          onClose={handleClosePoolViewer}
        >
          <PoolViewerAdapter
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
          onClose={handleBeginJourney}
        >
          <StartingDeckOverlayAdapter
            isOpen={showStarterDeckIntro}
            onClose={handleBeginJourney}
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:debug-screen"
          onClose={handleCloseDebugScreen}
        >
          <DebugScreen
            isOpen={debugScreenOpen}
            onClose={handleCloseDebugScreen}
            draftState={state.draftState}
            cardDatabase={cardDatabase}
            resolvedPackage={state.resolvedPackage}
            remainingDreamsignPool={state.remainingDreamsignPool}
            dreamsignTemplates={journeyContent.dreamsignTemplates}
            onForceLegendaryOffer={mutations.setDraftState}
            journeyState={state}
            onLoadJourneyState={mutations.loadJourneyState}
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:journey-editor"
          onClose={handleCloseJourneyEditor}
        >
          <JourneyDebugEditor
            isOpen={journeyEditorOpen}
            onClose={handleCloseJourneyEditor}
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:card-source"
          onClose={handleCloseCardSourceOverlay}
        >
          <CardSourceOverlay
            cardSourceDebug={state.cardSourceDebug}
            cardDatabase={cardDatabase}
            idf3Provenance={cardSourceProvenance}
            seedProvenance={seedProvenance}
            tides4Provenance={tides4Provenance}
            isOpen={cardSourceOverlayOpen}
            onClose={handleCloseCardSourceOverlay}
          />
        </ErrorBoundary>
      </ErrorBoundary>
    </div>
  );
}

/**
 * Remove the `loadJourney` query param from the current URL without reloading the
 * page. Called once the named snapshot has been applied so a later reload — for
 * example a Vite HMR full reload after editing a file — keeps the in-session run
 * rather than re-fetching the snapshot and discarding progress.
 */
function stripLoadJourneyParam(): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (!url.searchParams.has("loadJourney")) {
    return;
  }
  url.searchParams.delete("loadJourney");
  window.history.replaceState(window.history.state, "", url.toString());
}

/** The site the run is currently parked on, or null when it cannot be resolved. */
function resolveActiveSite(state: JourneyState): SiteState | null {
  if (state.screen.type !== "site" || state.currentDreamscape === null) {
    return null;
  }
  const siteId = state.screen.siteId;
  const site = state.atlas.nodes[state.currentDreamscape]?.sites.find(
    (candidate) => candidate.id === siteId,
  );
  return site ?? null;
}

export default function App({
  runtimeConfig,
  frontDoorEntry,
  directTutorialBattle = false,
  previewTutorialVictory = false,
}: {
  runtimeConfig: RuntimeConfig;
  frontDoorEntry?: "main" | "loading" | "tutorial";
  directTutorialBattle?: boolean;
  previewTutorialVictory?: boolean;
}) {
  const [journeyContent, setJourneyContent] = useState<JourneyContent | null>(
    null,
  );
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
    Promise.all([
      loadJourneyContent(
        runtimeConfig.poolVariant,
        runtimeConfig.draftMode,
        runtimeConfig.fresh20PackSize,
      ),
      loadTutorialConfiguration(),
    ])
      .then(([loadedContent, tutorial]) => {
        const content = {
          ...loadedContent,
          tutorialJourneyStart: tutorial.journeyStart,
          tutorialDreamscape: tutorial.dreamscape,
          tutorialAtlas: tutorial.atlas,
          tutorialDraft: tutorial.draft,
          tutorialDreamsignRevelation: tutorial.dreamsignRevelation,
          tutorialBattleStart: tutorial.battleStart,
          tutorialTriggers: tutorial.triggers,
          tutorialBattle: tutorial.battle,
        };
        // Register the five real reducer content providers from the loaded
        // content BEFORE any room folds an event. Until this runs, every
        // provider-backed event (START_JOURNEY, SELECT_DREAM_AVATAR, ADD_CARD,
        // ADD_DREAMSIGN, content-coupled OPEN_SITE / REROLL_SHOP / BEGIN_BATTLE)
        // bounces. Registering here — before `setJourneyContent` unblocks the
        // render that mounts RoomGate / CoopProvider — guarantees the ordering,
        // and the registration is identical across clients on the same build.
        registerGameProviders(content);
        setJourneyContent(content);
        setLoadError(null);
      })
      .catch((error) => {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load journey content.",
        );
      });
  }, [
    runtimeConfig.poolVariant,
    runtimeConfig.draftMode,
    runtimeConfig.fresh20PackSize,
  ]);

  useEffect(() => {
    if (journeyContent === null) {
      return;
    }

    try {
      setDatabase(getFirebaseDatabase(runtimeConfig.databaseMode));
      setFirebaseError(null);
    } catch (error) {
      setDatabase(null);
      setFirebaseError(
        error instanceof Error
          ? error.message
          : "Failed to initialize Firebase.",
      );
    }
  }, [journeyContent, runtimeConfig.databaseMode]);

  if (loadError !== null) {
    return (
      <ApplicationStateScreen
        view={{
          kind: "recoverableError",
          title: "Journey Content Failed to Load",
          message: "The journey content could not be prepared.",
          detail: loadError,
          actions: [
            {
              id: "primary",
              label: "Retry",
              onPress: () => window.location.reload(),
            },
            {
              id: "secondary",
              label: "Copy Details",
              onPress: () => void navigator.clipboard?.writeText(loadError),
            },
          ],
        }}
      />
    );
  }

  if (journeyContent === null) {
    return (
      <ApplicationStateScreen
        view={{
          kind: "loading",
          title: "Loading Journey Content",
          message: "Gathering the dream’s cards and paths.",
          busyLabel: "Loading Journey Content",
        }}
      />
    );
  }

  if (firebaseError !== null) {
    return (
      <ApplicationStateScreen
        view={{
          kind: "fatalConfiguration",
          title: "Firebase Setup Issue",
          message: firebaseSetupHelp(runtimeConfig.databaseMode),
          detail: firebaseError,
        }}
      />
    );
  }

  if (database === null) {
    return (
      <ApplicationStateScreen
        view={{
          kind: "loading",
          title: "Connecting to Game Service",
          message: "Preparing your shared game.",
          busyLabel: "Connecting to Game Service",
        }}
      />
    );
  }

  // `?viewLogs=<roomId>`: render the read-only log viewer instead of joining a
  // game, so a production run's persisted log can be inspected without playing.
  const viewLogsRoomId = runtimeConfig.viewLogs ?? null;
  if (viewLogsRoomId !== null) {
    return <EventLogViewer db={database} gameId={viewLogsRoomId} />;
  }

  return (
    <RoomGate
      db={database}
      gameId={runtimeConfig.gameId}
      runtimeConfig={runtimeConfig}
      frontDoorEntry={frontDoorEntry}
    >
      {(context) => (
        <CoopProvider context={context}>
          {import.meta.env.VITE_FUZZ_TEST === "1" ? <FuzzProbe /> : null}
          <CoopJourneyProvider journeyContent={journeyContent}>
            <FrontDoorProvider>
              <HostedPlaytestShell claimUnownedBattle={directTutorialBattle}>
                <FrontDoorRouter
                  dreamAvatars={journeyContent.dreamAvatars}
                  tutorialPlaybackSpeed={
                    runtimeConfig.tutorialPlaybackSpeed ?? 1
                  }
                  directTutorialBattle={directTutorialBattle}
                  previewTutorialVictory={previewTutorialVictory}
                  journey={
                    <JourneyApp
                      cardDatabase={journeyContent.cardDatabase}
                      runtimeConfig={runtimeConfig}
                    />
                  }
                />
              </HostedPlaytestShell>
            </FrontDoorProvider>
          </CoopJourneyProvider>
        </CoopProvider>
      )}
    </RoomGate>
  );
}

function firebaseSetupHelp(
  databaseMode: RuntimeConfig["databaseMode"],
): string {
  if (databaseMode === "emulator") {
    return "Run npm start to launch the Firebase Realtime Database emulator with Vite.";
  }

  return "Required env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.";
}
