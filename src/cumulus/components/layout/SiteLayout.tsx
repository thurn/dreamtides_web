import { useEffect, useState, type ReactElement } from "react";
import type { LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../hud/JourneyStatusBar";
import { Motes } from "../hud/Motes";
import { SpeechBubble } from "../overlay/SpeechBubble";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { token } from "../../primitives/tokens";
import { useTutorialAnchor } from "../overlay/tutorial-placement";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { SiteId } from "../../../types/identifiers";

/**
 * Responsive recipes for the routed site family.
 *
 * `balanced-gallery` gives the guide and content equal desktop prominence and
 * starts content below the compact guide on narrow screens.
 * `content-led-gallery` narrows the guide and gives the content more desktop
 * width while retaining the standard narrow stacking.
 * `balanced-revelation` and `content-led-revelation` use the corresponding
 * desktop balance with the tall, left-cropped narrow guide treatment.
 * The expanded Revelation recipes move narrow content upward for taller bodies.
 */
export const SITE_LAYOUT_COMPOSITIONS = {
  "balanced-gallery": {
    contentLed: false,
    revelation: false,
    expanded: false,
  },
  "content-led-gallery": {
    contentLed: true,
    revelation: false,
    expanded: false,
  },
  "balanced-revelation": {
    contentLed: false,
    revelation: true,
    expanded: false,
  },
  "content-led-revelation": {
    contentLed: true,
    revelation: true,
    expanded: false,
  },
  "balanced-expanded-revelation": {
    contentLed: false,
    revelation: true,
    expanded: true,
  },
  "content-led-expanded-revelation": {
    contentLed: true,
    revelation: true,
    expanded: true,
  },
} as const;

export type SiteLayoutComposition = keyof typeof SITE_LAYOUT_COMPOSITIONS;

/** Resolved Dream Guide content shared by every guide-bearing site view. */
export interface SiteLayoutGuideView {
  /** Stable Dream Guide identity. */
  readonly id: string;
  /** Localized guide name used by visible and accessible presentation. */
  readonly name: LocalizedString;
  /** Localized line spoken by the guide when present. */
  readonly line: LocalizedString;
  /** Transparent resident-guide artwork. */
  readonly art: ArtRef;
}

/** The resolved resident guide displayed by one SiteLayout composition. */
export interface SiteLayoutGuide extends SiteLayoutGuideView {
  /** Whether the guide speaks or appears as a portrait without dialogue. */
  readonly presence: "speaking" | "portrait-only";
}

export interface SiteLayoutProps {
  /** Stable site identity exposed for diagnostics. */
  readonly siteId: SiteId;
  /** Resolved scene art, or null for the canonical atmospheric fallback. */
  readonly scene: ArtRef | null;
  /** Named tint for the routed site's deterministic Motes layer. */
  readonly moteTint: "warm" | "violet";
  /** Resolved resident-guide presentation. */
  readonly guide: SiteLayoutGuide;
  /** Named recipe that owns desktop, intermediate, and narrow composition. */
  readonly composition: SiteLayoutComposition;
  /** The one screen-specific site body mounted in the layout's content region. */
  readonly children: ReactElement;
}

const COMPACT_DESKTOP_QUERY = "(max-width: 1200px)";
const DESKTOP_HUD_CLEARANCE = `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-3xl")})`;

function useMedia(queryText: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(queryText).matches,
  );
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const query = window.matchMedia(queryText);
    const onChange = (): void => setMatches(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [queryText]);
  return matches;
}

