import { useState, type ReactElement } from "react";
import { IconButton } from "../components/controls/IconButton";
import {
  MainMenuButton,
} from "../components/controls/MainMenuButton";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import type { Glyph } from "../primitives/glyph";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";
import {
  DEFAULT_MAIN_MENU_TWEAKS,
  MainMenuTweaksPanel,
  type MainMenuComposition,
  type MainMenuCrop,
  type MainMenuTweaks,
} from "./devtools/MainMenuTweaksPanel";
import "../primitives/cumulus-base.css";

export type MainMenuActionId =
  | "new-journey"
  | "dream-codex"
  | "settings"
  | "about"
  | "quit";

export type MainMenuSocialId = "github" | "discord";

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
}

interface CompositionSpec {
  readonly menuWidth: number;
  readonly titleTop: string;
  readonly edgeInline: string;
  readonly edgeBottom: string;
  readonly menuGap: string;
}

const COMPOSITIONS: Record<MainMenuComposition, CompositionSpec> = {
  cinematic: {
    menuWidth: 320,
    titleTop: token("--space-12"),
    edgeInline: token("--space-10"),
    edgeBottom: token("--space-10"),
    menuGap: token("--space-2"),
  },
  framed: {
    menuWidth: 360,
    titleTop: token("--space-10"),
    edgeInline: token("--space-12"),
    edgeBottom: token("--space-11"),
    menuGap: token("--space-3"),
  },
  restrained: {
    menuWidth: 280,
    titleTop: token("--space-9"),
    edgeInline: token("--space-8"),
    edgeBottom: token("--space-8"),
    menuGap: token("--space-1"),
  },
  airy: {
    menuWidth: 336,
    titleTop: `calc(${token("--space-12")} + ${token("--space-6")})`,
    edgeInline: token("--space-11"),
    edgeBottom: token("--space-12"),
    menuGap: token("--space-4"),
  },
};

const BACKGROUND_POSITIONS: Record<
  MainMenuCrop,
  { readonly desktop: string; readonly mobile: string }
> = {
  balanced: { desktop: "50% 50%", mobile: "54% 50%" },
  castle: { desktop: "54% 49%", mobile: "58% 51%" },
  wanderer: { desktop: "53% 57%", mobile: "61% 64%" },
  horizon: { desktop: "44% 42%", mobile: "47% 39%" },
};

/** Full-bleed Dreamtides menu presentation; route effects stay in its adapter. */
export function MainMenuScreen({
  view,
  onAction,
  onSocial,
}: MainMenuScreenProps): ReactElement {
  const isDesktop = useIsDesktop();
  const [tweaks, setTweaks] = useState<MainMenuTweaks>(
    DEFAULT_MAIN_MENU_TWEAKS,
  );
  const composition = COMPOSITIONS[tweaks.composition];
  const backgroundPosition = BACKGROUND_POSITIONS[tweaks.crop];
  const mobileEdgeInline = `max(${token(SAFE_AREA_INSET_PROPERTIES.left)}, ${token("--space-6")})`;
  const mobileEdgeBottom = `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-6")})`;

  return (
    <main
      className="cumulus"
      data-main-menu
      data-main-menu-composition={tweaks.composition}
      data-main-menu-crop={tweaks.crop}
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
          ? backgroundPosition.desktop
          : backgroundPosition.mobile,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <h1
        data-main-menu-title
        style={{
          position: "absolute",
          top: isDesktop
            ? composition.titleTop
            : `max(${token(SAFE_AREA_INSET_PROPERTIES.top)}, ${token("--space-9")})`,
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
          bottom: isDesktop ? composition.edgeBottom : mobileEdgeBottom,
          left: isDesktop ? composition.edgeInline : mobileEdgeInline,
          display: "flex",
          width: isDesktop ? composition.menuWidth : "min(58vw, 256px)",
          flexDirection: "column",
          gap: composition.menuGap,
        }}
      >
        {view.actions.map((action) => (
          <MainMenuButton
            key={action.id}
            label={action.label}
            variant={tweaks.hoverStyle}
            testId={`main-menu-action-${action.id}`}
            onPress={() => onAction(action.id)}
          />
        ))}
      </nav>

      <div
        role="group"
        aria-label="Dreamtides community"
        data-main-menu-socials
        style={{
          position: "absolute",
          right: isDesktop ? composition.edgeInline : mobileEdgeInline,
          bottom: isDesktop ? composition.edgeBottom : mobileEdgeBottom,
          display: "flex",
          gap: token("--space-4"),
        }}
      >
        {view.socials.map((social) => (
          <IconButton
            key={social.id}
            glyph={social.glyph}
            label={social.label}
            variant={
              tweaks.socialStyle === "both-accent" ||
              (tweaks.socialStyle === "github-accent" && social.id === "github")
                ? "accent"
                : "default"
            }
            testId={`main-menu-social-${social.id}`}
            onPress={() => onSocial(social.id)}
          />
        ))}
      </div>

      {import.meta.env.DEV ? (
        <MainMenuTweaksPanel values={tweaks} onChange={setTweaks} />
      ) : null}
    </main>
  );
}
