import { localizedSourceText } from "../../runtime/localization/runtime";
// Pure view-model builder for the desktop deck viewer. Resolves the deck to the
// cards the player actually holds (reusing the shared mobile resolution so both
// viewers show a card identically), and pairs them with the run profile the
// desktop sidebar shows: the DreamAvatar and the collected dreamsigns. No React,
// no state hooks — the adapter acquires live state and calls this; this module
// maps domain data to the screen's view types and nothing else. The run's
// stable avatar UUID and seed resolve the same selected tide preview shown at
// journey start.

import type { CardData } from "../../types/cards";
import type { DreamAvatarContent } from "../../types/content";
import type { RunPoolContext } from "../../data/journey-content";
import type { DeckEntry, DreamAvatar, Dreamsign } from "../../types/journey";
import type {
  DeckDreamAvatarView,
  DesktopDeckView,
} from "../../cumulus/screens/DesktopDeckViewer";
import { buildMobileDeckView } from "./mobile-deck-view-model";
import { buildDreamAvatarTideViews } from "./journey-start-view-model";
import type { TransfigurationData } from "../../types/transfiguration-data";
import { localizedDreamsign } from "../../cumulus/components/hud/localized-dreamsign";

/** Map the run's DreamAvatar to the sidebar view (portrait visual + rules text). */
function toDreamAvatarView(
  dreamAvatar: DreamAvatar | null,
): DeckDreamAvatarView | null {
  if (dreamAvatar === null) return null;
  return {
    id: dreamAvatar.id,
    imageNumber: dreamAvatar.imageNumber,
    name: localizedSourceText(dreamAvatar.name),
    title: localizedSourceText(dreamAvatar.title),
    renderedText: localizedSourceText(dreamAvatar.renderedText),
  };
}

/**
 * The full desktop deck view: every resolvable deck entry in acquisition order,
 * plus the run's DreamAvatar and collected dreamsigns for the sidebar.
 * Deterministic in its arguments.
 */
export function buildDesktopDeckView(
  transfigurationData: TransfigurationData,
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
  dreamAvatar: DreamAvatar | null,
  dreamsigns: readonly Dreamsign[],
  dreamAvatars: readonly DreamAvatarContent[] = [],
  poolContext?: RunPoolContext,
  journeySeed = "",
): DesktopDeckView {
  const dreamAvatarContent =
    dreamAvatar === null
      ? undefined
      : dreamAvatars.find((candidate) => candidate.id === dreamAvatar.id);
  return {
    cards: buildMobileDeckView(transfigurationData, deck, cardDatabase).cards,
    dreamAvatar: toDreamAvatarView(dreamAvatar),
    dreamsigns: dreamsigns.map((dreamsign) =>
      localizedDreamsign(dreamsign, "Desktop deck viewer"),
    ),
    tides:
      dreamAvatarContent === undefined
        ? []
        : buildDreamAvatarTideViews(
            poolContext,
            dreamAvatarContent,
            journeySeed,
          ),
  };
}
