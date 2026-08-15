import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../hud/JourneyStatusBar";
import { Motes } from "../hud/Motes";
import { SpeechBubble } from "../overlay/SpeechBubble";
import { speechBubblePointerDepth } from "../overlay/speech-bubble-geometry";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { token } from "../../primitives/tokens";
import {
  SITE_CONTENT_TUTORIAL_ANCHOR_ID,
  useTutorialAnchor,
} from "../overlay/tutorial-placement";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { GuideId, SiteId } from "../../../types/identifiers";

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
  readonly id: GuideId;
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
// Desktop guide art keeps an authored silhouette instead of expanding with the
// layout region. The speech anchor is positioned against this stable figure.
const DESKTOP_GUIDE_WIDTH = "clamp(320px, 29vw, 430px)";
const DESKTOP_GUIDE_HEIGHT = "min(78dvh, 720px)";
const DESKTOP_GUIDE_LEFT = `clamp(calc(-1 * ${token("--space-6xl")}), -4vw, calc(-1 * ${token("--space-2xl")}))`;
// The balanced guide region is the 45% left column of the former 1500px
// two-column stage after its outer margins and gap. Content-led compositions
// reserve 800px for the site body and give the guide the remaining stage width.
const BALANCED_DESKTOP_GUIDE_REGION_WIDTH = `min(calc(45vw - ${token("--space-6xl")} - ${token("--space-xl")} - ${token("--space-xxs")}), 646px)`;
const CONTENT_LED_DESKTOP_GUIDE_REGION_WIDTH = `max(0px, min(calc(100vw - ${token("--space-2xl")} - ${token("--space-2xl")} - 800px), 700px))`;
const DESKTOP_GUIDE_REGION_MAX_HEIGHT = "640px";
// First-paint fallback from the authored desktop composition. Once the guide
// image is measurable, the speech pointer follows the guide's alpha-derived
// head target instead of relying on this stage-relative approximation.
const DESKTOP_DIALOG_LEFT = `clamp(calc(${token("--space-6xl")} + ${token("--space-6xl")} + ${token("--space-5xl")} + ${token("--space-xl")}), 18vw, calc(${token("--space-6xl")} + ${token("--space-6xl")} + ${token("--space-6xl")} + ${token("--space-5xl")} + ${token("--space-xl")}))`;
// At compact desktop widths, content-led panels need the dialogue in the clear
// band above the panel rather than sharing its horizontal region.
const COMPACT_DESKTOP_DIALOG_WIDTH = "190px";

const GUIDE_HEAD_TARGET_Y = 0.22;
const DEFAULT_GUIDE_HEAD_TARGET_X = 0.62;
// Right-hand silhouette edges sampled from the transparent guide sources at
// the shared head band. Stable guide identities keep the runtime geometry
// independent of localized names and dialogue length.
const GUIDE_HEAD_TARGET_X_BY_ID: Readonly<Record<string, number>> = {
  tobias_tanglefur: 0.793,
  amunet_the_tomb_keeper: 0.635,
  sigrun: 0.634,
  durgan_forgehammer: 0.62,
  deacon_holt: 0.593,
  master_takeshi: 0.595,
  aldric_the_seer: 0.608,
  maddox: 0.586,
  gravok: 0.808,
  layaway: 0.557,
};

interface GuideSpeechTargetGeometry {
  readonly containerLeft: number;
  readonly containerTop: number;
  readonly imageLeft: number;
  readonly imageTop: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly objectPositionY: "top" | "bottom";
  readonly focusX: number;
  readonly focusY: number;
}

interface GuideSpeechTarget {
  readonly x: number;
  readonly y: number;
}