/** The full-viewport stage shared by routed character-led sites. */
export function SiteLayout({
  siteId,
  scene,
  moteTint,
  guide,
  composition,
  children,
}: SiteLayoutProps): ReactElement {
  const resolve = useLocalizer();
  const desktop = useIsDesktop();
  const compactDesktop = useMedia(COMPACT_DESKTOP_QUERY);
  const sceneUrl = scene === null ? null : resolveArtRef(scene);
  const guideUrl = resolveArtRef(guide.art);
  const recipe = SITE_LAYOUT_COMPOSITIONS[composition];
  const isRevelation = recipe.revelation;
  const isContentLed = recipe.contentLed;
  const isExpanded = recipe.expanded;
  const contentAnchorRef = useTutorialAnchor("site-content");

  return (
    <div
      className="cumulus"
      data-site-layout=""
      data-site-id={siteId}
      data-site-layout-composition={composition}
      data-site-layout-guide-presence={guide.presence}
      data-site-layout-mote-tint={moteTint}
      data-site-layout-viewport={desktop ? "desktop" : "narrow"}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        boxSizing: "border-box",
      }}
    >
      {sceneUrl === null ? (
        <div
          data-site-layout-fallback-scene=""
          style={{
            position: "absolute",
            inset: 0,
            background: token("--bg-app"),
          }}
        />
      ) : (
        <img
          data-site-layout-scene=""
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
      <Motes on tint={moteTint} />

      <section
        data-site-layout-stage=""
        style={{
          position: "absolute",
          top: desktop
            ? `calc(${token("--space-2xl")} + max(var(--safe-area-inset-top), ${token("--safe-top")}))`
            : `max(var(--safe-area-inset-top), ${token("--safe-top")})`,
          left: 0,
          right: 0,
          bottom: desktop
            ? DESKTOP_HUD_CLEARANCE
            : JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        <div
          data-site-layout-guide=""
          data-guide-id={guide.id}
          style={{
            position: "absolute",
            left: desktop
              ? `max(${token("--space-2xl")}, calc((100vw - 1500px) / 2))`
              : isRevelation
                ? `calc(-1 * (${token("--space-6xl")} + ${token("--space-s")}))`
                : 0,
            top: desktop ? 0 : isRevelation ? token("--space-s") : 0,
            bottom: desktop ? 0 : undefined,
            width: desktop
              ? isContentLed
                ? "min(38vw, 560px)"
                : "min(48vw, 700px)"
              : isRevelation
                ? "62vw"
                : "46vw",
            height: desktop ? "100%" : isRevelation ? "70dvh" : "34dvh",
          }}
        >
          <img
            src={guideUrl}
            alt={resolve(guide.name)}
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: desktop || !isRevelation ? "50% 100%" : "50% 0%",
              userSelect: "none",
            }}
          />
          {guide.presence === "speaking" && (
            <div
              data-site-layout-speech-anchor=""
              style={{
                position: "absolute",
                top: desktop
                  ? isContentLed && compactDesktop
                    ? 0
                    : "14%"
                  : token("--space-m"),
                left: desktop
                  ? isContentLed && compactDesktop
                    ? "42%"
                    : isContentLed
                      ? "44%"
                      : "43%"
                  : isRevelation
                    ? "55%"
                    : "86%",
                width: desktop
                  ? isContentLed
                    ? "min(28vw, 380px)"
                    : "min(22vw, 320px)"
                  : "min(58vw, 380px)",
              }}
            >
              <SpeechBubble speakerName={guide.name} text={guide.line} />
            </div>
          )}
        </div>

        <main
          ref={contentAnchorRef}
          data-site-layout-content-region=""
          style={{
            position: "absolute",
            top: desktop
              ? 0
              : isRevelation
                ? isExpanded
                  ? "36dvh"
                  : "44dvh"
                : "34dvh",
            right: desktop
              ? `max(${token("--space-2xl")}, calc((100vw - 1500px) / 2))`
              : 0,
            bottom: 0,
            left: desktop ? (isContentLed ? "max(18vw, 260px)" : "46vw") : 0,
            display: "grid",
            placeItems: "stretch center",
            minWidth: 0,
            minHeight: 0,
            pointerEvents: "none",
          }}
        >
          {children}
        </main>
      </section>
    </div>
  );
}
