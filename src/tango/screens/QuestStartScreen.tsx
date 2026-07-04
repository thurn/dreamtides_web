// QuestStartScreen — the Tango rendering of Dreamcaller selection (the quest's
// opening screen), as a full-bleed mobile swipe carousel: one Dreamcaller per
// page (cinematic portrait + serif name/epithet + a frosted GroupPanel console
// holding ability text, an expandable TideCluster, starting essence, and a
// Choose action). PURE: it renders from a view-model and reports the chosen
// Dreamcaller through `onPick`; the adapter owns state, the offer, the seed, and
// startQuest.

import { useRef, useState } from "react";
import { Motes } from "../components/hud/Motes";
import { GroupPanel } from "../components/controls/GroupPanel";
import { Button } from "../components/controls/Button";
import { ResourceChip } from "../components/hud/ResourceChip";
import { RulesText } from "../components/card/RulesText";
import { CardTermDefinitions } from "../components/card/CardTermDefinitions";
import { InfoCard } from "../components/overlay/InfoCard";
import { GlowIcon } from "../components/controls/GlowIcon";
import { richText } from "../components/card/rich-text";
import {
  TideCluster,
  type TideClusterTideView,
} from "../components/hud/TideCluster";
import { Pressable } from "../primitives/Pressable";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { dreamcallerImageSrc } from "../components/hud/DreamcallerPortrait";
import { extractGlossaryTerms } from "../../data/glossary-terms";

/** One tide shown on a Dreamcaller, already resolved to display copy. It is
 * exactly the cluster's tide view, re-exported under the screen's own name so
 * the view-model builder keeps importing `DreamcallerTideView` from here. */
export type DreamcallerTideView = TideClusterTideView;

/** One signature card (kept for the shared view type; unused by the carousel). */
export interface DreamcallerSignatureCardView {
  id: string;
  name: string;
}

/** A single Dreamcaller offered on the select screen, as display data. */
export interface DreamcallerOfferView {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  renderedText: string;
  startingEssence: number;
  signatureCards: DreamcallerSignatureCardView[];
  tides: DreamcallerTideView[];
}

export interface QuestStartScreenProps {
  /** The Dreamcallers offered this run (typically three). */
  dreamcallers: DreamcallerOfferView[];
  /** Called with a Dreamcaller's id when the player commits to it. */
  onPick: (dreamcallerId: string) => void;
}

/** The full-bleed cinematic portrait for one carousel page. Screen-local: it
 * fills the page and needs no frame, unlike the shared DreamcallerPortrait. */
function FullBleedPortrait({
  dreamcaller,
}: {
  dreamcaller: DreamcallerOfferView;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--gold")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`,
          color: token("--text-primary"),
          fontWeight: 800,
          fontSize: 64,
          letterSpacing: "0.08em",
        }}
      >
        {dreamcaller.name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={dreamcallerImageSrc(dreamcaller.imageNumber)}
      alt={`${dreamcaller.name}, ${dreamcaller.title}`}
      draggable={false}
      // The portrait is the scene the console's frosted glass blurs through, so
      // it must paint as early as possible: a late-arriving portrait leaves the
      // GroupPanel's `backdrop-filter` with nothing to refract, then "pops" the
      // blur in once the art finally paints. Fetch it eagerly at high priority
      // and decode async so it lands with the first frame of the screen.
      fetchPriority="high"
      loading="eager"
      decoding="async"
      onError={() => {
        setBroken(true);
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "50% 10%",
        transform: "scale(1.5)",
        transformOrigin: "50% 0%",
        userSelect: "none",
      }}
    />
  );
}

/** The brand-tinted hairline between ability text and the tides row. */
function ConsoleDivider() {
  return (
    <div
      style={{
        height: 1,
        marginTop: token("--space-4"),
        background: `linear-gradient(90deg, transparent, ${token("--line-strong")} 18%, ${token("--line-strong")} 82%, transparent)`,
      }}
    />
  );
}

/** Ability text with a press/hover reveal of its glossary-keyword definitions.
 * When the text has no terms it renders plain, with no reveal wiring. */
function AbilityReveal({
  text,
  stageRef,
}: {
  text: string;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  const body = (
    <div
      style={{
        font: token("--t-rules"),
        color: token("--text-primary"),
        lineHeight: 1.36,
      }}
    >
      <RulesText text={text} />
    </div>
  );
  if (extractGlossaryTerms(text).length === 0) {
    return body;
  }
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      as="div"
      card={<CardTermDefinitions text={text} />}
    >
      {body}
    </InfoCard.PressInfo>
  );
}

/** The starting-essence value with a press/hover explanation. */
function EssenceReveal({
  dreamcaller,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      card={
        <InfoCard
          variant="icon"
          glyph={GLYPHS.essence}
          title="Starting Essence"
          body={richText.plain(
            "The essence this Dreamcaller begins the quest with, spent at sites this run.",
          )}
        />
      }
    >
      <span
        data-starting-essence-value={dreamcaller.id}
        style={{
          display: "inline-flex",
          alignItems: "center",
          font: token("--t-body"),
          color: token("--text-primary"),
        }}
      >
        <ResourceChip kind="essence" value={dreamcaller.startingEssence} />
      </span>
    </InfoCard.PressInfo>
  );
}

