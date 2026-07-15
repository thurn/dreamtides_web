// App-owned chrome for registered Cumulus product screens. Screen authors
// render only their scene/content; the router decides which persistent chrome
// belongs around each route.

import { useRef, type ReactNode } from "react";
import { DreamscapeQuestMenu } from "./DreamscapeQuestMenu";
import type { QuestUtilityMenuAction } from "./QuestUtilityMenu";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQuest } from "../state/quest-context";
import { QuestStatusBar } from "../cumulus/components/hud/QuestStatusBar";
import { useIsDesktop } from "../cumulus/screens/use-is-desktop";
import type { QuestState } from "../types/quest";
import { buildDreamscapeHudView } from "../screens/cumulus_adapters/dreamscape-view-model";

const NOOP = (): void => undefined;

export interface CumulusQuestChromeHandlers {
  onViewDeck?: () => void;
  onOpenPoolViewer?: () => void;
  onOpenDebugScreen?: () => void;
  onOpenQuestEditor?: () => void;
  hasDraftData?: boolean;
  onLoadQuestState?: (state: QuestState, source: string) => void;
  onRegenerateAtlas?: () => void;
  contextualActions?: readonly QuestUtilityMenuAction[];
  elevated?: boolean;
}

export function CumulusQuestChrome({
  children,
  handlers = {},
  showAtlasRegenerate = false,
  showStatusBar = true,
}: {
  children: ReactNode;
  handlers?: CumulusQuestChromeHandlers;
  showAtlasRegenerate?: boolean;
  showStatusBar?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { state } = useQuest();
  const hud = buildDreamscapeHudView(state);
  const isDesktop = useIsDesktop();

  return (
    <div
      ref={stageRef}
      className="cumulus"
      data-cumulus-quest-chrome=""
      style={{ position: "fixed", inset: 0, minHeight: "100dvh" }}
    >
      {children}
      {showStatusBar && (
        <ErrorBoundary scope="overlay:cumulus-status-bar">
          <QuestStatusBar
            stageRef={stageRef}
            essence={hud.essence}
            deck={hud.deck}
            onViewDeck={handlers.onViewDeck}
            dreamcaller={hud.dreamcaller}
            dreamsigns={hud.dreamsigns}
            size={isDesktop ? "grand" : "compact"}
          />
        </ErrorBoundary>
      )}
      {state.dreamcaller !== null && (
        <ErrorBoundary scope="overlay:cumulus-quest-menu">
          <DreamscapeQuestMenu
            onOpenDeckViewer={handlers.onViewDeck ?? NOOP}
            onOpenPoolViewer={handlers.onOpenPoolViewer ?? NOOP}
            onOpenDebugScreen={handlers.onOpenDebugScreen ?? NOOP}
            onOpenQuestEditor={handlers.onOpenQuestEditor ?? NOOP}
            hasDraftData={handlers.hasDraftData ?? false}
            onLoadQuestState={handlers.onLoadQuestState}
            onRegenerateAtlas={
              showAtlasRegenerate ? handlers.onRegenerateAtlas : undefined
            }
            contextualActions={handlers.contextualActions}
            elevated={handlers.elevated ?? false}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
