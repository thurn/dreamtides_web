import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import { IconButton } from "../components/controls/IconButton";
import { Motes } from "../components/hud/Motes";
import { Dreamsign } from "../components/hud/Dreamsign";
import { QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP } from "../components/hud/QuestStatusBar";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { resolveArtRef } from "../primitives/art";
import type { Glyph } from "../primitives/glyph";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { useIsDesktop } from "./use-is-desktop";

export interface DreamAuguryGuideView {
  id: string;
  name: string;
  art: ArtRef;
}

export interface DreamAuguryCardView {
  id: string;
  model: GameCardModel;
}

export interface DreamAuguryCardChoiceView {
  id: string;
  card: DreamAuguryCardView;
}

export interface DreamAuguryDreamsignChoiceView {
  id: string;
  dreamsign: DreamsignData;
}

export type DreamAuguryOfferVisualView =
  | { kind: "cards"; cards: readonly DreamAuguryCardView[] }
  | {
      kind: "cardChoices";
      choices: readonly DreamAuguryCardChoiceView[];
      doubled: boolean;
    }
  | {
      kind: "beforeAfter";
      pairs: readonly {
        id: string;
        before: DreamAuguryCardView;
        after: DreamAuguryCardView;
      }[];
    }
  | { kind: "purge"; card: DreamAuguryCardView }
  | {
      kind: "purgeReplace";
      removed: DreamAuguryCardView;
      choices: readonly DreamAuguryCardChoiceView[];
    }
  | { kind: "duplicate"; card: DreamAuguryCardView }
  | {
      kind: "duplicateChoices";
      choices: readonly DreamAuguryCardChoiceView[];
    }
  | { kind: "dreamsigns"; dreamsigns: readonly DreamsignData[] }
  | {
      kind: "dreamsignChoices";
      choices: readonly DreamAuguryDreamsignChoiceView[];
    }
  | { kind: "site"; siteName: string; glyph: Glyph }
  | {
      kind: "mixed";
      cards: readonly DreamAuguryCardView[];
      dreamsigns: readonly DreamsignData[];
    };

export interface DreamAuguryOfferView {
  id: string;
  ordinal: "I" | "II";
  headline: string;
  requiresSelection: boolean;
  visual: DreamAuguryOfferVisualView;
}

export interface DreamAugurySiteView {
  siteId: string;
  scene: ArtRef | null;
  encounterSignature: string | null;
  guide: DreamAuguryGuideView;
  offers: readonly DreamAuguryOfferView[];
}

export type DreamAuguryChoiceResult =
  { ok: true } | { ok: false; message: string };

export interface DreamAugurySiteScreenProps {
  view: DreamAugurySiteView;
  onInspectOffer?: (offerId: string) => void;
  onChoose: (
    offerId: string,
    choiceId: string | null,
  ) => DreamAuguryChoiceResult;
  onClose: () => void;
}

const PREVIEW_CARD_WIDTH = 214;
const PREVIEW_DIRECT_CARD_WIDTH = 230;
const PREVIEW_TRANSITION_CARD_WIDTH = 164;
const PREVIEW_DREAMSIGN_SIZE = 240;
const DETAIL_DIRECT_CARD_WIDTH = 260;
const DETAIL_GROUP_CARD_WIDTH = 190;
const DETAIL_CHOICE_CARD_WIDTH = 190;
const DETAIL_TRANSITION_CARD_WIDTH = 190;
const DETAIL_DREAMSIGN_SIZE = 205;
const GUIDE_MAX_WIDTH = 410;
const SITE_GLYPH_SIZE = "72px";

