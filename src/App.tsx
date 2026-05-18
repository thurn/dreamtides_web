import { useCallback, useEffect, useRef, useState } from "react";
import type { Database } from "firebase/database";
import type { CardData } from "./types/cards";
import type { QuestContent } from "./data/quest-content";
import { loadQuestContent } from "./data/quest-content";
import { getFirebaseDatabase } from "./firebase/app-config";
import { MultiplayerRoomGate } from "./multiplayer/MultiplayerRoomGate";
import { useQuest } from "./state/quest-context";
import { MultiplayerQuestProvider } from "./state/multiplayer-quest-context";
import { MultiplayerBattleProvider } from "./state/multiplayer-battle-context";
import { ScreenRouter } from "./components/ScreenRouter";
import { HUD } from "./components/HUD";
import { DeckViewer } from "./components/DeckViewer";
import { StartingDeckModal } from "./components/StartingDeckModal";
import { DebugScreen } from "./screens/DebugScreen";
import { CardSourceOverlay } from "./screens/CardSourceOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { STARTER_CARD_NUMBERS } from "./data/starter-cards";
import type { RuntimeConfig } from "./runtime/runtime-config";
import type { QuestState } from "./types/quest";

/** Inner component that renders the screen router and HUD. */
export function QuestApp({
  cardDatabase,
  runtimeConfig,
}: {
  cardDatabase: Map<number, CardData>;
  runtimeConfig: RuntimeConfig;
}) {
  const { state, mutations, questContent } = useQuest();
  // The starter-deck reveal popup is shown the first time a player picks a
  // Dreamcaller. Visibility is driven entirely by persisted quest state
  // (`dreamcaller` set + `hasSeenStartingDeckPopup` false) so a reload of the
  // same `?game=` URL does not re-open the popup. The flag round-trips
  // through `normalizeQuestState` so a fresh client joining the same room
  // also sees the correct state. The modal is a centered overlay layered on
  // top of the live dreamscape, so the HUD and screen behind remain visible
  // and interactive once dismissed.
  const showStarterDeckIntro =
    state.dreamcaller !== null && !state.hasSeenStartingDeckPopup;
  const showHud =
    state.screen.type !== "questStart"
    && !isBattleSiteHudHidden(state);
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [debugScreenOpen, setDebugScreenOpen] = useState(false);
  const [cardSourceOverlayOpen, setCardSourceOverlayOpen] = useState(false);
  const previousScreenTypeRef = useRef(state.screen.type);
  const startInBattleFiredRef = useRef(false);

  // `?startInBattle=1`: replace the freshly created room's empty quest state
  // with a battle-ready state in a single atomic write. Firing once per mount
  // is enough — the multiplayer mutation guards on `dreamcaller === null`, so
  // a reload of the same room (state already initialized) is a no-op.
  useEffect(() => {
    if (
      !runtimeConfig.startInBattle ||
      startInBattleFiredRef.current ||
      state.dreamcaller !== null
    ) {
      return;
    }

    startInBattleFiredRef.current = true;
    mutations.bootstrapStartInBattle();
  }, [runtimeConfig.startInBattle, state.dreamcaller, mutations]);

  const hasDraftData = state.resolvedPackage !== null;
  const hasCardSourceDebug = state.cardSourceDebug !== null;

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

  const handleOpenDeckViewer = useCallback(() => {
    setDeckViewerOpen(true);
  }, []);

  const handleCloseDeckViewer = useCallback(() => {
    setDeckViewerOpen(false);
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

  const handleToggleCardSourceOverlay = useCallback(() => {
    setCardSourceOverlayOpen((prev) => !prev);
  }, []);

  const handleCloseCardSourceOverlay = useCallback(() => {
    setCardSourceOverlayOpen(false);
  }, []);

  // `?startInBattle=1`: a freshly created room starts with the default
  // `questStart` state. Hold a loading screen — rather than rendering the
  // Dreamcaller selection screen — until `bootstrapStartInBattle` round-trips
  // through Firebase, so the player drops straight into the battle.
  if (runtimeConfig.startInBattle && state.dreamcaller === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <p className="text-lg opacity-80">Entering battle...</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: showHud ? "48px" : "0" }}>
      {/*
        App-shell boundary: catches anything the screen router and HUD throw
        before it reaches the React root. Without this, a render-time crash
        produces a blank #root with no fallback UI.
      */}
      <ErrorBoundary scope="app-shell">
        <ScreenRouter runtimeConfig={runtimeConfig} />
        {showHud && (
          <ErrorBoundary scope="overlay:hud">
            <HUD
              onOpenDeckViewer={handleOpenDeckViewer}
              onOpenDebugScreen={handleOpenDebugScreen}
              onToggleCardSourceOverlay={handleToggleCardSourceOverlay}
              hasDraftData={hasDraftData}
              hasCardSourceDebug={hasCardSourceDebug}
              isCardSourceOverlayOpen={cardSourceOverlayOpen}
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
          <DeckViewer
            isOpen={deckViewerOpen}
            onClose={handleCloseDeckViewer}
            cardDatabase={cardDatabase}
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:starting-deck-modal"
          onClose={handleBeginQuest}
        >
          <StartingDeckModal
            isOpen={showStarterDeckIntro}
            onClose={handleBeginQuest}
            cardDatabase={cardDatabase}
          />
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
          />
        </ErrorBoundary>
        <ErrorBoundary
          scope="overlay:card-source"
          onClose={handleCloseCardSourceOverlay}
        >
          <CardSourceOverlay
            cardSourceDebug={state.cardSourceDebug}
            isOpen={cardSourceOverlayOpen}
            onClose={handleCloseCardSourceOverlay}
          />
        </ErrorBoundary>
      </ErrorBoundary>
    </div>
  );
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

  useEffect(() => {
    loadQuestContent()
      .then((content) => {
        setQuestContent(content);
        setLoadError(null);
      })
      .catch((error) => {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load quest content.",
        );
      });
  }, []);

  useEffect(() => {
    if (questContent === null) {
      return;
    }

    try {
      setDatabase(getFirebaseDatabase());
      setFirebaseError(null);
    } catch (error) {
      setDatabase(null);
      setFirebaseError(
        error instanceof Error ? error.message : "Failed to initialize Firebase.",
      );
    }
  }, [questContent]);

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
          <p>
            Required env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
            VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID,
            VITE_FIREBASE_APP_ID.
          </p>
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

  return (
    <MultiplayerRoomGate database={database} gameId={runtimeConfig.gameId}>
      {(session) => (
        <MultiplayerQuestProvider
          database={database}
          session={session}
          questContent={questContent}
        >
          <MultiplayerBattleProvider
            database={database}
            roomId={session.roomId}
            clientId={session.clientId}
            battleState={session.room.battleState}
          >
            <QuestApp
              cardDatabase={questContent.cardDatabase}
              runtimeConfig={runtimeConfig}
            />
          </MultiplayerBattleProvider>
        </MultiplayerQuestProvider>
      )}
    </MultiplayerRoomGate>
  );
}
