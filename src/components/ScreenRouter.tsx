import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { logEvent } from "../logging";
import type { RuntimeConfig } from "../runtime/runtime-config";
import {
  screenFor,
  siteDispositionFor,
} from "../screens/cumulus_adapters/registry";
import { useJourney } from "../state/journey-context";
import type { Screen } from "../types/journey";
import { BattleSiteRoute } from "./BattleSiteRoute";
import {
  CumulusJourneyChrome,
  type CumulusJourneyChromeHandlers,
} from "./CumulusJourneyChrome";
import { useAuguryJourneyMenuActions } from "./AuguryJourneyMenu";
import { ErrorBoundary } from "./ErrorBoundary";

function screenKey(screen: Screen): string {
  return screen.type === "site"
    ? `screen-site-${screen.siteId}`
    : `screen-${screen.type}`;
}

/** Renders every gameplay route through its exhaustive Cumulus disposition. */
export function ScreenRouter({
  runtimeConfig,
  cumulusChromeHandlers,
}: {
  runtimeConfig: RuntimeConfig;
  cumulusChromeHandlers?: CumulusJourneyChromeHandlers;
}) {
  const { state } = useJourney();
  const { screen } = state;
  const siteId = screen.type === "site" ? screen.siteId : null;
  const lastLoggedNavigationRef = useRef<string | null>(null);

  useEffect(() => {
    const signature = `${screen.type}|${siteId ?? ""}`;
    if (lastLoggedNavigationRef.current === signature) return;
    lastLoggedNavigationRef.current = signature;
    logEvent("screen_rendered", { screenType: screen.type, siteId });
  }, [screen.type, siteId]);

  const content =
    screen.type === "site" ? (
      <SiteRoute
        siteId={screen.siteId}
        runtimeConfig={runtimeConfig}
        cumulusChromeHandlers={cumulusChromeHandlers}
      />
    ) : screen.type === "journeyStart" ? (
      screenFor(screen)
    ) : (
      <CumulusJourneyChrome
        handlers={cumulusChromeHandlers}
        showAtlasRegenerate={screen.type === "atlas"}
        showStatusBar={
          screen.type !== "journeyComplete" && screen.type !== "journeyFailed"
        }
      >
        {screenFor(screen)}
      </CumulusJourneyChrome>
    );

  return (
    <AnimatePresence mode="sync">
      <JourneyScreenFrame
        key={screenKey(screen)}
        screenType={screen.type}
      >
        <ErrorBoundary
          scope={`screen:${screen.type}`}
          resetKey={screenKey(screen)}
        >
          {content}
        </ErrorBoundary>
      </JourneyScreenFrame>
    </AnimatePresence>
  );
}

/**
 * Owns the route-presence boundary so a retained exiting screen cannot keep
 * receiving input. `pointer-events: none` on an ancestor is insufficient when
 * a fixed descendant explicitly restores `pointer-events: auto`; the native
 * `inert` attribute disables the whole subtree while its fade finishes.
 */
function JourneyScreenFrame({
  screenType,
  children,
}: {
  screenType: Screen["type"];
  children: ReactNode;
}) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      data-journey-screen={screenType}
      data-journey-screen-presence={isPresent ? "present" : "exiting"}
      inert={isPresent ? undefined : true}
      aria-hidden={isPresent ? undefined : true}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: "none" }}
      transition={{ duration: 0.35 }}
      style={isPresent ? undefined : { pointerEvents: "none" }}
    >
      {children}
    </motion.div>
  );
}

function SiteRoute({
  siteId,
  runtimeConfig,
  cumulusChromeHandlers,
}: {
  siteId: string;
  runtimeConfig: RuntimeConfig;
  cumulusChromeHandlers?: CumulusJourneyChromeHandlers;
}) {
  const { state, cardDatabase } = useJourney();
  const activeNode =
    state.currentDreamscape === null
      ? undefined
      : state.atlas.nodes[state.currentDreamscape];
  const node = activeNode?.sites.some((candidate) => candidate.id === siteId)
    ? activeNode
    : Object.values(state.atlas.nodes).find((candidate) =>
      candidate.sites.some((site) => site.id === siteId)
    );
  const site = node?.sites.find((candidate) => candidate.id === siteId);
  const auguryMenuActions = useAuguryJourneyMenuActions(site, node);

  if (site === undefined) {
    throw new Error(
      `Gameplay site ${siteId} is not present in the journey atlas.`,
    );
  }

  const disposition = siteDispositionFor(site);
  if (disposition.kind === "inline") {
    throw new Error(
      `${site.type} site ${site.id} is resolved inline from the Dreamscape.`,
    );
  }
  if (disposition.kind === "battle") {
    return (
      <BattleSiteRoute
        site={site}
        cardDatabase={cardDatabase}
        runtimeConfig={runtimeConfig}
        cumulusChromeHandlers={cumulusChromeHandlers}
      />
    );
  }

  const handlers =
    auguryMenuActions.length === 0
      ? cumulusChromeHandlers
      : {
          ...cumulusChromeHandlers,
          contextualActions: [
            ...(cumulusChromeHandlers?.contextualActions ?? []),
            ...auguryMenuActions,
          ],
        };

  return (
    <CumulusJourneyChrome handlers={handlers}>
      {disposition.screen}
    </CumulusJourneyChrome>
  );
}
