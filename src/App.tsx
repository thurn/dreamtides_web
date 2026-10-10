import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Cumulus base interaction reset — disables native mobile long-press behaviour
// (selection magnifier, iOS callout, Android context menu) across the `.cumulus`
// subtree so it never fights Cumulus's own long-press-to-reveal gesture. See
// src/cumulus/primitives/cumulus-base.css.
import "./cumulus/primitives/cumulus-base.css";
import type { CardData } from "./types/cards";
import type { JourneyContent } from "./data/journey-content";
import {
  buildAvatarTides4Provenance,
  loadJourneyContent,
} from "./data/journey-content";
import { ConfigGateScreen } from "./components/ConfigGateScreen";
import { registerGameProviders } from "./session/providers/register-game-providers";
import { LocalGameProvider, useConfirmedHead } from "./session/hooks";
import { useLocalGame } from "./session/use-local-game";
import type { FrontDoorEntry } from "./session/genesis";
import { useJourney } from "./state/journey-context";
import { GameJourneyProvider } from "./state/game-journey-context";
import { FrontDoorProvider } from "./state/front-door-context";
import { FrontDoorRouter } from "./components/FrontDoorRouter";

import { ScreenRouter } from "./components/ScreenRouter";
import { DesktopDeckViewerAdapter } from "./screens/cumulus_adapters/DesktopDeckViewerAdapter";
import { MobileDeckViewerAdapter } from "./screens/cumulus_adapters/MobileDeckViewerAdapter";
import { useIsDesktop } from "./cumulus/primitives/use-is-desktop";
import { ApplicationStateScreen } from "./cumulus/screens/ApplicationStateScreen";
import { PoolViewerAdapter } from "./screens/cumulus_adapters/PoolViewerAdapter";
import { StartingDeckOverlayAdapter } from "./screens/cumulus_adapters/StartingDeckOverlayAdapter";
import { DebugScreen } from "./screens/DebugScreen";
import JourneyDebugEditor from "./screens/JourneyDebugEditor";
import { CardSourceOverlay } from "./screens/CardSourceOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  DECK_VIEWER_SCENE_ID,
  POOL_VIEWER_SCENE_ID,
  contentConfigFromRuntime,
  type RuntimeConfig,
} from "./runtime/runtime-config";
import { findQaScene } from "./runtime/qa-scene-entry";
import { useJourneyUrlSync } from "./runtime/use-journey-url-sync";