export function DreamAugurySiteScreen({
  view,
  onInspectOffer,
  onChoose,
  onClose,
}: DreamAugurySiteScreenProps) {
  const isDesktop = useIsDesktop();
  const sceneUrl = view.scene === null ? null : resolveArtRef(view.scene);
  const [selectedChoices, setSelectedChoices] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [inspectedOfferId, setInspectedOfferId] = useState<string | null>(null);
  const [committingOfferId, setCommittingOfferId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inspectedOffer =
    view.offers.find((offer) => offer.id === inspectedOfferId) ?? null;

  const selectChoice = useCallback((offerId: string, choiceId: string) => {
    setErrorMessage(null);
    setSelectedChoices((current) => {
      const next = new Map(current);
      next.set(offerId, choiceId);
      return next;
    });
  }, []);

  const confirmOffer = useCallback(
    (offer: DreamAuguryOfferView) => {
      const choiceId = selectedChoices.get(offer.id) ?? null;
      const result = onChoose(offer.id, choiceId);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setCommittingOfferId(offer.id);
    },
    [onChoose, selectedChoices],
  );

  const inspectOffer = useCallback(
    (offer: DreamAuguryOfferView) => {
      setErrorMessage(null);
      setInspectedOfferId(offer.id);
      onInspectOffer?.(offer.id);
    },
    [onInspectOffer],
  );

  const chooseAgain = useCallback(() => {
    if (inspectedOfferId === null || committingOfferId !== null) return;
    setSelectedChoices((current) => {
      const next = new Map(current);
      next.delete(inspectedOfferId);
      return next;
    });
    setErrorMessage(null);
    setInspectedOfferId(null);
  }, [committingOfferId, inspectedOfferId]);

  return (
    <div
      className="cumulus"
      data-testid="cumulus-dream-augury-site-screen"
      data-augury-phase={inspectedOffer === null ? "comparison" : "detail"}
      data-site-id={view.siteId}
      data-encounter-signature={view.encounterSignature ?? undefined}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        color: token("--text-on-glass"),
      }}
    >
      {sceneUrl !== null && (
        <img
          src={sceneUrl}
          alt=""
          draggable={false}
          data-testid="cumulus-dream-augury-scene"
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
      <Motes on tint="warm" count={18} seed={7} />

      <div
        style={{
          position: "absolute",
          top: `max(var(--safe-area-inset-top), ${token("--space-8")})`,
          left: `max(var(--safe-area-inset-left), ${token("--space-8")})`,
          zIndex: 40,
        }}
      >
        <IconButton
          glyph={GLYPHS.close}
          label="Walk on"
          size="sm"
          onPress={onClose}
          testId="cumulus-dream-augury-close"
        />
      </div>

      <main
        data-dream-augury-layout={isDesktop ? "desktop" : "mobile"}
        style={{
          position: "absolute",
          top: `max(var(--safe-area-inset-top), ${token("--space-8")})`,
          right: `max(var(--safe-area-inset-right), ${token("--space-9")})`,
          bottom: `calc(${QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-6")})`,
          left: `max(var(--safe-area-inset-left), ${token("--space-9")})`,
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          gap: token("--space-7"),
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <header
          style={{
            display: "grid",
            justifyItems: "center",
            gap: token("--space-2"),
            textAlign: "center",
            textShadow: token("--text-outline-media"),
          }}
        >
          <p
            style={{
              margin: 0,
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              color: token("--text-primary"),
              textTransform: "uppercase",
            }}
          >
            Dream Augury
          </p>
          <h1 style={{ margin: 0, font: token("--t-display") }}>
            {inspectedOffer === null ? "Choose One" : "Your Vision"}
          </h1>
        </header>

        {view.offers.length === 2 && inspectedOffer === null ? (
          <section
            data-dream-augury-choice-stage=""
            style={{
              width: "100%",
              maxWidth: 1580,
              minHeight: 0,
              justifySelf: "center",
              display: "grid",
              gridTemplateColumns: isDesktop
                ? "minmax(360px, 1fr) minmax(260px, 0.76fr) minmax(360px, 1fr)"
                : "minmax(0, 1fr)",
              gridTemplateRows: isDesktop ? "minmax(0, 1fr)" : "auto",
              gap: token("--space-8"),
              alignItems: "center",
              overflowY: isDesktop ? "visible" : "auto",
              padding: isDesktop ? undefined : token("--space-2"),
              boxSizing: "border-box",
            }}
          >
            <OfferPreviewPanel
              offer={view.offers[0]}
              disabled={committingOfferId !== null}
              onInspect={inspectOffer}
            />
            <GuideFigure
              guide={view.guide}
              desktop={isDesktop}
              placement="center"
            />
            <OfferPreviewPanel
              offer={view.offers[1]}
              disabled={committingOfferId !== null}
              onInspect={inspectOffer}
            />
          </section>
        ) : inspectedOffer !== null ? (
          <section
            data-dream-augury-detail-stage=""
            style={{
              width: "100%",
              maxWidth: 1420,
              minHeight: 0,
              justifySelf: "center",
              display: "grid",
              gridTemplateColumns: isDesktop
                ? "minmax(260px, 0.56fr) minmax(680px, 1.44fr)"
                : "minmax(0, 1fr)",
              gap: token("--space-8"),
              alignItems: "center",
              overflowY: isDesktop ? "visible" : "auto",
              padding: isDesktop ? undefined : token("--space-2"),
              boxSizing: "border-box",
            }}
          >
            <GuideFigure
              guide={view.guide}
              desktop={isDesktop}
              placement="aside"
            />
            <OfferDetailPanel
              offer={inspectedOffer}
              selectedChoiceId={selectedChoices.get(inspectedOffer.id)}
              disabled={committingOfferId !== null}
              onSelect={selectChoice}
              onChooseAgain={chooseAgain}
              onConfirm={confirmOffer}
            />
          </section>
        ) : (
          <section
            style={{
              alignSelf: "center",
              justifySelf: "center",
              width: "fit-content",
              pointerEvents: "auto",
            }}
          >
            <GlassPanel overflow="visible">
              <div
                style={{
                  padding: token("--space-9"),
                  display: "grid",
                  justifyItems: "center",
                  gap: token("--space-6"),
                }}
              >
                <p style={{ margin: 0, font: token("--t-lead") }}>
                  The augury is clouded.
                </p>
                <GlassButton
                  label="Walk On"
                  placement="onGlass"
                  onPress={onClose}
                />
              </div>
            </GlassPanel>
          </section>
        )}
      </main>

      {errorMessage !== null && (
        <div
          role="status"
          data-testid="cumulus-dream-augury-error"
          style={{
            position: "absolute",
            left: "25%",
            right: "25%",
            bottom: `calc(${QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-6")})`,
            maxWidth: 520,
            marginInline: "auto",
            zIndex: 50,
          }}
        >
          <GlassPanel radius="control" overflow="visible">
            <div
              style={{
                padding: `${token("--space-5")} ${token("--space-7")}`,
                font: token("--t-body-sm"),
                textAlign: "center",
              }}
            >
              {errorMessage}
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

function GuideFigure({
  guide,
  desktop,
  placement,
}: {
  guide: DreamAuguryGuideView;
  desktop: boolean;
  placement: "center" | "aside";
}) {
  return (
    <figure
      data-augury-guide=""
      data-guide-id={guide.id}
      style={{
        position: "relative",
        order: desktop ? undefined : -1,
        width: "100%",
        height: desktop ? "100%" : 260,
        minHeight: desktop ? (placement === "center" ? 520 : 480) : undefined,
        maxHeight: desktop ? (placement === "center" ? 720 : 660) : undefined,
        margin: 0,
        pointerEvents: "none",
      }}
    >
      <img
        src={resolveArtRef(guide.art)}
        alt={guide.name}
        draggable={false}
        data-testid="cumulus-dream-augury-guide-art"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          translate: "-50% 0",
          width: desktop
            ? placement === "center"
              ? "min(29vw, 100%)"
              : "min(32vw, 100%)"
            : "min(72vw, 360px)",
          maxWidth: GUIDE_MAX_WIDTH,
          height: "100%",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
      <figcaption
        style={{
          position: "absolute",
          left: "50%",
          bottom: token("--space-5"),
          translate: "-50% 0",
          margin: 0,
          font: token("--t-caption"),
          color: token("--text-primary"),
          textAlign: "center",
          textShadow: token("--text-outline-media"),
          whiteSpace: "nowrap",
        }}
      >
        {guide.name}
      </figcaption>
    </figure>
  );
}

function OfferPreviewPanel({
  offer,
  disabled,
  onInspect,
}: {
  offer: DreamAuguryOfferView;
  disabled: boolean;
  onInspect: (offer: DreamAuguryOfferView) => void;
}) {
  return (
    <article
      data-augury-offer={offer.id}
      data-augury-offer-mode="preview"
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        pointerEvents: "auto",
      }}
    >
      <GlassPanel
        eyebrow={`Vision ${offer.ordinal}`}
        title={offer.headline}
        headerAlign="center"
        headerDivider={false}
        headerSpacing="medium"
        overflow="visible"
      >
        <div
          style={{
            display: "grid",
            gridTemplateRows: "auto auto",
            gap: token("--space-5"),
            padding: `0 ${token("--space-7")} ${token("--space-7")}`,
          }}
        >
          <div
            data-augury-preview-visual=""
            style={{
              height: 330,
              minWidth: 0,
              overflow: "visible",
              display: "grid",
              placeItems: "center",
              padding: token("--space-2"),
            }}
          >
            <OfferPreviewVisual visual={offer.visual} />
          </div>
          <div style={{ display: "grid", placeItems: "center" }}>
            <GlassButton
              label="Choose"
              variant="accent"
              placement="onGlass"
              disabled={disabled}
              onPress={() => onInspect(offer)}
              testId={`cumulus-dream-augury-preview-${offer.id}`}
            />
          </div>
        </div>
      </GlassPanel>
    </article>
  );
}

function OfferDetailPanel({
  offer,
  selectedChoiceId,
  disabled,
  onSelect,
  onChooseAgain,
  onConfirm,
}: {
  offer: DreamAuguryOfferView;
  selectedChoiceId?: string;
  disabled: boolean;
  onSelect: (offerId: string, choiceId: string) => void;
  onChooseAgain: () => void;
  onConfirm: (offer: DreamAuguryOfferView) => void;
}) {
  const confirmDisabled =
    disabled || (offer.requiresSelection && selectedChoiceId === undefined);
  return (
    <article
      data-testid="cumulus-dream-augury-detail"
      data-offer-id={offer.id}
      data-augury-offer={offer.id}
      data-augury-offer-mode="detail"
      style={{
        width: offer.requiresSelection ? "100%" : "min(100%, 720px)",
        minWidth: 0,
        maxHeight: "100%",
        boxSizing: "border-box",
        justifySelf: "center",
        pointerEvents: "auto",
      }}
    >
      <GlassPanel
        eyebrow={`Vision ${offer.ordinal}`}
        title={offer.headline}
        headerSpacing="medium"
        footer={
          <div
            data-dream-augury-actions=""
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: token("--space-4"),
              paddingRight: token("--space-7"),
              paddingBottom: token("--space-6"),
              paddingLeft: token("--space-7"),
            }}
          >
            <GlassButton
              label="Choose Again"
              placement="onGlass"
              disabled={disabled}
              onPress={onChooseAgain}
              testId="cumulus-dream-augury-choose-again"
            />
            <GlassButton
              label="Confirm"
              variant="accent"
              placement="onGlass"
              disabled={confirmDisabled}
              onPress={() => onConfirm(offer)}
              testId={`cumulus-dream-augury-confirm-${offer.id}`}
            />
          </div>
        }
      >
        <div
          data-augury-detail-visual=""
          style={{
            minHeight: 0,
            maxHeight: "min(62vh, 620px)",
            overflow: "auto",
            display: "grid",
            placeItems: "center",
            padding: token("--space-8"),
          }}
        >
          <OfferDetailVisual
            offerId={offer.id}
            visual={offer.visual}
            selectedChoiceId={selectedChoiceId}
            onSelect={onSelect}
          />
        </div>
      </GlassPanel>
    </article>
  );
}

function OfferPreviewVisual({
  visual,
}: {
  visual: DreamAuguryOfferVisualView;
}) {
  switch (visual.kind) {
    case "cards":
      return visual.cards.length === 1 && visual.cards[0] !== undefined ? (
        <CardTile card={visual.cards[0]} width={PREVIEW_DIRECT_CARD_WIDTH} />
      ) : (
        <PreviewCardStack cards={visual.cards} />
      );
    case "cardChoices":
      return (
        <PreviewCardStack cards={visual.choices.map((choice) => choice.card)} />
      );
    case "beforeAfter": {
      const pair = visual.pairs[0];
      return pair === undefined ? null : (
        <PreviewTransition before={pair.before} after={pair.after} />
      );
    }
    case "purge":
      return (
        <CardTile card={visual.card} width={PREVIEW_DIRECT_CARD_WIDTH} danger />
      );
    case "purgeReplace":
      return (
        <PreviewTransition
          before={visual.removed}
          after={visual.choices[0]?.card}
          danger
        />
      );
    case "duplicate":
      return <PreviewDuplicateCards card={visual.card} />;
    case "duplicateChoices":
      return (
        <PreviewCardStack cards={visual.choices.map((choice) => choice.card)} />
      );
    case "dreamsigns":
      return <PreviewDreamsigns dreamsigns={visual.dreamsigns} />;
    case "dreamsignChoices":
      return (
        <PreviewDreamsigns
          dreamsigns={visual.choices.map((choice) => choice.dreamsign)}
        />
      );
    case "site":
      return (
        <SiteRewardVisual siteName={visual.siteName} glyph={visual.glyph} />
      );
    case "mixed":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-7"),
          }}
        >
          <PreviewCardStack cards={visual.cards} />
          <PreviewDreamsigns dreamsigns={visual.dreamsigns} />
        </div>
      );
  }
}

