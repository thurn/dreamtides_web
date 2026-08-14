// DreamsignRevelationScreen — the Cumulus rendering of Sigrun's dreamsign-offer
// site. The scene stays full-bleed, the guide and her speech occupy the left
// side on desktop, and the dreamsign choices sit opposite. Persistent journey
// chrome is supplied by the router-owned wrapper.

import { useEffect } from "react";
import { motion } from "framer-motion";
import { requireDreamsignId } from "../../data/dreamsigns";
import type { LocalizedDreamsign } from "../components/hud/Dreamsign";
import { GlassButton } from "../components/controls/GlassButton";
import { Dreamsign } from "../components/hud/Dreamsign";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import { SiteLayout } from "../components/layout/SiteLayout";
import { type ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "../primitives/use-is-desktop";
import {
  DreamsignReplacementDialog,
  type DreamsignReplacementModel,
} from "../components/overlay/DreamsignReplacementDialog";
import type { FirstVisitSiteTutorialView } from "./site-tutorial-view";
import { useDelayedTutorialSpeechBubbleVisibility } from "./use-delayed-tutorial-speech-bubble-visibility";
import { meaning, tx, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../runtime/localization/use-localizer";

/** The guide who speaks over the Revelation offer. */
export interface DreamsignRevelationGuideView {
  /** Stable guide id, used for QA data attributes. */
  id: string;
  /** Display name shown in the speech bubble. */
  name: LocalizedString;
  /** The dialog line shown in the speech bubble. */
  line: LocalizedString;
  /** Transparent character render. */
  art: ArtRef;
}

/** Everything rendered by the pure Revelation screen. */
export interface DreamsignRevelationView {
  presentation: {
    readonly kind: "dreamsign-revelation";
    readonly loading: LocalizedString;
    readonly exhausted: LocalizedString;
  };
  /** The current dreamscape scene art. */
  scene: ArtRef | null;
  /** Sigrun's character art and dialog. */
  guide: DreamsignRevelationGuideView;
  /** Offered dreamsigns; empty while the pool is exhausted. */
  offer: readonly LocalizedDreamsign[];
  /** Null while loading, otherwise the offer is ready to display. */
  offerReady: boolean;
  /** Persistent Mira guidance throughout the first Revelation visit. */
  tutorial?: FirstVisitSiteTutorialView;
  /** Non-null when the player must replace an existing dreamsign. */
  purge: Omit<DreamsignReplacementModel, "dismissLabel" | "closeLabel"> | null;
}

export interface DreamsignRevelationScreenProps {
  /** The view-model to render. */
  view: DreamsignRevelationView;
  /** Claim one offered dreamsign by display index. */
  onClaim: (index: number) => void;
  /** Skip the offer and return to the dreamscape. */
  onSkip: () => void;
  /** Replace an owned dreamsign while accepting the pending one. */
  onPurge: (dreamsignId: string) => void;
  /** Cancel cap handling and return to the offer. */
  onCancelPurge: () => void;
  /** Index currently animating toward the JourneyStatusBar. */
  claimedIndex: number | null;
  /** Reports when delayed first-visit guidance becomes visible. */
  onTutorialShown?: (tutorial: FirstVisitSiteTutorialView) => void;
}

const MOBILE_OFFER_TILE_SIZE = 120;
const DESKTOP_OFFER_TILE_SIZE = 154;
const DESKTOP_ENHANCED_OFFER_TILE_SIZE = 140;
const DESKTOP_DECLINE_GAP = token("--space-6xl");

/**
 * The Cumulus mobile Dreamsign Revelation screen. Pure and props-driven: it owns
 * presentation and animation only; the adapter owns live journey state.
 */
export function DreamsignRevelationScreen({
  view,
  onClaim,
  onSkip,
  onPurge,
  onCancelPurge,
  claimedIndex,
  onTutorialShown,
}: DreamsignRevelationScreenProps) {
  const isDesktop = useIsDesktop();
  const disabled = claimedIndex !== null || view.purge !== null;
  const tutorialVisible = useDelayedTutorialSpeechBubbleVisibility(
    view.tutorial?.id,
    view.tutorial === undefined ? undefined : (view.tutorial.delaySeconds ?? 0),
  );
  useEffect(() => {
    if (tutorialVisible && view.tutorial !== undefined) {
      onTutorialShown?.(view.tutorial);
    }
  }, [onTutorialShown, tutorialVisible, view.tutorial]);

  return (
    <div
      data-cumulus-dreamsign-revelation=""
      data-testid="cumulus-dreamsign-revelation-screen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: view.purge === null ? undefined : 80,
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <SiteLayout
        siteId="dreamsign-revelation"
        scene={view.scene}
        atmosphere="violet"
        guide={{ ...view.guide, presence: "speaking" }}
        composition={
          view.tutorial === undefined
            ? "balanced-revelation"
            : "balanced-expanded-revelation"
        }
      >
        <div
          data-revelation-offer-region=""
          style={{
            alignSelf: "stretch",
            display: "grid",
            placeItems: "center",
            width: "100%",
            minHeight: 0,
          }}
        >
          <OfferStack
            view={view}
            disabled={disabled}
            claimedIndex={claimedIndex}
            onClaim={onClaim}
            onSkip={onSkip}
            desktop={isDesktop}
          />
        </div>
      </SiteLayout>
      {view.tutorial !== undefined && tutorialVisible && (
        <div
          data-revelation-site-tutorial=""
          style={{
            position: "absolute",
            zIndex: 30,
            top: isDesktop ? "20dvh" : "24dvh",
            left: isDesktop ? "34vw" : "34vw",
            width: isDesktop
              ? `min(calc(100vw - (${token("--space-s")} * 2)), ${String(view.tutorial.bubbleWidth)}px)`
              : `calc(66vw - ${token("--space-xs")})`,
            transform: `translate(${String(view.tutorial.horizontalOffset)}px, ${String(view.tutorial.verticalOffset)}px)`,
          }}
        >
          <CharacterDialogue
            dialogue={view.tutorial.model}
            visible
            size={isDesktop ? "wide" : "compact"}
            testId="revelation-site-tutorial-dialogue"
          />
        </div>
      )}
      {view.purge !== null && (
        <DreamsignReplacementDialog
          model={{
            ...view.purge,
            dismissLabel: tx(
              meaning("dreamsign-revelation-cancel", "Cancel"),
              "[dreamsign] Revelation cancel action.",
            ),
            closeLabel: tx(
              "Cancel replacement",
              "[dreamsign] Accessible label for closing a Dreamsign replacement dialog.",
            ),
          }}
          onDreamsignPress={onPurge}
          onDismiss={onCancelPurge}
        />
      )}
    </div>
  );
}

function OfferStack({
  view,
  disabled,
  claimedIndex,
  onClaim,
  onSkip,
  desktop = false,
}: {
  readonly view: DreamsignRevelationView;
  readonly disabled: boolean;
  readonly claimedIndex: number | null;
  readonly onClaim: (index: number) => void;
  readonly onSkip: () => void;
  readonly desktop?: boolean;
}) {
  if (!view.offerReady) {
    return <StatusLine text={view.presentation.loading} />;
  }
  if (view.offer.length === 0) {
    return <StatusLine text={view.presentation.exhausted} />;
  }

  const enhanced = view.offer.length > 3;
  const tileSize = desktop
    ? enhanced
      ? DESKTOP_ENHANCED_OFFER_TILE_SIZE
      : DESKTOP_OFFER_TILE_SIZE
    : MOBILE_OFFER_TILE_SIZE;
  const gridTemplateColumns = desktop
    ? enhanced
      ? `repeat(2, ${String(DESKTOP_ENHANCED_OFFER_TILE_SIZE)}px)`
      : `repeat(3, ${String(DESKTOP_OFFER_TILE_SIZE)}px)`
    : enhanced
      ? "repeat(2, 132px)"
      : "repeat(3, 120px)";

  return (
    <div
      data-revelation-offer=""
      style={{
        display: desktop ? "flex" : "grid",
        flexDirection: desktop ? "column" : undefined,
        gridTemplateRows: desktop ? undefined : "auto minmax(0, 1fr)",
        alignItems: "center",
        justifyItems: desktop ? undefined : "center",
        width: desktop ? undefined : "100%",
        height: desktop ? undefined : "100%",
        gap: desktop ? DESKTOP_DECLINE_GAP : 0,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns,
          gap: desktop ? token("--space-3xl") : token("--space-s"),
          justifyContent: "center",
          alignItems: "start",
        }}
      >
        {view.offer.map((dreamsign, index) => (
          <RevelationOption
            key={requireDreamsignId(
              dreamsign,
              "Cumulus Dreamsign Revelation offer",
            )}
            dreamsign={dreamsign}
            index={index}
            disabled={disabled}
            claimed={claimedIndex === index}
            dimmed={claimedIndex !== null && claimedIndex !== index}
            tileSize={tileSize}
            desktop={desktop}
            onClaim={onClaim}
          />
        ))}
      </div>
      <div
        data-revelation-decline-slot=""
        style={
          desktop
            ? undefined
            : {
                minHeight: 0,
                display: "grid",
                placeItems: "center",
              }
        }
      >
        <GlassButton
          label={tx(
            "Decline Offer",
            "[ui] Action declining the current site offer and leaving without its reward.",
          )}
          onPress={onSkip}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function StatusLine({ text }: { readonly text: LocalizedString }) {
  const resolve = useLocalizer();
  return (
    <p
      style={{
        margin: 0,
        font: token("--t-body"),
        color: token("--text-secondary"),
        textShadow: token("--text-outline-media"),
      }}
    >
      {resolve(text)}
    </p>
  );
}

function RevelationOption({
  dreamsign,
  index,
  disabled,
  claimed,
  dimmed,
  tileSize,
  desktop,
  onClaim,
}: {
  readonly dreamsign: LocalizedDreamsign;
  readonly index: number;
  readonly disabled: boolean;
  readonly claimed: boolean;
  readonly dimmed: boolean;
  readonly tileSize: number;
  readonly desktop: boolean;
  readonly onClaim: (index: number) => void;
}) {
  return (
    <motion.div
      data-revelation-option=""
      data-testid={`dreamsign-revelation-option-${String(index)}`}
      initial={{ opacity: 0, y: 24 }}
      animate={
        claimed
          ? {
              opacity: 0,
              x: desktop ? "26vw" : "36vw",
              y: desktop ? "34dvh" : "38dvh",
              scale: 0.28,
            }
          : dimmed
            ? { opacity: 0.16, y: 0, scale: 0.94 }
            : { opacity: 1, y: 0, scale: 1 }
      }
      transition={{ duration: claimed ? 0.9 : 0.32, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: tileSize,
        height: tileSize,
      }}
    >
      <Dreamsign
        dreamsign={dreamsign}
        testid={`dreamsign-revelation-art-${String(index)}`}
        onPress={() => onClaim(index)}
        unavailable={disabled}
      />
    </motion.div>
  );
}
