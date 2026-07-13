// GuideGallerySiteLayout — the shared responsive stage for character-led
// sites whose primary action lives in a glass gallery. Mobile stacks the guide
// band over the gallery; desktop places the guide and gallery side by side.

import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement, ReactNode } from "react";
import {
  QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
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

export interface GuideGallerySiteLayoutProps {
  /** Stable site id exposed to QA hooks. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Resident guide art and dialog. */
  guide: GuideGalleryGuideView;
  /** Render the screen-specific gallery for the active layout. */
  renderGallery: (layout: "mobile" | "desktop") => ReactElement;
  /** Mobile guide/gallery staging. Defaults to the compact stacked band. */
  mobileComposition?: "band" | "revelation";
  /** Revelation gallery height. Expanded grows upward for dense content. */
  mobileRegionSize?: "standard" | "expanded";
  /** Stable test id for the screen root. */
  screenTestId?: string;
  /** Stable test id for the guide art. */
  guideArtTestId?: string;
  /** Stable test id for the mobile speech anchor. */
  speechAnchorTestId?: string;
  /** Stable test id for the speech bubble. */
  speechBubbleTestId?: string;
  /** Optional screen-owned overlay rendered above the shared composition. */
  children?: ReactNode;
}

const GUIDE_TOP_ROWS = "clamp(170px, 28dvh, 240px) minmax(0, 1fr)";
const REVELATION_VERTICAL_OFFSET = "10dvh";
const REVELATION_GUIDE_TOP = `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}) + ${REVELATION_VERTICAL_OFFSET})`;
const REVELATION_GALLERY_TOP = `max(44dvh, calc(${token("--safe-top")} + ${token("--space-12")} + ${token("--space-12")} + ${token("--space-7")} + ${REVELATION_VERTICAL_OFFSET}))`;
const REVELATION_GALLERY_TOP_EXPANDED = `max(36dvh, calc(${token("--safe-top")} + ${token("--space-12")} + ${token("--space-12")} + ${token("--space-7")} + ${REVELATION_VERTICAL_OFFSET}))`;
// The grand desktop HUD is taller than the root HUD token.
const DESKTOP_HUD_CLEARANCE = `calc(${QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-9")})`;

/** Shared character, glass-gallery, and HUD composition for site screens. */
export function GuideGallerySiteLayout({
  siteId,
  scene,
  guide,
  renderGallery,
  mobileComposition = "band",
  mobileRegionSize = "standard",
  screenTestId,
  guideArtTestId,
  speechAnchorTestId,
  speechBubbleTestId,
  children,
}: GuideGallerySiteLayoutProps) {
  const isDesktop = useIsDesktop();
  const revelationMobile = !isDesktop && mobileComposition === "revelation";
  const sceneUrl = scene !== null ? resolveArtRef(scene) : null;

  return (
    <div
      className="cumulus"
      data-testid={screenTestId}
      data-guide-gallery-site={siteId}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        display: isDesktop || revelationMobile ? "block" : "grid",
        gridTemplateRows: isDesktop || revelationMobile ? undefined : GUIDE_TOP_ROWS,
        overflow: "hidden",
        background: token("--bg-app"),
        boxSizing: "border-box",
        paddingBottom: isDesktop || revelationMobile
          ? undefined
          : QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
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
      ) : revelationMobile ? (
        <MobileRevelationComposition
          guide={guide}
          renderGallery={renderGallery}
          regionSize={mobileRegionSize}
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
      {children}
    </div>
  );
}

function MobileRevelationComposition({
  guide,
  renderGallery,
  regionSize,
  guideArtTestId,
  speechAnchorTestId,
  speechBubbleTestId,
}: {
  readonly guide: GuideGalleryGuideView;
  readonly renderGallery: (layout: "mobile" | "desktop") => ReactElement;
  readonly regionSize: "standard" | "expanded";
  readonly guideArtTestId?: string;
  readonly speechAnchorTestId?: string;
  readonly speechBubbleTestId?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <>
      <section
        data-guide-gallery-mobile-composition="revelation"
        style={{
          position: "absolute",
          top: REVELATION_GUIDE_TOP,
          left: 0,
          right: 0,
          height: "34dvh",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <MobileGuideBand
          guide={guide}
          revelation
          guideArtTestId={guideArtTestId}
          speechAnchorTestId={speechAnchorTestId}
          speechBubbleTestId={speechBubbleTestId}
        />
      </section>
      <motion.main
        data-guide-gallery-mobile-region="revelation"
        data-guide-gallery-mobile-region-size={regionSize}
        layout="size"
        transition={{
          layout: {
            duration: reduceMotion === true ? 0 : 0.32,
            ease: [0.22, 0.61, 0.36, 1],
          },
        }}
        style={{
          position: "absolute",
          top:
            regionSize === "expanded"
              ? REVELATION_GALLERY_TOP_EXPANDED
              : REVELATION_GALLERY_TOP,
          left: 0,
          right: 0,
          bottom: QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
          display: "grid",
          placeItems: "stretch center",
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        {renderGallery("mobile")}
      </motion.main>
    </>
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
  revelation = false,
  guideArtTestId,
  speechAnchorTestId,
  speechBubbleTestId,
}: {
  readonly guide: GuideGalleryGuideView;
  readonly revelation?: boolean;
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
        width: "100%",
        height: "100%",
        overflow: revelation ? "visible" : "hidden",
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
          top: revelation ? token("--space-4") : undefined,
          left: revelation
            ? `calc(-1 * (${token("--space-12")} + ${token("--space-4")}))`
            : `max(var(--safe-area-inset-left), ${String(MENU_EDGE_INSET_MOBILE_PX)}px)`,
          bottom: revelation ? undefined : `calc(-1 * ${token("--space-8")})`,
          width: revelation ? "62vw" : "58vw",
          height: revelation ? "70dvh" : "100%",
          objectFit: "contain",
          objectPosition: revelation ? "50% 0%" : "50% 100%",
          userSelect: "none",
        }}
      />
      <div
        data-testid={speechAnchorTestId}
        style={{
          position: "absolute",
          left: revelation ? "34vw" : "40vw",
          right: revelation
            ? `calc(${token("--space-5")} + ${token("--space-11")} + ${token("--space-3")})`
            : `calc(${token("--gutter")} + ${token("--space-11")})`,
          top: revelation ? token("--space-5") : token("--space-2"),
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
