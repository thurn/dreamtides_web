// App-owned chrome for every registered Cumulus product screen. Screen authors
// render only their scene/content; the router wraps that content here so the
// QuestStatusBar and platform-appropriate quest menu cannot be forgotten.

import { useRef, type ReactNode } from "react";
import { DreamscapeQuestMenu } from "./DreamscapeQuestMenu";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQuest } from "../state/quest-context";
import { QuestStatusBar } from "../cumulus/components/hud/QuestStatusBar";
import { useIsDesktop } from "../cumulus/screens/use-is-desktop";
import type { QuestState } from "../types/quest";
import { buildDreamscapeHudView } from "../screens/cumulus_adapters/dreamscape-view-model";

const NOOP = (): void => undefined;

export interface CumulusQuestChromeHandlers {
  onViewDeck?: () => void;
  onOpenGlossary?: () => void;
  onOpenPoolViewer?: () => void;
  onOpenDebugScreen?: () => void;
  onOpenQuestEditor?: () => void;
  hasDraftData?: boolean;
  onLoadQuestState?: (state: QuestState, source: string) => void;
  onRegenerateAtlas?: () => void;
  elevated?: boolean;
}

export function CumulusQuestChrome({
  children,
  handlers = {},
  showAtlasRegenerate = false,
}: {
  children: ReactNode;
  handlers?: CumulusQuestChromeHandlers;
  showAtlasRegenerate?: boolean;
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
      {state.dreamcaller !== null && (
        <ErrorBoundary scope="overlay:cumulus-quest-menu">
          <DreamscapeQuestMenu
            onOpenDeckViewer={handlers.onViewDeck ?? NOOP}
            onOpenGlossary={handlers.onOpenGlossary ?? NOOP}
            onOpenPoolViewer={handlers.onOpenPoolViewer ?? NOOP}
            onOpenDebugScreen={handlers.onOpenDebugScreen ?? NOOP}
            onOpenQuestEditor={handlers.onOpenQuestEditor ?? NOOP}
            hasDraftData={handlers.hasDraftData ?? false}
            onLoadQuestState={handlers.onLoadQuestState}
            onRegenerateAtlas={
              showAtlasRegenerate ? handlers.onRegenerateAtlas : undefined
            }
            elevated={handlers.elevated ?? false}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