function OfferDetailVisual({
  offerId,
  visual,
  selectedChoiceId,
  onSelect,
}: {
  offerId: string;
  visual: DreamAuguryOfferVisualView;
  selectedChoiceId?: string;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  switch (visual.kind) {
    case "cards":
      return <DetailCardRow cards={visual.cards} />;
    case "cardChoices":
      return (
        <CardChoices
          offerId={offerId}
          choices={visual.choices}
          selectedChoiceId={selectedChoiceId}
          onSelect={onSelect}
        />
      );
    case "beforeAfter":
      return (
        <div style={{ display: "grid", gap: token("--space-5") }}>
          {visual.pairs.map((pair) => (
            <div
              key={pair.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: token("--space-4"),
              }}
            >
              <CardTile
                card={pair.before}
                width={DETAIL_TRANSITION_CARD_WIDTH}
                muted
              />
              <GlowIcon
                iconClass={GLYPHS.chevronRight}
                color="accent-bright"
                size="32px"
              />
              <CardTile
                card={pair.after}
                width={DETAIL_TRANSITION_CARD_WIDTH}
                selected
              />
            </div>
          ))}
        </div>
      );
    case "purge":
      return (
        <CardTile card={visual.card} width={DETAIL_DIRECT_CARD_WIDTH} danger />
      );
    case "purgeReplace":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-4"),
          }}
        >
          <CardTile
            card={visual.removed}
            width={DETAIL_TRANSITION_CARD_WIDTH}
            danger
          />
          <GlowIcon
            iconClass={GLYPHS.chevronRight}
            color="accent-bright"
            size="32px"
          />
          <CardChoices
            offerId={offerId}
            choices={visual.choices}
            selectedChoiceId={selectedChoiceId}
            onSelect={onSelect}
          />
        </div>
      );
    case "duplicate":
      return <DetailDuplicateCards card={visual.card} />;
    case "duplicateChoices":
      return (
        <CardChoices
          offerId={offerId}
          choices={visual.choices}
          selectedChoiceId={selectedChoiceId}
          onSelect={onSelect}
        />
      );
    case "dreamsigns":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-7"),
            flexWrap: "wrap",
          }}
        >
          {visual.dreamsigns.map((dreamsign) => (
            <Dreamsign
              key={dreamsign.id}
              dreamsign={dreamsign}
              sizePx={DETAIL_DREAMSIGN_SIZE}
              testid={`cumulus-augury-dreamsign-${dreamsign.id}`}
            />
          ))}
        </div>
      );
    case "dreamsignChoices":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-6"),
            flexWrap: "wrap",
          }}
        >
          {visual.choices.map((choice) => {
            const selected = selectedChoiceId === choice.id;
            return (
              <div
                key={choice.id}
                data-selected={selected ? "true" : "false"}
                style={{
                  padding: token("--space-3"),
                  borderRadius: token("--radius-panel"),
                  border: `1px solid ${selected ? token("--border-accent") : "transparent"}`,
                  boxShadow: selected ? token("--glow-accent-soft") : undefined,
                }}
              >
                <Dreamsign
                  dreamsign={choice.dreamsign}
                  sizePx={DETAIL_DREAMSIGN_SIZE}
                  onPress={() => onSelect(offerId, choice.id)}
                  testid={`cumulus-augury-choice-${choice.id}`}
                />
              </div>
            );
          })}
        </div>
      );
    case "site":
      return (
        <SiteRewardVisual siteName={visual.siteName} glyph={visual.glyph} />
      );
    case "mixed":
      return (
        <div style={{ display: "grid", gap: token("--space-6") }}>
          <DetailCardRow cards={visual.cards} />
          {visual.dreamsigns.map((dreamsign) => (
            <Dreamsign
              key={dreamsign.id}
              dreamsign={dreamsign}
              sizePx={DETAIL_DREAMSIGN_SIZE}
            />
          ))}
        </div>
      );
  }
}

