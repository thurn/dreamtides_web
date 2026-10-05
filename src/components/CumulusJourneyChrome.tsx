// App-owned chrome for registered Cumulus product screens. Screen authors
// render only their scene/content; the router decides which persistent chrome
// belongs around each route.

import { useRef, type ReactNode } from "react";
import { DreamscapeJourneyMenu } from "./DreamscapeJourneyMenu";
import type { JourneyUtilityMenuAction } from "./JourneyUtilityMenuController";
import { ErrorBoundary } from "./ErrorBoundary";
import { useJourney } from "../state/journey-context";
import { JourneyStatusBar } from "../cumulus/components/hud/JourneyStatusBar";
import { useIsDesktop } from "../cumulus/primitives/use-is-desktop";
import type { JourneyMutationSource } from "../state/journey-context";
import { buildDreamscapeHudView } from "../screens/cumulus_adapters/dreamscape-view-model";
import { JourneyCardTutorialController } from "./JourneyCardTutorialController";

const NOOP = (): void => undefined;

export interface CumulusJourneyChromeHandlers {
  onViewDeck?: () => void;
  onOpenPoolViewer?: () => void;
  onOpenDebugScreen?: () => void;
  onOpenJourneyEditor?: () => void;
  onToggleCardSourceOverlay?: () => void;
  hasDraftData?: boolean;
  hasCardSourceDebug?: boolean;
  isCardSourceOverlayOpen?: boolean;
  onLoadJourneyState?: (
    state: unknown,
    source: JourneyMutationSource,
  ) => void;
  onRegenerateAtlas?: () => void;
  contextualActions?: readonly JourneyUtilityMenuAction[];
  elevated?: boolean;
}

export function CumulusJourneyChrome({
  children,
  handlers = {},
  showAtlasRegenerate = false,
  showStatusBar = true,
  variant = "journey",
}: {
  children: ReactNode;
  handlers?: CumulusJourneyChromeHandlers;
  showAtlasRegenerate?: boolean;
  showStatusBar?: boolean;
  variant?: "journey" | "battle";
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { state } = useJourney();
  const hud = buildDreamscapeHudView(state);
  const isDesktop = useIsDesktop();

  return (
    <div
      ref={stageRef}
      className="cumulus"
      data-cumulus-journey-chrome=""
      style={{ position: "fixed", inset: 0, minHeight: "100dvh" }}
    >
      {children}
      {variant === "journey" && (
        <ErrorBoundary scope="overlay:card-tutorial-guidance">
          <JourneyCardTutorialController stageRef={stageRef} />
        </ErrorBoundary>
      )}
      {showStatusBar && (variant === "journey" || isDesktop) && (
        <ErrorBoundary scope="overlay:cumulus-status-bar">
          <JourneyStatusBar
            stageRef={stageRef}
            essence={hud.essence}
            deck={hud.deck}
            onViewDeck={handlers.onViewDeck}
            avatar={hud.avatar}
            dreamsigns={hud.dreamsigns}
            size={isDesktop ? "grand" : "compact"}
            variant={variant}
          />
        </ErrorBoundary>
      )}
      {variant === "journey" && state.avatar !== null && (
        <ErrorBoundary scope="overlay:cumulus-journey-menu">
          <DreamscapeJourneyMenu
            onOpenDeckViewer={handlers.onViewDeck ?? NOOP}
            onOpenPoolViewer={handlers.onOpenPoolViewer ?? NOOP}
            onOpenDebugScreen={handlers.onOpenDebugScreen ?? NOOP}
            onOpenJourneyEditor={handlers.onOpenJourneyEditor ?? NOOP}
            onToggleCardSourceOverlay={
              handlers.onToggleCardSourceOverlay ?? NOOP
            }
            hasDraftData={handlers.hasDraftData ?? false}
            hasCardSourceDebug={handlers.hasCardSourceDebug ?? false}
            isCardSourceOverlayOpen={handlers.isCardSourceOverlayOpen ?? false}
            onLoadJourneyState={handlers.onLoadJourneyState}
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