/** Resolve a normalized guide-art focus into the containing stage coordinates. */
export function calculateGuideSpeechTarget({
  containerLeft,
  containerTop,
  imageLeft,
  imageTop,
  imageWidth,
  imageHeight,
  naturalWidth,
  naturalHeight,
  objectPositionY,
  focusX,
  focusY,
}: GuideSpeechTargetGeometry): GuideSpeechTarget | null {
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }
  const scale = Math.min(
    imageWidth / naturalWidth,
    imageHeight / naturalHeight,
  );
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  const renderedLeft = imageLeft + (imageWidth - renderedWidth) / 2;
  const renderedTop =
    imageTop +
    (objectPositionY === "bottom" ? imageHeight - renderedHeight : 0);
  return {
    x: renderedLeft - containerLeft + renderedWidth * focusX,
    y: renderedTop - containerTop + renderedHeight * focusY,
  };
}

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
  const contentAnchorRef = useTutorialAnchor(SITE_CONTENT_TUTORIAL_ANCHOR_ID);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const guideArtRef = useRef<HTMLImageElement | null>(null);
  const [guideSpeechTarget, setGuideSpeechTarget] =
    useState<GuideSpeechTarget | null>(null);
  const compactContentLed = desktop && isContentLed && compactDesktop;

  useLayoutEffect(() => {
    const container = guideRef.current;
    const image = guideArtRef.current;
    if (container === null || image === null) return undefined;

    const update = (): void => {
      const containerRect = container.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const target = calculateGuideSpeechTarget({
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
        imageLeft: imageRect.left,
        imageTop: imageRect.top,
        imageWidth: imageRect.width,
        imageHeight: imageRect.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectPositionY: desktop || !isRevelation ? "bottom" : "top",
        focusX:
          GUIDE_HEAD_TARGET_X_BY_ID[String(guide.id)] ??
          DEFAULT_GUIDE_HEAD_TARGET_X,
        focusY: GUIDE_HEAD_TARGET_Y,
      });
      setGuideSpeechTarget((current) => {
        if (
          target === null ||
          (current !== null &&
            Math.abs(current.x - target.x) < 0.25 &&
            Math.abs(current.y - target.y) < 0.25)
        ) {
          return current;
        }
        return target;
      });
    };

    update();
    image.addEventListener("load", update);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(image);
    return () => {
      image.removeEventListener("load", update);
      observer.disconnect();
    };
  }, [desktop, guide.id, guideUrl, isRevelation]);

  const measuredSpeechTarget = compactContentLed ? null : guideSpeechTarget;

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
          ref={guideRef}
          data-site-layout-guide=""
          data-guide-id={guide.id}
          style={{
            position: "absolute",
            left: desktop
              ? `max(${isContentLed ? token("--space-2xl") : token("--space-6xl")}, calc((100vw - 1500px) / 2))`
              : isRevelation
                ? `calc(-1 * (${token("--space-6xl")} + ${token("--space-s")}))`
                : 0,
            top: desktop ? 0 : isRevelation ? token("--space-s") : 0,
            bottom: undefined,
            width: desktop
              ? isContentLed
                ? CONTENT_LED_DESKTOP_GUIDE_REGION_WIDTH
                : BALANCED_DESKTOP_GUIDE_REGION_WIDTH
              : isRevelation
                ? "62vw"
                : "46vw",
            height: desktop ? "100%" : isRevelation ? "70dvh" : "34dvh",
            minHeight: desktop ? "520px" : undefined,
            maxHeight: desktop ? DESKTOP_GUIDE_REGION_MAX_HEIGHT : undefined,
          }}
        >
          <img
            ref={guideArtRef}
            src={guideUrl}
            alt={resolve(guide.name)}
            draggable={false}
            style={{
              position: "absolute",
              inset: desktop ? undefined : 0,
              bottom: desktop
                ? `calc(-1 * ${token("--space-2xl")})`
                : undefined,
              left: desktop ? DESKTOP_GUIDE_LEFT : undefined,
              width: desktop ? DESKTOP_GUIDE_WIDTH : "100%",
              height: desktop ? DESKTOP_GUIDE_HEIGHT : "100%",
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
                top:
                  measuredSpeechTarget !== null
                    ? `${String(measuredSpeechTarget.y)}px`
                    : desktop
                      ? compactContentLed
                        ? `calc(-1 * (${token("--space-6xl")} + ${token("--space-m")}))`
                        : "14%"
                      : token("--space-m"),
                left:
                  measuredSpeechTarget !== null
                    ? `${String(measuredSpeechTarget.x + speechBubblePointerDepth())}px`
                    : desktop
                      ? compactContentLed
                        ? `calc(-1 * ${token("--space-s")})`
                        : DESKTOP_DIALOG_LEFT
                      : isRevelation
                        ? `calc(34vw + ${token("--space-6xl")} + ${token("--space-s")})`
                        : "86%",
                right: desktop && !compactContentLed ? 0 : undefined,
                width: desktop
                  ? isContentLed && compactDesktop
                    ? COMPACT_DESKTOP_DIALOG_WIDTH
                    : undefined
                  : isRevelation
                    ? `calc(66vw - ${token("--space-m")} - ${token("--space-5xl")} - ${token("--space-xs")})`
                    : "min(58vw, 380px)",
                maxWidth: desktop
                  ? compactContentLed
                    ? COMPACT_DESKTOP_DIALOG_WIDTH
                    : "380px"
                  : undefined,
                transform:
                  measuredSpeechTarget === null
                    ? undefined
                    : "translateY(-50%)",
              }}
            >
              <SpeechBubble
                speakerName={guide.name}
                text={guide.line}
                pointerPlacement={
                  measuredSpeechTarget === null ? "left-lower" : "left-center"
                }
              />
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
