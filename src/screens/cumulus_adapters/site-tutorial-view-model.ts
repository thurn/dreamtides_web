import type { FirstVisitSiteTutorialView } from "../../cumulus/screens/site-tutorial-view";
import { activeFirstVisitTutorialSite } from "../../data/site-tutorial-guidance";
import type { JourneyState } from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";

/** Map one authored first-visit site tutorial to persistent Mira dialogue. */
export function buildFirstVisitSiteTutorialView(
  state: JourneyState,
  siteType: "Draft" | "DreamsignRevelation",
  configuration?: TutorialSiteConfiguration,
): FirstVisitSiteTutorialView | undefined {
  const activeSite = activeFirstVisitTutorialSite(state);
  if (
    configuration === undefined ||
    activeSite === null ||
    activeSite.siteType !== siteType
  ) {
    return undefined;
  }
  const speechBubble = configuration.speechBubble;
  return {
    id: `${state.runId ?? state.seed}:first-visit:${activeSite.siteId}:${siteType}`,
    model: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: speechBubble.text,
    },
    horizontalOffset: speechBubble.horizontalOffset,
    verticalOffset: speechBubble.verticalOffset,
    bubbleWidth: speechBubble.bubbleWidth,
  };
}
