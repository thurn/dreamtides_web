// QuestStartScreen — the Cumulus rendering of DreamAvatar selection (the quest's
// opening screen). Two layouts share one view-model and switch on viewport:
//   - Mobile (narrow): a full-bleed swipe carousel, one DreamAvatar per page
//     (`quest-start-mobile`).
//   - Desktop (wide): the offered DreamAvatars side by side as standing figures
//     over locked-size console cards (`quest-start-desktop`).
// Shared view types and console primitives live in `quest-start-shared`; both
// layouts compose the named DreamAvatar ability source. This module is the
// public entry: it re-exports the view types the adapter and view-model builder
// import, and switches layouts by viewport.
// PURE: it renders from a view-model and reports the chosen DreamAvatar through
// `onPick`; the adapter owns state, the offer, the seed, and startQuest.

import { DesktopSelect } from "./quest-start-desktop";
import { CarouselSelect } from "./quest-start-mobile";
import { useIsDesktop, type QuestStartScreenProps } from "./quest-start-shared";

export type {
  DreamAvatarOfferView,
  DreamAvatarSignatureCardView,
  DreamAvatarTideView,
  QuestStartScreenProps,
} from "./quest-start-shared";

/**
 * The Cumulus DreamAvatar-selection screen. Pure and props-driven — it renders
 * {@link QuestStartScreenProps.dreamAvatars} and calls {@link
 * QuestStartScreenProps.onPick} with the chosen DreamAvatar's id. The layout
 * follows the viewport: a swipe carousel on mobile, a side-by-side triptych of
 * standalone portraits on desktop.
 */
export function QuestStartScreen(props: QuestStartScreenProps) {
  // Three 400px portrait columns plus their gutters need more room than the
  // general Cumulus desktop breakpoint. Mid-size desktop windows keep the
  // carousel instead of wrapping the triptych onto a second row.
  const isDesktop = useIsDesktop(1344);
  return (
    <div className="cumulus">
      {isDesktop ? <DesktopSelect {...props} /> : <CarouselSelect {...props} />}
    </div>
  );
}