function DetailCardRow({ cards }: { cards: readonly DreamAuguryCardView[] }) {
  const width =
    cards.length === 1 ? DETAIL_DIRECT_CARD_WIDTH : DETAIL_GROUP_CARD_WIDTH;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-4"),
        flexWrap: "wrap",
      }}
    >
      {cards.map((card) => (
        <CardTile key={card.id} card={card} width={width} />
      ))}
    </div>
  );
}

function CardChoices({
  offerId,
  choices,
  selectedChoiceId,
  onSelect,
}: {
  offerId: string;
  choices: readonly DreamAuguryCardChoiceView[];
  selectedChoiceId?: string;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  const columns = Math.max(1, Math.min(4, choices.length));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${String(columns)}, ${String(DETAIL_CHOICE_CARD_WIDTH)}px)`,
        gap: token("--space-5"),
        justifyItems: "center",
      }}
    >
      {choices.map((choice) => (
        <CardTile
          key={choice.id}
          card={choice.card}
          width={DETAIL_CHOICE_CARD_WIDTH}
          selected={selectedChoiceId === choice.id}
          onActivate={() => onSelect(offerId, choice.id)}
          testId={`cumulus-augury-choice-${choice.id}`}
        />
      ))}
    </div>
  );
}

function PreviewCardStack({
  cards,
}: {
  cards: readonly DreamAuguryCardView[];
}) {
  const visible = cards.slice(0, 3);
  const offset = 38;
  return (
    <div
      data-augury-preview-card-stack={String(cards.length)}
      style={{
        position: "relative",
        width: PREVIEW_CARD_WIDTH + Math.max(0, visible.length - 1) * offset,
        height: PREVIEW_CARD_WIDTH * 1.4 + Math.max(0, visible.length - 1) * 8,
      }}
    >
      {visible.map((card, index) => (
        <div
          key={card.id}
          style={{
            position: "absolute",
            top: index * 8,
            left: index * offset,
            width: PREVIEW_CARD_WIDTH,
            zIndex: index + 1,
          }}
        >
          <GameCard model={card.model} />
        </div>
      ))}
    </div>
  );
}

function PreviewTransition({
  before,
  after,
  danger = false,
}: {
  before: DreamAuguryCardView;
  after?: DreamAuguryCardView;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-4"),
      }}
    >
      <CardTile
        card={before}
        width={PREVIEW_TRANSITION_CARD_WIDTH}
        muted={!danger}
        danger={danger}
      />
      {after !== undefined && (
        <>
          <GlowIcon
            iconClass={GLYPHS.chevronRight}
            color="accent-bright"
            size="32px"
          />
          <CardTile
            card={after}
            width={PREVIEW_TRANSITION_CARD_WIDTH}
            selected
          />
        </>
      )}
    </div>
  );
}

function PreviewDreamsigns({
  dreamsigns,
}: {
  dreamsigns: readonly DreamsignData[];
}) {
  const visible = dreamsigns.slice(0, 3);
  const size =
    visible.length > 2
      ? 142
      : visible.length === 2
        ? 200
        : PREVIEW_DREAMSIGN_SIZE;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-4"),
      }}
    >
      {visible.map((dreamsign) => (
        <Dreamsign
          key={dreamsign.id}
          dreamsign={dreamsign}
          sizePx={size}
          testid={`cumulus-augury-preview-dreamsign-${dreamsign.id}`}
        />
      ))}
    </div>
  );
}

function CardTile({
  card,
  width,
  selected = false,
  muted = false,
  danger = false,
  onActivate,
  testId,
}: {
  card: DreamAuguryCardView;
  width: number;
  selected?: boolean;
  muted?: boolean;
  danger?: boolean;
  onActivate?: () => void;
  testId?: string;
}) {
  return (
    <div style={{ width }}>
      <GameCard
        model={card.model}
        onActivate={onActivate}
        unavailable={muted}
        selected={selected || danger}
        selectionColor={danger ? "danger" : undefined}
        testId={testId}
      />
    </div>
  );
}

function PreviewDuplicateCards({ card }: { card: DreamAuguryCardView }) {
  return (
    <div style={{ position: "relative", width: 292, height: 326 }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: PREVIEW_CARD_WIDTH,
        }}
      >
        <GameCard model={card.model} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: PREVIEW_CARD_WIDTH,
        }}
      >
        <GameCard model={card.model} />
      </div>
    </div>
  );
}

function DetailDuplicateCards({ card }: { card: DreamAuguryCardView }) {
  return (
    <div style={{ position: "relative", width: 348, height: 388 }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: DETAIL_DIRECT_CARD_WIDTH,
        }}
      >
        <GameCard model={card.model} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: DETAIL_DIRECT_CARD_WIDTH,
        }}
      >
        <GameCard model={card.model} />
      </div>
    </div>
  );
}

function SiteRewardVisual({
  siteName,
  glyph: siteGlyph,
}: {
  siteName: string;
  glyph: Glyph;
}) {
  return (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        gap: token("--space-6"),
      }}
    >
      <div
        style={{
          width: 156,
          height: 156,
          borderRadius: token("--radius-pill"),
          border: `1px solid ${token("--border-accent")}`,
          display: "grid",
          placeItems: "center",
          boxShadow: token("--glow-accent-soft"),
        }}
      >
        <GlowIcon
          iconClass={siteGlyph}
          color="accent-bright"
          size={SITE_GLYPH_SIZE}
          shadow
          title={siteName}
        />
      </div>
      <span style={{ font: token("--t-lead") }}>{siteName}</span>
    </div>
  );
}
