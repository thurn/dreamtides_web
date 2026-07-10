// GuideGallerySiteLayout — the shared responsive stage for character-led
// sites whose primary action lives in a glass gallery. Mobile stacks the guide
// band over the gallery; desktop places the guide and gallery side by side.

import { useRef, type ReactElement } from "react";
import {
  QuestStatusBar,
  QUEST_STATUS_BAR_CLEARANCE_OP,
  type QsbDreamcaller,
  type QsbDreamsign,
} from "../components/hud/QuestStatusBar";
import { Motes } from "../components/hud/Motes";
import { SpeechBubble } from "../components/overlay/SpeechBubble";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { MENU_EDGE_INSET_MOBILE_PX } from "./chrome-geometry";
import { useIsDesktop } from "./use-is-desktop";

/** The resident guide displayed by a character-led site. */
export interface GuideGalleryGuideView {
  /** Stable Dream Guide id. */
  id: string;
  /** Display name shown in the speech bubble. */
  name: string;
  /** Dialog line shown in the speech bubble. */
  line: string;
  /** Transparent character render. */
  art: ArtRef;
}

/** The persistent QuestStatusBar slice shared by guide-gallery sites. */
export interface GuideGalleryHudView {
  /** Essence total shown in the HUD. */
  essence: number;
  /** Deck size shown on the deck sprite. */
  deck: number;
  /** The active Dreamcaller bust, when one has been chosen. */
  dreamcaller?: QsbDreamcaller;
  /** The run's owned Dreamsigns. */
  dreamsigns: QsbDreamsign[];
}

export interface GuideGallerySiteLayoutProps {
  /** Stable site id exposed to QA hooks. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Resident guide art and dialog. */
  guide: GuideGalleryGuideView;
  /** Persistent bottom-HUD data. */
  hud: GuideGalleryHudView;
  /** Render the screen-specific gallery for the active layout. */
  renderGallery: (layout: "mobile" | "desktop") => ReactElement;
  /** Open the deck viewer from the QuestStatusBar deck sprite. */
  onViewDeck?: () => void;
  /** Stable test id for the screen root. */
  screenTestId?: string;
  /** Stable test id for the guide art. */
  guideArtTestId?: string;
  /** Stable test id for the mobile speech anchor. */
  speechAnchorTestId?: string;
  /** Stable test id for the speech bubble. */
  speechBubbleTestId?: string;
}

const GUIDE_TOP_ROWS = "clamp(170px, 28dvh, 240px) minmax(0, 1fr)";
const HUD_CLEARANCE = `calc(${QUEST_STATUS_BAR_CLEARANCE_OP} + ${token("--space-8")})`;
// The grand desktop HUD is taller than the root HUD token.
const DESKTOP_HUD_CLEARANCE = `calc(${HUD_CLEARANCE} + ${token("--space-9")})`;

/** Shared character, glass-gallery, and HUD composition for site screens. */
export function GuideGallerySiteLayout({
  siteId,
  scene,
  guide,
  hud,
  renderGallery,
  onViewDeck,
  screenTestId,
  guideArtTestId,
  speechAnchorTestId,
  speechBubbleTestId,
}: GuideGallerySiteLayoutProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const sceneUrl = scene !== null ? resolveArtRef(scene) : null;

  return (
    <div
      ref={stageRef}
      className="tango"
      data-testid={screenTestId}
      data-guide-gallery-site={siteId}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        display: isDesktop ? "block" : "grid",
        gridTemplateRows: isDesktop ? undefined : GUIDE_TOP_ROWS,
        overflow: "hidden",
        background: token("--bg-app"),
        boxSizing: "border-box",
        paddingBottom: isDesktop ? undefined : HUD_CLEARANCE,
      }}
    >
      {sceneUrl !== null && (
        <img
          src={sceneUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 58%",
            userSelect: "none",
          }}
        />
      )}
      <Motes on tint="warm" />

      {isDesktop ? (
        <DesktopComposition
          guide={guide}
          renderGallery={renderGallery}
          guideArtTestId={guideArtTestId}
          speechAnchorTestId={speechAnchorTestId}
          speechBubbleTestId={speechBubbleTestId}
        />
      ) : (
        <>
          <MobileGuideBand
            guide={guide}
            guideArtTestId={guideArtTestId}
            speechAnchorTestId={speechAnchorTestId}
            speechBubbleTestId={speechBubbleTestId}
          />
          {renderGallery("mobile")}
        </>
      )}

      <QuestStatusBar
        stageRef={stageRef}
        essence={hud.essence}
        deck={hud.deck}
        onViewDeck={onViewDeck}
        dreamcaller={hud.dreamcaller}
        dreamsigns={hud.dreamsigns}
        size={isDesktop ? "grand" : "compact"}
      />
    </div>
  );
}

