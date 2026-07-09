// DreamsignRevelationScreen — the Tango rendering of Sigrun's dreamsign-offer
// site. The scene stays full-bleed, the guide and her speech occupy the left
// side on desktop, the dreamsign choices sit opposite, and the persistent
// QuestStatusBar remains the bottom HUD.

import { useRef, type RefObject } from "react";
import { motion } from "framer-motion";
import { requireDreamsignId } from "../../data/dreamsigns";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { Button } from "../components/controls/Button";
import { GlassButton } from "../components/controls/GlassButton";
import { Dreamsign } from "../components/hud/Dreamsign";
import { Motes } from "../components/hud/Motes";
import {
  QuestStatusBar,
  type QsbDreamcaller,
  type QsbDreamsign,
} from "../components/hud/QuestStatusBar";
import { SpeechBubble } from "../components/overlay/SpeechBubble";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";
import { QUEST_STATUS_BAR_CLEARANCE_OP } from "./chrome-geometry";

/** The guide who speaks over the Revelation offer. */
export interface DreamsignRevelationGuideView {
  /** Stable guide id, used for QA data attributes. */
  id: string;
  /** Display name shown in the speech bubble. */
  name: string;
  /** The dialog line shown in the speech bubble. */
  line: string;
  /** Transparent character render. */
  art: ArtRef;
}

/** Bottom-HUD data for the Revelation screen. */
export interface DreamsignRevelationHudView {
  /** Essence total shown in the HUD. */
  essence: number;
  /** Deck size shown on the deck sprite. */
  deck: number;
  /** Active Dreamcaller bust. */
  dreamcaller?: QsbDreamcaller;
  /** Owned dreamsigns already docked in the HUD. */
  dreamsigns: QsbDreamsign[];
}

/** Dreamsign-cap replacement state shown after claiming at the cap. */
export interface DreamsignRevelationPurgeView {
  /** The dreamsign the player is trying to claim. */
  pendingDreamsign: DreamsignData;
  /** The currently owned dreamsigns, one of which must be replaced. */
  currentDreamsigns: readonly DreamsignData[];
  /** Maximum number of dreamsigns the run may hold. */
  maxDreamsigns: number;
}

/** Everything rendered by the pure Revelation screen. */
export interface DreamsignRevelationView {
  /** The current dreamscape scene art. */
  scene: ArtRef | null;
  /** Sigrun's character art and dialog. */
  guide: DreamsignRevelationGuideView;
  /** Offered dreamsigns; empty while the pool is exhausted. */
  offer: readonly DreamsignData[];
  /** Null while loading, otherwise the offer is ready to display. */
  offerReady: boolean;
  /** Bottom HUD slice. */
  hud: DreamsignRevelationHudView;
  /** Non-null when the player must replace an existing dreamsign. */
  purge: DreamsignRevelationPurgeView | null;
}

export interface DreamsignRevelationScreenProps {
  /** The view-model to render. */
  view: DreamsignRevelationView;
  /** Claim one offered dreamsign by display index. */
  onClaim: (index: number) => void;
  /** Skip the offer and return to the dreamscape. */
  onSkip: () => void;
  /** Open the deck viewer from the QuestStatusBar deck sprite. */
  onViewDeck?: () => void;
  /** Replace an owned dreamsign while accepting the pending one. */
  onPurge: (index: number) => void;
  /** Cancel cap handling and return to the offer. */
  onCancelPurge: () => void;
  /** Index currently animating toward the QuestStatusBar. */
  claimedIndex: number | null;
}

const CONTENT_VERTICAL_OFFSET = "10dvh";
const GUIDE_LAYER_TOP = `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}) + ${CONTENT_VERTICAL_OFFSET})`;
const OFFER_TOP = `max(44dvh, calc(${token("--safe-top")} + ${token("--space-12")} + ${token("--space-12")} + ${token("--space-7")} + ${CONTENT_VERTICAL_OFFSET}))`;
const HUD_CLEARANCE = `calc(${QUEST_STATUS_BAR_CLEARANCE_OP})`;
const MOBILE_OFFER_TILE_SIZE = 120;
const DESKTOP_OFFER_TILE_SIZE = 154;
const DESKTOP_ENHANCED_OFFER_TILE_SIZE = 140;
const DESKTOP_DECLINE_GAP = token("--space-12");

/**
 * The Tango mobile Dreamsign Revelation screen. Pure and props-driven: it owns
 * presentation and animation only; the adapter owns live quest state.
 */