/** A circular edge chevron that pages the carousel without swiping. */
function EdgeChevron({
  dir,
  onClick,
}: {
  dir: "left" | "right";
  onClick: () => void;
}) {
  return (
    <Pressable
      as="button"
      aria-label={dir === "left" ? "Previous" : "Next"}
      onPointerDown={(event: React.PointerEvent) => {
        event.stopPropagation();
      }}
      onClick={onClick}
      style={{
        position: "absolute",
        top: "46%",
        [dir]: token("--space-3"),
        zIndex: 6,
        width: 40,
        height: 40,
        borderRadius: token("--radius-pill"),
        border: `1px solid ${token("--border-soft")}`,
        background: token("--surface-glass"),
        color: token("--text-secondary"),
        display: "grid",
        placeItems: "center",
        fontSize: 22,
        lineHeight: 1,
      }}
    >
      <GlowIcon
        iconClass={dir === "left" ? GLYPHS.chevronLeft : GLYPHS.chevronRight}
        color="text-secondary"
        size="1em"
      />
    </Pressable>
  );
}

/** One Dreamcaller page: portrait + title + console. */
function DreamcallerPage({
  dreamcaller,
  active,
  count,
  onChoose,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  active: boolean;
  count: number;
  onChoose: () => void;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div
      data-dreamcaller-page={dreamcaller.id}
      style={{
        width: `${100 / count}%`,
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FullBleedPortrait dreamcaller={dreamcaller} />
      <Motes on={active} tint="warm" zIndex={1} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: token("--safe-top"),
          left: 0,
          right: 0,
          padding: `${token("--space-10")} ${token("--gutter")} 0`,
          zIndex: 4,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            font: token("--t-title-sm"),
            color: token("--text-primary"),
            textShadow: token("--shadow-lg"),
          }}
        >
          {dreamcaller.name}, {dreamcaller.title}
        </h1>
      </div>

      {/* Console */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 4,
          padding: `0 ${token("--gutter")} calc(${token("--safe-bottom")} + ${token("--space-5")})`,
          // The console slides up into place, but its opacity is NOT animated:
          // the GroupPanel's frosted glass uses `backdrop-filter`, and an
          // ancestor at `opacity < 1` flattens this subtree into a group the
          // filter cannot sample the scene through — so a fade would leave the
          // glass washed-out until opacity reached exactly 1, then "pop" the
          // blur in. Revealing by transform alone keeps the backdrop live the
          // whole time.
          transform: active ? "translateY(0)" : "translateY(16px)",
          transition: `transform ${token("--dur-base")} ${token("--ease-out")}`,
        }}
      >
        <GroupPanel>
          <AbilityReveal text={dreamcaller.renderedText} stageRef={stageRef} />

          <ConsoleDivider />

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: token("--space-5"),
              marginTop: token("--space-3"),
            }}
          >
            {dreamcaller.tides.length > 0 ? (
              <span data-dreamcaller-tides={dreamcaller.id}>
                <TideCluster tides={dreamcaller.tides} stageRef={stageRef} />
              </span>
            ) : (
              <span />
            )}
            <EssenceReveal dreamcaller={dreamcaller} stageRef={stageRef} />
          </div>

          <div
            data-choose-dreamcaller={dreamcaller.id}
            style={{ marginTop: token("--space-6") }}
          >
            <Button
              size="lg"
              full
              label={`Choose ${dreamcaller.name}`}
              onClick={onChoose}
            />
          </div>
        </GroupPanel>
      </div>
    </div>
  );
}

/**
 * The Tango Dreamcaller-selection carousel: a full-bleed swipe carousel of the
 * offered Dreamcallers. Pure and props-driven — it renders {@link
 * QuestStartScreenProps.dreamcallers} and calls {@link
 * QuestStartScreenProps.onPick} with the chosen Dreamcaller's id.
 */
export function QuestStartScreen({ dreamcallers, onPick }: QuestStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ active: boolean; x0: number }>({ active: false, x0: 0 });
  const count = dreamcallers.length;

  const clamp = (next: number): number =>
    Math.max(0, Math.min(count - 1, next));

  const onPointerDown = (event: React.PointerEvent): void => {
    drag.current = { active: true, x0: event.clientX };
    setDx(0);
  };
  const onPointerMove = (event: React.PointerEvent): void => {
    if (drag.current.active) setDx(event.clientX - drag.current.x0);
  };
  const onPointerUp = (): void => {
    if (!drag.current.active) return;
    const threshold = 46;
    let next = index;
    if (dx < -threshold) next = clamp(index + 1);
    else if (dx > threshold) next = clamp(index - 1);
    drag.current.active = false;
    setDx(0);
    setIndex(next);
  };

  return (
    <div
      ref={stageRef}
      className="tango"
      style={{
        position: "relative",
        minHeight: "100vh",
        height: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        touchAction: "pan-y",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Screen header — does not swipe. */}
      <div
        style={{
          position: "absolute",
          top: token("--safe-top"),
          left: 0,
          right: 0,
          zIndex: 6,
          padding: `${token("--space-5")} ${token("--gutter")} 0`,
          textAlign: "center",
          pointerEvents: "none",
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--accent-bright"),
          textShadow: token("--shadow-md"),
        }}
      >
        Choose Your Dreamcaller
      </div>

      {/* Track */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          width: `${count * 100}%`,
          transform: `translateX(calc(${(-index * 100) / count}% + ${dx}px))`,
          transition: drag.current.active
            ? "none"
            : `transform ${token("--dur-slow")} ${token("--ease-out")}`,
        }}
      >
        {dreamcallers.map((dreamcaller, i) => (
          <DreamcallerPage
            key={dreamcaller.id}
            dreamcaller={dreamcaller}
            active={i === index}
            count={count}
            onChoose={() => {
              onPick(dreamcaller.id);
            }}
            stageRef={stageRef}
          />
        ))}
      </div>

      {index > 0 && (
        <EdgeChevron dir="left" onClick={() => setIndex(clamp(index - 1))} />
      )}
      {index < count - 1 && (
        <EdgeChevron dir="right" onClick={() => setIndex(clamp(index + 1))} />
      )}
    </div>
  );
}
