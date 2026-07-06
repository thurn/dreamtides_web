// QuestStartScreen — the Tango rendering of Dreamcaller selection (the quest's
// opening screen). Two layouts share one view-model and switch on viewport:
//   - Mobile (narrow): a full-bleed swipe carousel, one Dreamcaller per page
//     (`quest-start-mobile`).
//   - Desktop (wide): the offered Dreamcallers side by side as standing figures
//     over locked-size console cards (`quest-start-desktop`).
// The shared view types and the ability / essence reveals both layouts render
// live in `quest-start-shared`. This module is the public entry: it re-exports
// the view types the adapter and view-model builder import, and switches layouts
// by viewport.
// PURE: it renders from a view-model and reports the chosen Dreamcaller through
// `onPick`; the adapter owns state, the offer, the seed, and startQuest.

import { DesktopSelect } from "./quest-start-desktop";
import { CarouselSelect } from "./quest-start-mobile";
import { useIsDesktop, type QuestStartScreenProps } from "./quest-start-shared";

export type {
  DreamcallerOfferView,
  DreamcallerSignatureCardView,
  DreamcallerTideView,
  QuestStartScreenProps,
} from "./quest-start-shared";

/**
 * The Tango Dreamcaller-selection screen. Pure and props-driven — it renders
 * {@link QuestStartScreenProps.dreamcallers} and calls {@link
 * QuestStartScreenProps.onPick} with the chosen Dreamcaller's id. The layout
 * follows the viewport: a swipe carousel on mobile, a side-by-side triptych of
 * standalone portraits on desktop.
 */
export function QuestStartScreen(props: QuestStartScreenProps) {
  const isDesktop = useIsDesktop();
  return (
    <div className="tango">
      {isDesktop ? <DesktopSelect {...props} /> : <CarouselSelect {...props} />}
    </div>
  );
}