export function DreamsignRevelationScreen({
  view,
  onClaim,
  onSkip,
  onViewDeck,
  onPurge,
  onCancelPurge,
  claimedIndex,
}: DreamsignRevelationScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  const guideUrl = resolveArtRef(view.guide.art);
  const disabled = claimedIndex !== null || view.purge !== null;

  return (
    <div
      ref={stageRef}
      className="tango"
      data-tango-dreamsign-revelation=""
      data-testid="tango-dreamsign-revelation-screen"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: token("--bg-app"),
        touchAction: "none",
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

      <Motes on tint="violet" />

      {isDesktop ? (
        <DesktopComposition
          view={view}
          guideUrl={guideUrl}
          stageRef={stageRef}
          disabled={disabled}
          claimedIndex={claimedIndex}
          onClaim={onClaim}
          onSkip={onSkip}
        />
      ) : (
        <MobileComposition
          view={view}
          guideUrl={guideUrl}
          stageRef={stageRef}
          disabled={disabled}
          claimedIndex={claimedIndex}
          onClaim={onClaim}
          onSkip={onSkip}
        />
      )}

      <QuestStatusBar
        stageRef={stageRef}
        essence={view.hud.essence}
        deck={view.hud.deck}
        onViewDeck={onViewDeck}
        dreamcaller={view.hud.dreamcaller}
        dreamsigns={view.hud.dreamsigns}
      />

      {view.purge !== null && (
        <PurgeDialog
          purge={view.purge}
          stageRef={stageRef}
          onPurge={onPurge}
          onCancel={onCancelPurge}
        />
      )}
    </div>
  );
}

function DesktopComposition({
  view,
  guideUrl,
  stageRef,
  disabled,
  claimedIndex,
  onClaim,
  onSkip,
}: {
  readonly view: DreamsignRevelationView;
  readonly guideUrl: string;
  readonly stageRef: RefObject<HTMLElement | null>;
  readonly disabled: boolean;
  readonly claimedIndex: number | null;
  readonly onClaim: (index: number) => void;
  readonly onSkip: () => void;
}) {
  return (
    <section
      data-revelation-composition=""
      style={{
        position: "absolute",
        top: `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}) + ${token("--space-8")})`,
        left: 0,
        right: 0,
        bottom: `calc(${HUD_CLEARANCE} + ${token("--space-8")})`,
        display: "grid",
        placeItems: "stretch center",
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: `calc(100% - ${token("--space-12")} - ${token("--space-12")})`,
          maxWidth: 1320,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: token("--space-12"),
          alignItems: "center",
        }}
      >
        <GuideScene view={view} guideUrl={guideUrl} desktop />
        <OfferStack
          view={view}
          stageRef={stageRef}
          disabled={disabled}
          claimedIndex={claimedIndex}
          onClaim={onClaim}
          onSkip={onSkip}
          desktop
        />
      </div>
    </section>
  );
}