/** Inner component that renders the gameplay router and retained app overlays. */
export function JourneyApp({
  cardDatabase,
  runtimeConfig,
}: {
  cardDatabase: Map<number, CardData>;
  runtimeConfig: RuntimeConfig;
}) {
  const { state, mutations, journeyContent } = useJourney();
  const resolvedPoolVariant =
    journeyContent.poolContext.poolVariant ??
    journeyContent.draftData.pool.defaultStrategy;
  // Reflect the current screen into the address-bar path (e.g.
  // `/dreamscape/ember-wood/purge`, `/atlas`) so the URL shows where the player
  // is. Passive reflection via `history.replaceState`; the `?game=<gameId>`
  // query param remains the resume key. See `useJourneyUrlSync`.
  useJourneyUrlSync();
  // The starter-deck reveal popup is shown the first time a player picks a
  // Avatar. Visibility is driven entirely by persisted journey state
  // (`avatar` set + `hasSeenStartingDeckPopup` false) so a reload of the
  // same `?game=` URL does not re-open the popup. The flag round-trips
  // through `normalizeJourneyState` with the rest of the saved game. The popup uses a full-bleed alpha scrim on
  // mobile and a centered bounded glass panel on desktop, layered on top of the
  // live dreamscape; the HUD and screen return once it is dismissed.
  const showStarterDeckIntro =
    state.avatar !== null && !state.hasSeenStartingDeckPopup;
  const isDesktopViewport = useIsDesktop();
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [poolViewerOpen, setPoolViewerOpen] = useState(false);
  const [debugScreenOpen, setDebugScreenOpen] = useState(false);
  const [journeyEditorOpen, setJourneyEditorOpen] = useState(false);
  const [cardSourceOverlayOpen, setCardSourceOverlayOpen] = useState(false);
  const confirmedHead = useConfirmedHead();
  const previousScreenTypeRef = useRef(state.screen.type);
  const gotoSceneFiredRef = useRef(false);
  const openDeckFiredRef = useRef(false);
  const openPoolViewerFiredRef = useRef(false);

  // `?goto=<scene>`: replace the freshly created game's empty journey state with
  // one parked on a developer QA scene (e.g. `?goto=atlas`), letting browser QA
  // open screens that are otherwise reachable only by playing battles forward.
  // Fires once per mount, and the mutation guards on `avatar === null` so a
  // reload is a no-op.
  useEffect(() => {
    const gotoScene = runtimeConfig.gotoScene ?? null;
    if (
      gotoScene === null ||
      gotoSceneFiredRef.current ||
      confirmedHead !== 0 ||
      state.avatar !== null
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
      runtimeConfig.explorationDreamsignCount ?? null,
      runtimeConfig.explorationDreamsignCap ?? null,
      runtimeConfig.explorationStarterCount ?? null,
    );
  }, [
    confirmedHead,
    runtimeConfig.explorationCardId,
    runtimeConfig.explorationDreamsignCap,
    runtimeConfig.explorationDreamsignCount,
    runtimeConfig.explorationStarterCount,
    runtimeConfig.gotoScene,
    state.avatar,
    mutations,
  ]);

  // `?goto=deckviewer`: the deck-viewer overlay is App-local state, not a
  // `Screen`, so its QA scene parks on the dreamscape (via `bootstrapQaScene`
  // above, giving the run a deck) and this effect opens the overlay once the
  // avatar exists. Fires once per mount.
  useEffect(() => {
    if (
      runtimeConfig.gotoScene !== DECK_VIEWER_SCENE_ID ||
      openDeckFiredRef.current ||
      state.avatar === null
    ) {
      return;
    }
    openDeckFiredRef.current = true;
    setDeckViewerOpen(true);
  }, [runtimeConfig.gotoScene, state.avatar]);

  useEffect(() => {
    if (
      runtimeConfig.gotoScene !== POOL_VIEWER_SCENE_ID ||
      openPoolViewerFiredRef.current ||
      state.avatar === null
    ) {
      return;
    }
    openPoolViewerFiredRef.current = true;
    setPoolViewerOpen(true);
  }, [runtimeConfig.gotoScene, state.avatar]);


  const hasDraftData = state.resolvedPackage !== null;
  const hasCardSourceDebug = state.cardSourceDebug !== null;

  const resolvedAvatarId = state.resolvedPackage?.avatar.id ?? null;
  // Tide provenance: which preconstructed tides the run's pool was dealt from
  // (the signature tide, the random subset of theme tides, the broad tail) and
  // which tide each pooled card rode in on. Recomputed on demand (same
  // determinism guarantees as the provenance above) for the "Why Cards" overlay
  // and the Pool Viewer, so both surfaces describe the exact pool the player
  // drafts from.
  const tides4ProvenanceNeeded = cardSourceOverlayOpen || poolViewerOpen;
  const tides4Provenance = useMemo(() => {
    const poolContext = journeyContent.poolContext;
    if (!tides4ProvenanceNeeded) return null;
    if (resolvedAvatarId === null) return null;
    const avatar = journeyContent.avatars.find(
      (dc) => dc.id === resolvedAvatarId,
    );
    if (avatar === undefined) return null;
    return buildAvatarTides4Provenance(avatar, poolContext, state.seed);
  }, [
    tides4ProvenanceNeeded,
    journeyContent.poolContext,
    journeyContent.avatars,
    resolvedAvatarId,
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
    previousScreenTypeRef.current = state.screen.type;
  }, [state.deck, state.avatar, state.screen.type]);

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

  // `?goto=<scene>`: hold a loading screen — rather than the Avatar
  // selection screen — until `bootstrapQaScene` has folded into the game, so QA
  // lands directly on the requested scene (e.g. the Dream Atlas). Scenes
  // whose destination *is* the Avatar selection screen (`landsOnJourneyStart`)
  // are exempt: their state keeps `avatar` null, so this gate — which waits
  // for an Avatar to be selected — would otherwise spin forever.
  const gotoSceneName = runtimeConfig.gotoScene ?? null;
  const gotoScene = gotoSceneName === null ? null : findQaScene(gotoSceneName);
  if (
    gotoScene !== null &&
    gotoScene.landsOnJourneyStart !== true &&
    state.avatar === null
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
            poolVariant={resolvedPoolVariant}
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
            tides4Provenance={tides4Provenance}
            isOpen={cardSourceOverlayOpen}
            onClose={handleCloseCardSourceOverlay}
          />
        </ErrorBoundary>
      </ErrorBoundary>
    </div>
  );
}

