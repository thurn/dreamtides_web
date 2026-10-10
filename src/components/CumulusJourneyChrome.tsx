// App-owned chrome for registered Cumulus product screens. Screen authors
// render only their scene/content; the router decides which persistent chrome
// belongs around each route.

import { useRef, type ReactNode } from "react";
import { DreamscapeJourneyMenu } from "./DreamscapeJourneyMenu";
import type { JourneyUtilityMenuAction } from "./JourneyUtilityMenuController";
import {
  ErrorBoundary,
  type ErrorBoundaryFallbackProps,
} from "./ErrorBoundary";
import { DefaultErrorBoundaryFallback } from "./ErrorBoundaryFallback";
import { useJourney } from "../state/journey-context";
import { JourneyStatusBar } from "../cumulus/components/hud/JourneyStatusBar";
import { token } from "../cumulus/primitives/tokens";
import { useIsDesktop } from "../cumulus/primitives/use-is-desktop";
import { menuTriggerClearance } from "../cumulus/primitives/chrome-geometry";
import type { JourneyMutationSource } from "../state/journey-context";
import { buildDreamscapeHudView } from "../screens/cumulus_adapters/dreamscape-view-model";
import { JourneyCardTutorialController } from "./JourneyCardTutorialController";

const NOOP = (): void => undefined;

/**
 * The top offset that drops a mobile chrome error fallback below the journey
 * menu's hamburger trigger. The trigger sits in the top-start corner at
 * `top: max(safe-inset-top, edgeInset)` with height MENU_BUTTON_PX on the same
 * app-chrome layer, so a panel above its bottom edge would sit under it. The
 * desktop trigger sits in the top-end corner, clear of the centred panel.
 */
const MOBILE_CHROME_FALLBACK_TOP = menuTriggerClearance({ isDesktop: false });

/**
 * The error fallback shared by every chrome boundary (card-tutorial guidance,
 * status bar, journey menu). The default panel keeps its in-flow placement at
 * the top of the chrome; the wrapper raises it onto the app-chrome layer so
 * the routed screen's positioned scene art cannot cover it or swallow its
 * clicks, and on mobile shifts it below the menu trigger so no text sits
 * under the trigger.
 */
function renderChromeErrorFallback({
  scope,
  reset,
}: ErrorBoundaryFallbackProps): ReactNode {
  return <ChromeErrorFallbackLayer scope={scope} onRetry={reset} />;
}

function ChromeErrorFallbackLayer({
  scope,
  onRetry,
}: {
  readonly scope: string;
  readonly onRetry: () => void;
}): ReactNode {
  const isDesktop = useIsDesktop();
  return (
    <div
      data-journey-chrome-error-layer={scope}
      style={{
        position: "relative",
        zIndex: token("--layer-app-chrome"),
        ...(isDesktop ? {} : { top: MOBILE_CHROME_FALLBACK_TOP }),
      }}
    >
      <DefaultErrorBoundaryFallback scope={scope} onRetry={onRetry} />
    </div>
  );
}

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
        <ErrorBoundary
          scope="overlay:card-tutorial-guidance"
          fallback={renderChromeErrorFallback}
        >
          <JourneyCardTutorialController stageRef={stageRef} />
        </ErrorBoundary>
      )}
      {showStatusBar && (variant === "journey" || isDesktop) && (
        <ErrorBoundary
          scope="overlay:cumulus-status-bar"
          fallback={renderChromeErrorFallback}
        >
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
        <ErrorBoundary
          scope="overlay:cumulus-journey-menu"
          fallback={renderChromeErrorFallback}
        >
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
