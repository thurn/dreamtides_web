import { sha256 } from "js-sha256";
import { guideDialogueLines } from "../../data/dreamscapes";
import { activeSiteIdOf } from "../../rules/journey/sites";
import { useJourney } from "../../state/journey-context";
import type { DreamGuideContent } from "../../types/content";
import type { GuideId, SiteId } from "../../types/identifiers";
import type { JourneySeed } from "../../types/journey-seed";

/** Everything one guide line selection is keyed by. */
export interface GuideDialogueKey {
  /** The game seed, fixed at genesis. */
  seed: JourneySeed;
  /** The site the line is spoken at, or null away from a site screen. */
  siteId: SiteId | null;
  guideId: GuideId;
  /** The authored dialogue context, e.g. `site`. */
  context: string;
  /** The template values the line is filled with. */
  values: Readonly<Record<string, string | number>>;
}

/**
 * The index of the authored line to show among `lineCount` lines: a keyed
 * uniform draw from the game seed, derived the same way as `eventRng`
 * (`src/eventlog/rng.ts`), so the same game, site, guide, context, and values
 * always select the same line on every mount, reload, and client.
 */
export function selectGuideDialogueIndex(
  key: GuideDialogueKey,
  lineCount: number,
): number {
  const digest = sha256(
    [
      key.seed,
      "guide-dialogue",
      key.siteId ?? "",
      key.guideId,
      key.context,
      JSON.stringify(Object.entries(key.values)),
    ].join("|"),
  );
  const draw = Number.parseInt(digest.slice(0, 13), 16) / 0x10000000000000;
  return Math.floor(draw * lineCount);
}

/**
 * Select one authored line for the current site, deterministically from the
 * game seed (see {@link selectGuideDialogueIndex}).
 */
export function useGuideDialogue(
  guide: DreamGuideContent,
  context: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const { state } = useJourney();
  const lines = guideDialogueLines(guide, context, values);
  return lines[
    selectGuideDialogueIndex(
      {
        seed: state.seed,
        siteId: activeSiteIdOf(state),
        guideId: guide.id,
        context,
        values,
      },
      lines.length,
    )
  ];
}