function MobileComposition({
  view,
  guideUrl,
  stageRef,
  disabled,
  claimedIndex,
  onClaim,
  onSkip,
}: {
  readonly view: DreamsignRevelationView;
  readonly guideUrl: string;
  readonly stageRef: RefObject<HTMLElement | null>;
  readonly disabled: boolean;
  readonly claimedIndex: number | null;
  readonly onClaim: (index: number) => void;
  readonly onSkip: () => void;
}) {
  return (
    <>
      <section
        style={{
          position: "absolute",
          top: GUIDE_LAYER_TOP,
          left: 0,
          right: 0,
          height: "34dvh",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <GuideScene view={view} guideUrl={guideUrl} />
      </section>

      <main
        data-revelation-mobile-offer-region=""
        style={{
          position: "absolute",
          top: OFFER_TOP,
          left: token("--space-4"),
          right: token("--space-4"),
          bottom: HUD_CLEARANCE,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 20,
        }}
      >
        <OfferStack
          view={view}
          stageRef={stageRef}
          disabled={disabled}
          claimedIndex={claimedIndex}
          onClaim={onClaim}
          onSkip={onSkip}
        />
      </main>
    </>
  );
}

function GuideScene({
  view,
  guideUrl,
  desktop = false,
}: {
  readonly view: DreamsignRevelationView;
  readonly guideUrl: string;
  readonly desktop?: boolean;
}) {
  return (
    <div
      data-revelation-guide=""
      data-guide-id={view.guide.id}
      style={{
        position: "relative",
        width: "100%",
        height: desktop ? "min(100%, 640px)" : "100%",
        minHeight: desktop ? 520 : undefined,
        pointerEvents: "none",
      }}
    >
      <img
        src={guideUrl}
        alt={view.guide.name}
        draggable={false}
        style={{
          position: "absolute",
          top: desktop ? "auto" : token("--space-4"),
          bottom: desktop ? `calc(-1 * ${token("--space-8")})` : "auto",
          left: desktop
            ? "clamp(-72px, -4vw, -24px)"
            : "calc(-1 * (var(--space-12) + var(--space-4)))",
          width: desktop ? "clamp(320px, 29vw, 430px)" : "62vw",
          height: desktop ? "min(78dvh, 720px)" : "70dvh",
          objectFit: "contain",
          objectPosition: desktop ? "50% 100%" : "50% 0%",
          userSelect: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: desktop ? "14%" : token("--space-5"),
          left: desktop ? "clamp(202px, 18vw, 276px)" : "34vw",
          right: desktop
            ? 0
            : `calc(${token("--space-5")} + ${token("--space-11")} + ${token("--space-3")})`,
          maxWidth: desktop ? 380 : undefined,
        }}
      >
        <SpeechBubble
          speakerName={view.guide.name}
          text={view.guide.line}
          arrowSide="left"
          testId="revelation-speech-bubble"
        />
      </div>
    </div>
  );
}

function OfferStack({
  view,
  stageRef,
  disabled,
  claimedIndex,
  onClaim,
  onSkip,
  desktop = false,
}: {
  readonly view: DreamsignRevelationView;
  readonly stageRef: RefObject<HTMLElement | null>;
  readonly disabled: boolean;
  readonly claimedIndex: number | null;
  readonly onClaim: (index: number) => void;
  readonly onSkip: () => void;
  readonly desktop?: boolean;
}) {
  if (!view.offerReady) {
    return <StatusLine text="Revealing Dreamsigns..." />;
  }
  if (view.offer.length === 0) {
    return <StatusLine text="The Dreamsign pool is exhausted." />;
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
          gap: desktop ? token("--space-9") : token("--space-4"),
          justifyContent: "center",
          alignItems: "start",
        }}
      >
        {view.offer.map((dreamsign, index) => (
          <RevelationOption
            key={requireDreamsignId(
              dreamsign,
              "Tango Dreamsign Revelation offer",
            )}
            dreamsign={dreamsign}
            index={index}
            stageRef={stageRef}
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
          label="Decline Offer"
          onPress={onSkip}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function StatusLine({ text }: { readonly text: string }) {
  return (
    <p
      style={{
        margin: 0,
        font: token("--t-body"),
        color: token("--text-secondary"),
        textShadow: token("--text-outline-media"),
      }}
    >
      {text}
    </p>
  );
}

function RevelationOption({
  dreamsign,
  index,
  stageRef,
  disabled,
  claimed,
  dimmed,
  tileSize,
  desktop,
  onClaim,
}: {
  readonly dreamsign: DreamsignData;
  readonly index: number;
  readonly stageRef: RefObject<HTMLElement | null>;
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
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <Dreamsign
        dreamsign={dreamsign}
        sizePx={tileSize}
        stageRef={stageRef}
        testid={`dreamsign-revelation-art-${String(index)}`}
        revealTestid={`dreamsign-revelation-info-${String(index)}`}
        onPress={() => onClaim(index)}
      />
    </motion.div>
  );
}

function PurgeDialog({
  purge,
  stageRef,
  onPurge,
  onCancel,
}: {
  readonly purge: DreamsignRevelationPurgeView;
  readonly stageRef: RefObject<HTMLElement | null>;
  readonly onPurge: (index: number) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dreamsign-revelation-purge-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        padding: token("--space-6"),
        background: token("--scrim"),
      }}
    >
      <div
        style={{
          width: "min(100%, 360px)",
          maxHeight: `calc(100dvh - ${token("--space-12")})`,
          overflow: "auto",
          boxSizing: "border-box",
          padding: token("--space-6"),
          background: token("--surface-chrome-strong"),
          border: `1px solid ${token("--border-soft")}`,
          borderRadius: token("--radius-panel"),
          boxShadow: token("--shadow-lg"),
        }}
      >
        <h2
          id="dreamsign-revelation-purge-title"
          style={{
            margin: 0,
            font: token("--t-title-sm"),
            color: token("--text-primary"),
          }}
        >
          Choose a Dreamsign to Replace
        </h2>
        <p
          style={{
            margin: `${token("--space-3")} 0 ${token("--space-6")}`,
            font: token("--t-body-sm"),
            color: token("--text-secondary"),
          }}
        >
          {`You can hold ${String(purge.maxDreamsigns)} dreamsigns.`}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: token("--space-5"),
            justifyItems: "center",
          }}
        >
          {purge.currentDreamsigns.map((dreamsign, index) => (
            <div
              key={requireDreamsignId(
                dreamsign,
                "Tango Dreamsign Revelation purge",
              )}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: token("--space-4"),
              }}
            >
              <Dreamsign
                dreamsign={dreamsign}
                sizePx={72}
                stageRef={stageRef}
                testid={`dreamsign-revelation-purge-art-${String(index)}`}
                revealTestid={`dreamsign-revelation-purge-info-${String(index)}`}
                variant="hud"
              />
              <Button
                size="sm"
                label="Replace"
                onClick={() => onPurge(index)}
              />
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: token("--space-6"),
          }}
        >
          <GlassButton label="Cancel" onPress={onCancel} />
        </div>
      </div>
    </div>
  );
}