export default function App({
  runtimeConfig,
  frontDoorEntry,
  resumeRecentGame = false,
  directTutorialBattle = false,
  previewTutorialVictory = false,
}: {
  runtimeConfig: RuntimeConfig;
  frontDoorEntry?: FrontDoorEntry;
  /** Without `?game=`, resume the most recent game (the front door). */
  resumeRecentGame?: boolean;
  directTutorialBattle?: boolean;
  previewTutorialVictory?: boolean;
}) {
  const [journeyContent, setJourneyContent] = useState<JourneyContent | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

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
    try {
      const content = loadJourneyContent();
      // Register the reducer content providers from the loaded content BEFORE
      // any game folds an event. Until this runs, every provider-backed event
      // (START_JOURNEY, SELECT_AVATAR, ADD_CARD, ADD_DREAMSIGN, content-coupled
      // OPEN_SITE / REROLL_SHOP / BEGIN_BATTLE) bounces. Registering here —
      // before `setJourneyContent` unblocks the render that opens the local
      // game — guarantees the ordering.
      registerGameProviders(content);
      setJourneyContent(content);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to load journey content.",
      );
    }
  }, []);

  if (loadError !== null) {
    return (
      <ApplicationStateScreen
        view={{
          kind: "recoverableError",
          title: "Journey Content Failed to Load",
          message: "The journey content could not be prepared.",
          detail: "Reload the app to try preparing Journey content again.",
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

  return (
    <LocalGameApp
      journeyContent={journeyContent}
      runtimeConfig={runtimeConfig}
      frontDoorEntry={frontDoorEntry}
      resumeRecentGame={resumeRecentGame}
      directTutorialBattle={directTutorialBattle}
      previewTutorialVictory={previewTutorialVictory}
    />
  );
}

/** Opens the `?game=` local game (or resumes or creates one) and renders it. */
function LocalGameApp({
  journeyContent,
  runtimeConfig,
  frontDoorEntry,
  resumeRecentGame,
  directTutorialBattle,
  previewTutorialVictory,
}: {
  journeyContent: JourneyContent;
  runtimeConfig: RuntimeConfig;
  frontDoorEntry?: FrontDoorEntry;
  resumeRecentGame: boolean;
  directTutorialBattle: boolean;
  previewTutorialVictory: boolean;
}) {
  const contentConfig = useMemo(
    () =>
      contentConfigFromRuntime(
        journeyContent.atlasData.foldHash,
        journeyContent.sitesData.foldHash,
        journeyContent.draftData,
        journeyContent.economyData,
        journeyContent.gambleData,
        journeyContent.transfigurationData,
        journeyContent.opponentsData,
        journeyContent.rewardSelectionData,
        journeyContent.auguryData,
        journeyContent.exploration.foldHash,
        journeyContent.tutorial.foldHash,
      ),
    [journeyContent],
  );
  const { status, createNewGame } = useLocalGame({
    gameId: runtimeConfig.gameId,
    resumeRecent: resumeRecentGame,
    contentConfig,
    frontDoorEntry,
    seedOverride: runtimeConfig.seedOverride,
  });
  const createNewGameAction = {
    id: "primary",
    label: "Create New Game",
    onPress: createNewGame,
  } as const;

  switch (status.kind) {
    case "opening":
    case "creating":
      return (
        <ApplicationStateScreen
          view={{
            kind: "loading",
            title: status.kind === "creating" ? "Creating Game" : "Loading Game",
            message: "Preparing the dream.",
            busyLabel:
              status.kind === "creating" ? "Creating Game" : "Loading Game",
          }}
        />
      );
    case "notFound":
      return (
        <ApplicationStateScreen
          view={{
            kind: "unavailableGame",
            title: "Game Not Found",
            message: `No game ${status.gameId} is saved in this browser.`,
            actions: [createNewGameAction],
          }}
        />
      );
    case "openElsewhere":
      return (
        <ApplicationStateScreen
          view={{
            kind: "unavailableGame",
            title: "Game Open in Another Tab",
            message:
              "This game is already open in another tab. Close that tab, then try again here.",
            actions: [
              {
                id: "primary",
                label: "Try Again",
                onPress: () => window.location.reload(),
              },
              { ...createNewGameAction, id: "secondary" },
            ],
          }}
        />
      );
    case "unreadable":
      return (
        <ApplicationStateScreen
          view={{
            kind: "unreadableGame",
            title: "This Game Could Not Be Read",
            message:
              "This game’s data cannot be loaded safely. Start a fresh game to keep playing.",
            actions: [createNewGameAction],
          }}
        />
      );
    case "versionGate":
      return (
        <ApplicationStateScreen
          view={{
            kind: "versionGate",
            title: "A New Version Was Released",
            message:
              "This game was started on an earlier version. Start a fresh game on the current version.",
            actions: [createNewGameAction],
          }}
        />
      );
    case "configGate":
      return (
        <ConfigGateScreen
          gameContentConfig={status.gameContentConfig}
          localContentConfig={contentConfig}
          onStartNewGame={createNewGame}
        />
      );
    case "error":
      return (
        <ApplicationStateScreen
          view={{
            kind: "recoverableError",
            title: "Something Went Wrong",
            message: "The game could not be opened.",
            detail: status.message,
            actions: [{ ...createNewGameAction, label: "Try Again" }],
          }}
        />
      );
    case "ready":
      return (
        <LocalGameProvider
          game={status.game}
          controls={status.controls}
          claimUnownedBattle={directTutorialBattle}
        >
          <GameJourneyProvider journeyContent={journeyContent}>
            <FrontDoorProvider>
              <FrontDoorRouter
                avatars={journeyContent.avatars}
                tutorialPlaybackSpeed={runtimeConfig.tutorialPlaybackSpeed ?? 1}
                directTutorialBattle={directTutorialBattle}
                previewTutorialVictory={previewTutorialVictory}
                journey={
                  <JourneyApp
                    cardDatabase={journeyContent.cardDatabase}
                    runtimeConfig={runtimeConfig}
                  />
                }
              />
            </FrontDoorProvider>
          </GameJourneyProvider>
        </LocalGameProvider>
      );
  }
}
