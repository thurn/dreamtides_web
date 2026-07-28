// JourneyStartScreen — the Cumulus rendering of DreamAvatar selection (the journey's
// opening screen). Two layouts share one view-model and switch on viewport:
//   - Mobile (narrow): a full-bleed swipe carousel, one DreamAvatar per page
//     (`journey-start-mobile`).
//   - Desktop (wide): the offered DreamAvatars side by side as standing figures
//     over locked-size console cards (`journey-start-desktop`).
// Shared view types and console primitives live in `journey-start-shared`; both
// layouts compose the named DreamAvatar ability source. This module is the
// public entry: it re-exports the view types the adapter and view-model builder
// import, and switches layouts by viewport.
// PURE: it renders from a view-model and reports the chosen DreamAvatar through
// `onPick`; the adapter owns state, the offer, the seed, and startJourney.

import { DesktopSelect } from "./journey-start-desktop";
import { CarouselSelect } from "./journey-start-mobile";
import { useIsDesktop, type JourneyStartScreenProps } from "./journey-start-shared";

export type {
  DreamAvatarOfferView,
  DreamAvatarSignatureCardView,
  DreamAvatarTideView,
  JourneyStartGuideDialogueView,
  JourneyStartScreenProps,
} from "./journey-start-shared";

/**
 * The Cumulus DreamAvatar-selection screen. Pure and props-driven — it renders
 * {@link JourneyStartScreenProps.dreamAvatars} and calls {@link
 * JourneyStartScreenProps.onPick} with the chosen DreamAvatar's id. The layout
 * follows the viewport: a swipe carousel on mobile, a side-by-side triptych of
 * standalone portraits on desktop.
 */
export function JourneyStartScreen(props: JourneyStartScreenProps) {
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
