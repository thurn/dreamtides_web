import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement } from "react";
import { IconButton } from "../components/controls/IconButton";
import { MainMenuButton } from "../components/controls/MainMenuButton";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import type { Glyph } from "../primitives/glyph";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";
import "../primitives/cumulus-base.css";

export type MainMenuActionId =
  | "new-journey"
  | "dream-codex"
  | "settings"
  | "about"
  | "quit";

export type MainMenuSocialId = "github" | "discord" | "reddit";

export interface MainMenuActionView {
  readonly id: MainMenuActionId;
  readonly label: string;
}

export interface MainMenuSocialView {
  readonly id: MainMenuSocialId;
  readonly label: string;
  readonly glyph: Glyph;
}

export interface MainMenuView {
  readonly title: string;
  readonly background: ArtRef;
  readonly actions: readonly MainMenuActionView[];
  readonly socials: readonly MainMenuSocialView[];
}

export interface MainMenuScreenProps {
  readonly view: MainMenuView;
  readonly onAction: (actionId: MainMenuActionId) => void;
  readonly onSocial: (socialId: MainMenuSocialId) => void;
  readonly transitionPhase?: "visible" | "exiting";
  readonly onExitComplete?: () => void;
  /** Multiplier applied to the tutorial entry sequence's presentation timing. */
  readonly playbackSpeed?: number;
}

const TITLE_TOP = token("--space-4xl");
const EDGE_INLINE = token("--space-6xl");
const EDGE_BOTTOM = token("--space-5xl");
const MOBILE_EDGE_BOTTOM = token("--space-6xl");
const MOBILE_ACTION_OVERLAP = token("--space-l");
const BACKGROUND_POSITION = { desktop: "54% 49%", mobile: "58% 51%" } as const;
const BUTTON_BACKGROUND_WIDTH = 280;
const SCREEN_FADE_SECONDS = motionTimeSeconds("--dur-slow");

/** Full-bleed Dreamtides menu presentation; route effects stay in its adapter. */
export function MainMenuScreen({
  view,
  onAction,
  onSocial,
  transitionPhase = "visible",
  onExitComplete,
  playbackSpeed = 1,
}: MainMenuScreenProps): ReactElement {
  const isDesktop = useIsDesktop();
  const reduceMotion = useReducedMotion() === true;
  const mobileEdgeInline = `max(${token(SAFE_AREA_INSET_PROPERTIES.left)}, ${token("--space-l")})`;
  const mobileEdgeBottom = `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${MOBILE_EDGE_BOTTOM})`;

  return (
    <motion.main
      className="cumulus"
      data-main-menu
      data-main-menu-phase={transitionPhase}
      initial={false}
      animate={{ opacity: transitionPhase === "exiting" ? 0 : 1 }}
      transition={{
        duration: reduceMotion ? 0 : SCREEN_FADE_SECONDS / playbackSpeed,
      }}
      onAnimationComplete={() => {
        if (transitionPhase === "exiting") onExitComplete?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        overflow: "hidden",
        backgroundColor: token("--bg-app"),
        backgroundImage: `url("${resolveArtRef(view.background)}")`,
        backgroundPosition: isDesktop
          ? BACKGROUND_POSITION.desktop
          : BACKGROUND_POSITION.mobile,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <h1
        data-main-menu-title
        style={{
          position: "absolute",
          top: isDesktop
            ? TITLE_TOP
            : `max(${token(SAFE_AREA_INSET_PROPERTIES.top)}, ${token("--space-3xl")})`,
          left: "50%",
          width: "min(92vw, 1100px)",
          margin: 0,
          transform: "translateX(-50%)",
          color: token("--text-on-accent"),
          font: token("--t-wordmark"),
          letterSpacing: token("--tracking-wordmark"),
          textAlign: "center",
          textShadow: token("--text-outline-wordmark"),
          whiteSpace: "nowrap",
        }}
      >
        {view.title}
      </h1>

      <nav
        aria-label="Main menu"
        data-main-menu-actions
        style={{
          position: "absolute",
          bottom: isDesktop ? EDGE_BOTTOM : mobileEdgeBottom,
          left: isDesktop ? EDGE_INLINE : mobileEdgeInline,
          width: isDesktop
            ? BUTTON_BACKGROUND_WIDTH
            : `min(58vw, ${String(BUTTON_BACKGROUND_WIDTH)}px)`,
        }}
      >
        <div
          data-main-menu-action-stack
          style={{
            display: "flex",
            width: "100%",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {view.actions.map((action, index) => (
            <div
              key={action.id}
              data-main-menu-action
              style={{
                marginTop:
                  isDesktop || index === 0
                    ? 0
                    : `calc(-1 * ${MOBILE_ACTION_OVERLAP})`,
              }}
            >
              <MainMenuButton
                label={action.label}
                testId={`main-menu-action-${action.id}`}
                onPress={() => onAction(action.id)}
              />
            </div>
          ))}
        </div>
      </nav>

      <div
        role="group"
        aria-label="Dreamtides community"
        data-main-menu-socials
        style={{
          position: "absolute",
          right: isDesktop ? EDGE_INLINE : mobileEdgeInline,
          bottom: isDesktop ? EDGE_BOTTOM : mobileEdgeBottom,
          display: "flex",
          flexDirection: isDesktop ? "row" : "column",
          gap: token("--space-s"),
        }}
      >
        {view.socials.map((social) => (
          <IconButton
            key={social.id}
            glyph={social.glyph}
            label={social.label}
            testId={`main-menu-social-${social.id}`}
            onPress={() => onSocial(social.id)}
          />
        ))}
      </div>
    </motion.main>
  );
}