function DesktopComposition({
  guide,
  renderGallery,
  guideArtTestId,
  speechAnchorTestId,
  speechBubbleTestId,
}: {
  readonly guide: GuideGalleryGuideView;
  readonly renderGallery: (layout: "mobile" | "desktop") => ReactElement;
  readonly guideArtTestId?: string;
  readonly speechAnchorTestId?: string;
  readonly speechBubbleTestId?: string;
}) {
  return (
    <section
      data-guide-gallery-desktop-composition=""
      style={{
        position: "absolute",
        top: `calc(${token("--space-8")} + max(var(--safe-area-inset-top), ${token("--safe-top")}))`,
        left: 0,
        right: 0,
        bottom: DESKTOP_HUD_CLEARANCE,
        display: "grid",
        placeItems: "stretch center",
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <div
        data-guide-gallery-desktop-layout=""
        style={{
          width: `calc(100% - ${token("--space-12")} - ${token("--space-12")})`,
          maxWidth: 1500,
          height: "100%",
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
          gridTemplateRows: "minmax(0, 1fr)",
          gap: token("--space-12"),
          alignItems: "center",
        }}
      >
        <DesktopGuideScene
          guide={guide}
          guideArtTestId={guideArtTestId}
          speechAnchorTestId={speechAnchorTestId}
          speechBubbleTestId={speechBubbleTestId}
        />
        {renderGallery("desktop")}
      </div>
    </section>
  );
}

function DesktopGuideScene({
  guide,
  guideArtTestId,
  speechAnchorTestId,
  speechBubbleTestId,
}: {
  readonly guide: GuideGalleryGuideView;
  readonly guideArtTestId?: string;
  readonly speechAnchorTestId?: string;
  readonly speechBubbleTestId?: string;
}) {
  const guideUrl = resolveArtRef(guide.art);
  return (
    <div
      data-guide-gallery-guide=""
      data-guide-id={guide.id}
      style={{
        position: "relative",
        width: "100%",
        height: "min(100%, 640px)",
        minHeight: 520,
        pointerEvents: "none",
      }}
    >
      <img
        src={guideUrl}
        alt={guide.name}
        draggable={false}
        data-testid={guideArtTestId}
        style={{
          position: "absolute",
          bottom: `calc(-1 * ${token("--space-8")})`,
          left: `clamp(calc(-1 * ${token("--space-12")}), -4vw, calc(-1 * ${token("--space-8")}))`,
          width: "clamp(320px, 29vw, 430px)",
          height: "min(78dvh, 720px)",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
      <div
        data-testid={speechAnchorTestId}
        style={{
          position: "absolute",
          top: "14%",
          left: `clamp(calc(${token("--space-12")} + ${token("--space-12")} + ${token("--space-11")} + ${token("--space-7")}), 18vw, calc(${token("--space-12")} + ${token("--space-12")} + ${token("--space-12")} + ${token("--space-11")} + ${token("--space-7")}))`,
          right: 0,
          maxWidth: 380,
        }}
      >
        <SpeechBubble
          speakerName={guide.name}
          text={guide.line}
          arrowSide="left"
          testId={speechBubbleTestId}
        />
      </div>
    </div>
  );
}

function MobileGuideBand({
  guide,
  guideArtTestId,
  speechAnchorTestId,
  speechBubbleTestId,
}: {
  readonly guide: GuideGalleryGuideView;
  readonly guideArtTestId?: string;
  readonly speechAnchorTestId?: string;
  readonly speechBubbleTestId?: string;
}) {
  const guideUrl = resolveArtRef(guide.art);
  return (
    <header
      data-guide-gallery-guide=""
      data-guide-id={guide.id}
      style={{
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <img
        src={guideUrl}
        alt={guide.name}
        draggable={false}
        data-testid={guideArtTestId}
        style={{
          position: "absolute",
          left: `max(var(--safe-area-inset-left), ${String(MENU_EDGE_INSET_MOBILE_PX)}px)`,
          bottom: `calc(-1 * ${token("--space-8")})`,
          width: "58vw",
          height: "100%",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
      <div
        data-testid={speechAnchorTestId}
        style={{
          position: "absolute",
          left: "40vw",
          right: `calc(${token("--gutter")} + ${token("--space-11")})`,
          top: token("--space-2"),
        }}
      >
        <SpeechBubble
          speakerName={guide.name}
          text={guide.line}
          arrowSide="left"
          testId={speechBubbleTestId}
        />
      </div>
    </header>
  );
}
