// WorkInProgressSiteScreen — the shared Cumulus placeholder for character-led
// sites whose encounter mechanics are still being shaped.

import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";

export type WorkInProgressSiteType =
  | "TemptingOffer"
  | "Gamble";

export interface WorkInProgressSiteView {
  /** Stable site id used by the shared character-gallery layout. */
  siteId: string;
  /** Site type used by QA and adapter completion logging. */
  siteType: WorkInProgressSiteType;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Player-facing site title. */
  title: string;
  /** Whether this is the resident guide's enhanced site. */
  isEnhanced: boolean;
  /** Site-specific work-in-progress explanation. */
  message: string;
  /** Resident Dream Guide art and greeting. */
  guide: GuideGalleryGuideView;
}

export interface WorkInProgressSiteScreenProps {
  /** View-model rendered by the pure screen. */
  view: WorkInProgressSiteView;
  /** Complete the placeholder visit and return to the dreamscape. */
  onContinue: () => void;
}

// A compact information panel keeps the action side lighter than a full card
// gallery while retaining Purge's guide-left, glass-right desktop composition.
const DESKTOP_PANEL_HEIGHT = 360;
const DESKTOP_PANEL_MAX_WIDTH = 620;
const MESSAGE_MAX_WIDTH = 440;

export function WorkInProgressSiteScreen({
  view,
  onContinue,
}: WorkInProgressSiteScreenProps) {
  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="cumulus-work-in-progress-site-screen"
      guideArtTestId="cumulus-work-in-progress-guide-art"
      speechAnchorTestId="cumulus-work-in-progress-speech-anchor"
      speechBubbleTestId="cumulus-work-in-progress-speech-bubble"
      renderGallery={(layout) => (
        <section
          data-work-in-progress-panel=""
          data-work-in-progress-site-type={view.siteType}
          data-work-in-progress-layout={layout}
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: 0,
            height: layout === "desktop" ? DESKTOP_PANEL_HEIGHT : "100%",
            maxHeight: "100%",
            width:
              layout === "desktop"
                ? "100%"
                : GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
            maxWidth:
              layout === "desktop" ? DESKTOP_PANEL_MAX_WIDTH : undefined,
            boxSizing: "border-box",
            pointerEvents: "auto",
            alignSelf: layout === "desktop" ? "center" : "start",
            justifySelf: "center",
          }}
        >
          <GlassPanel
            eyebrow={
              view.isEnhanced
                ? "Enhanced Site · Work In Progress"
                : "Work In Progress"
            }
            title={view.title}
            subtitle="This encounter is still taking shape."
            headingLevel="h1"
            titleVoice="standard"
            headerSpacing="medium"
            rightAccessory={{
              kind: "glassButton",
              label: "Continue",
              variant: "accent",
              testId: "cumulus-work-in-progress-continue",
              onPress: onContinue,
            }}
            testId="cumulus-work-in-progress-panel"
          >
            <div
              style={{
                flex: "1 1 auto",
                display: "grid",
                placeItems: "center",
                padding: token("--space-9"),
              }}
            >
              <p
                data-testid="cumulus-work-in-progress-message"
                style={{
                  maxWidth: MESSAGE_MAX_WIDTH,
                  margin: 0,
                  font: token("--t-serif-body"),
                  color: token("--text-on-glass"),
                  textAlign: "center",
                }}
              >
                {view.message}
              </p>
            </div>
          </GlassPanel>
        </section>
      )}
    />
  );
}
