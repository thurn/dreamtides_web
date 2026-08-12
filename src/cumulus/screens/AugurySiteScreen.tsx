import { meaning, tx, type LocalizedString } from "@trox/runtime";
import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import {
  CardChoiceGrid,
  type CardChoiceGridColumns,
  type CardChoiceGridSiteFit,
} from "../components/card/CardChoiceGrid";
import { GlassButton } from "../components/controls/GlassButton";
import { StandaloneGlyph } from "../components/controls/StandaloneGlyph";
import { IconButton } from "../components/controls/IconButton";
import type { OfferTileModel } from "../components/controls/OfferTile";
import {
  OfferTile,
  OFFER_TILE_COMPACT_SIZE,
} from "../components/controls/OfferTile";
import {
  auguryOfferHeadline,
  offerTileDescription,
} from "../components/controls/offer-tile-descriptions";
import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../components/dreamscape/SiteNode";
import { Dreamsign } from "../components/hud/Dreamsign";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import type { AuguryArchetypeData } from "../../types/augury-data";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import { GuideGallerySiteLayout } from "./GuideGallerySiteLayout";
import { debugRerollCornerStyle } from "./chrome-geometry";
import { useIsDesktop } from "./use-is-desktop";

export interface AuguryGuideView {
  id: string;
  name: string;
  line: string;
  art: ArtRef;
}

export interface AuguryCardView {
  id: string;
  model: GameCardModel;
}

export interface AuguryCardChoiceView {
  id: string;
  card: AuguryCardView;
}

export type AuguryOfferVisualView =
  | { kind: "cards"; cards: readonly AuguryCardView[] }
  | {
      kind: "cardChoices";
      choices: readonly AuguryCardChoiceView[];
      doubled: boolean;
    }
  | {
      kind: "beforeAfter";
      pairs: readonly {
        id: string;
        before: AuguryCardView;
        after: AuguryCardView;
      }[];
    }
  | { kind: "purge"; card: AuguryCardView }
  | { kind: "duplicate"; card: AuguryCardView }
  | { kind: "duplicateChoices"; choices: readonly AuguryCardChoiceView[] }
  | { kind: "dreamsigns"; dreamsigns: readonly DreamsignData[] }
  | { kind: "site"; model: DreamscapeSiteModel }
  | {
      kind: "mixed";
      cards: readonly AuguryCardView[];
      dreamsigns: readonly DreamsignData[];
    };

export interface AuguryOfferView {
  id: string;
  requiresSelection: boolean;
  tile: OfferTileModel;
  presentation: AuguryArchetypeData["presentation"];
  visual: AuguryOfferVisualView;
}

export interface AugurySiteView {
  siteId: string;
  scene: ArtRef | null;
  encounterSignature: string | null;
  guide: AuguryGuideView;
  offers: readonly AuguryOfferView[];
  unavailableMessage: string | null;
  /** TOML-authored encounter rule; absent synthetic fixtures default to allowed. */
  allowDecline?: boolean;
}

export type AuguryChoiceResult =
  { ok: true } | { ok: false; message: LocalizedString };

export interface AugurySiteScreenProps {
  view: AugurySiteView;
  /** Requests a shared debug reroll of both Augury offers. */
  onReroll?: () => void;
  onInspectOffer?: (offerId: string) => void;
  onChoose: (offerId: string, choiceId: string | null) => AuguryChoiceResult;
  onClose: () => void;
}

function requiresWideDesktopDetail(visual: AuguryOfferVisualView): boolean {
  switch (visual.kind) {
    case "cards":
      return visual.cards.length > 2;
    case "cardChoices":
      return visual.choices.length > 2;
    case "beforeAfter":
      return visual.pairs.length * 2 > 2;
    case "duplicateChoices":
      return visual.choices.length > 2;
    case "mixed":
      return visual.cards.length > 2;
    case "purge":
    case "duplicate":
    case "dreamsigns":
    case "site":
      return false;
  }
}

export function AugurySiteScreen({
  view,
  onReroll,
  onInspectOffer,
  onChoose,
  onClose,
}: AugurySiteScreenProps) {
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsDesktop();
  const [selectedChoices, setSelectedChoices] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [inspectedOfferId, setInspectedOfferId] = useState<string | null>(null);
  const [committingOfferId, setCommittingOfferId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] =
    useState<LocalizedString | null>(null);
  const inspectedOffer =
    view.offers.find((offer) => offer.id === inspectedOfferId) ?? null;
  const wideDesktopDetail =
    inspectedOffer !== null && requiresWideDesktopDetail(inspectedOffer.visual);
  const available = view.offers.length === 2;
  const guide = available
    ? view.guide
    : {
        ...view.guide,
        ...(view.unavailableMessage === null
          ? {
              lineMessage: tx(
            "The visions are clouded. Walk on for now.",
            "Player-facing message for the augury unavailable guide line interface state.",
              ),
              line: undefined,
            }
          : { line: view.unavailableMessage, lineMessage: undefined }),
      };

  const selectChoice = useCallback((offerId: string, choiceId: string) => {
    setErrorMessage(null);
    setSelectedChoices((current) => new Map(current).set(offerId, choiceId));
  }, []);

  const inspectOffer = useCallback(
    (offer: AuguryOfferView) => {
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

  const confirmOffer = useCallback(
    (offer: AuguryOfferView) => {
      const result = onChoose(offer.id, selectedChoices.get(offer.id) ?? null);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setCommittingOfferId(offer.id);
    },
    [onChoose, selectedChoices],
  );

  const transition = {
    duration: reduceMotion === true ? 0 : 0.24,
    ease: [0.22, 0.61, 0.36, 1] as const,
  };

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={guide}
      desktopComposition={inspectedOffer === null ? "split" : "showcase"}
      mobileComposition="revelation"
      mobileRegionSize={inspectedOffer === null ? "standard" : "expanded"}
      speechBubbleVisible={inspectedOffer === null}
      screenTestId="cumulus-augury-site-screen"
      guideArtTestId="cumulus-augury-guide-art"
      speechAnchorTestId="cumulus-augury-speech-anchor"
      speechBubbleTestId="cumulus-augury-speech"
      renderGallery={(layout) => (
        <section
          data-augury-layout={layout}
          data-augury-phase={inspectedOffer === null ? "comparison" : "detail"}
          data-augury-desktop-placement={
            inspectedOffer === null ? undefined : "center"
          }
          data-encounter-signature={view.encounterSignature ?? undefined}
          style={{
            width: "100%",
            maxWidth:
              layout === "desktop" ? (wideDesktopDetail ? 1120 : 820) : "100%",
            justifySelf:
              layout === "desktop" && inspectedOffer !== null
                ? "center"
                : undefined,
            height: "100%",
            minHeight: 0,
            display: "grid",
            placeItems: "center",
            padding:
              layout === "desktop" ? token("--space-l") : token("--space-xs"),
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        >
          {inspectedOffer !== null ? (
            <motion.div
              key={`detail:${inspectedOffer.id}`}
              initial={{ opacity: 0, y: reduceMotion === true ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion === true ? 0 : 8 }}
              transition={transition}
              style={{
                width: "100%",
                height: "100%",
                minHeight: 0,
                pointerEvents: "auto",
              }}
            >
              <OfferDetailPanel
                offer={inspectedOffer}
                layout={layout}
                selectedChoiceId={selectedChoices.get(inspectedOffer.id)}
                disabled={committingOfferId !== null}
                errorMessage={errorMessage}
                onSelect={selectChoice}
                onChooseAgain={chooseAgain}
                onConfirm={confirmOffer}
              />
            </motion.div>
          ) : available ? (
            <motion.div
              key="offers"
              initial={{ opacity: 0, y: reduceMotion === true ? 0 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion === true ? 0 : -8 }}
              transition={transition}
              style={{
                display: "grid",
                justifyItems: "center",
                gap: token("--space-m"),
                pointerEvents: "auto",
              }}
            >
              <div
                data-augury-offer-row=""
                style={{
                  display: "flex",
                  width: layout === "mobile" ? "100%" : undefined,
                  maxWidth: "100%",
                  alignItems: "center",
                  justifyContent:
                    layout === "desktop" ? "center" : "flex-start",
                  gap:
                    layout === "desktop"
                      ? token("--space-3xl")
                      : token("--space-s"),
                  overflowX: layout === "mobile" ? "auto" : undefined,
                  paddingInline:
                    layout === "mobile"
                      ? `calc((100% - ${String(OFFER_TILE_COMPACT_SIZE)}px) / 2)`
                      : undefined,
                  boxSizing: "border-box",
                  scrollSnapType:
                    layout === "mobile" ? "x mandatory" : undefined,
                }}
              >
                {view.offers.map((offer) => (
                  <div
                    key={offer.id}
                    style={{
                      flex: "0 0 auto",
                      scrollSnapAlign:
                        layout === "mobile" ? "center" : undefined,
                    }}
                  >
                    <OfferTile
                      model={offer.tile}
                      presentation={offer.presentation}
                      size={layout === "desktop" ? "standard" : "compact"}
                      onPress={() => inspectOffer(offer)}
                      testId={`cumulus-augury-offer-${offer.id}`}
                    />
                  </div>
                ))}
              </div>
              {view.allowDecline !== false ? (
                <GlassButton
                  label={tx(
                    "Decline Offer",
                    "Command that declines the current site offer and leaves without taking its reward.",
                  )}
                  disabled={committingOfferId !== null}
                  onPress={onClose}
                  testId="cumulus-augury-decline"
                />
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="unavailable"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
              style={{ pointerEvents: "auto" }}
            >
              <GlassButton
                label={tx(
                  "Walk On",
                  "Player-facing message for the site walk on interface state.",
                )}
                onPress={onClose}
                testId="cumulus-augury-unavailable-exit"
              />
            </motion.div>
          )}
        </section>
      )}
    >
      {onReroll !== undefined && (
        <div
          data-augury-reroll-control=""
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            position: "absolute",
            ...debugRerollCornerStyle(isDesktop),
            zIndex: 30,
          }}
        >
          <IconButton
            glyph={GLYPHS.refresh}
            overlayGlyph={GLYPHS.bug}
            label={tx(
                "Reroll Augury offers",
                "Player-facing message for the augury reroll offers interface state.",
              )}
            onPress={onReroll}
            testId="reroll-augury-offers"
          />
        </div>
      )}
    </GuideGallerySiteLayout>
  );
}

function OfferDetailPanel({
  offer,
  layout,
  selectedChoiceId,
  disabled,
  errorMessage,
  onSelect,
  onChooseAgain,
  onConfirm,
}: {
  offer: AuguryOfferView;
  layout: "mobile" | "desktop";
  selectedChoiceId?: string;
  disabled: boolean;
  errorMessage: LocalizedString | null;
  onSelect: (offerId: string, choiceId: string) => void;
  onChooseAgain: () => void;
  onConfirm: (offer: AuguryOfferView) => void;
}) {
  const resolve = useLocalizer();
  const confirmDisabled =
    disabled || (offer.requiresSelection && selectedChoiceId === undefined);
  return (
    <article
      data-testid="cumulus-augury-detail"
      data-offer-id={offer.id}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        pointerEvents: "auto",
      }}
    >
      <GlassPanel
        authoredTitle={auguryOfferHeadline(offer.tile, offer.presentation)}
        authoredSubtitle={offerTileDescription(offer.tile, offer.presentation)}
        headerSpacing="medium"
        footer={
          <div
            data-augury-actions=""
            style={{
              display: "flex",
              justifyContent: layout === "mobile" ? "center" : "flex-end",
              alignItems: "center",
              gap: token("--space-s"),
              padding:
                layout === "mobile"
                  ? `0 ${token("--space-s")} ${token("--space-s")}`
                  : `0 ${token("--space-2xl")} ${token("--space-l")}`,
            }}
          >
            <GlassButton
              label={tx(
                meaning("augury-reselect-action", "Choose Again"),
                "Player-facing message for the site choose again interface state.",
              )}
              placement="onGlass"
              disabled={disabled}
              onPress={onChooseAgain}
              testId="cumulus-augury-choose-again"
            />
            <GlassButton
              label={tx(
                "Confirm",
                "Player-facing message for the site confirm interface state.",
              )}
              variant="accent"
              placement="onGlass"
              disabled={confirmDisabled}
              onPress={() => onConfirm(offer)}
              testId={`cumulus-augury-confirm-${offer.id}`}
            />
          </div>
        }
      >
        <div
          data-augury-detail-visual=""
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            // The floating GlassPanel hugs its contents, so block-size
            // containment would make this fitter's intrinsic height zero
            // and collapse every cqh-sized reward to 0x0.
            containerType: "inline-size",
            display: "grid",
            placeItems: "center",
            gap: token("--space-s"),
            padding:
              layout === "desktop" ? token("--space-xl") : token("--space-s"),
            boxSizing: "border-box",
          }}
        >
          <OfferDetailVisual
            offerId={offer.id}
            visual={offer.visual}
            layout={layout}
            selectedChoiceId={selectedChoiceId}
            onSelect={onSelect}
          />
          {errorMessage !== null && (
            <p
              role="status"
              data-testid="cumulus-augury-error"
              style={{
                margin: 0,
                color: token("--danger"),
                font: token("--t-body"),
                textAlign: "center",
              }}
            >
              {resolve(errorMessage)}
            </p>
          )}
        </div>
      </GlassPanel>
    </article>
  );
}

function OfferDetailVisual({
  offerId,
  visual,
  layout,
  selectedChoiceId,
  onSelect,
}: {
  offerId: string;
  visual: AuguryOfferVisualView;
  layout: "mobile" | "desktop";
  selectedChoiceId?: string;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  const choices = (
    items: readonly AuguryCardChoiceView[],
    selectedCopyCount?: number,
  ) => (
    <CardChoices
      offerId={offerId}
      choices={items}
      layout={layout}
      selectedChoiceId={selectedChoiceId}
      selectedCopyCount={selectedCopyCount}
      onSelect={onSelect}
    />
  );
  switch (visual.kind) {
    case "cards":
      return <CardRow cards={visual.cards} layout={layout} />;
    case "cardChoices":
      return choices(visual.choices, visual.doubled ? 2 : undefined);
    case "beforeAfter":
      return (
        <div style={{ display: "grid", gap: token("--space-s") }}>
          {visual.pairs.map((pair) => (
            <Transition
              key={pair.id}
              before={pair.before}
              after={pair.after}
              layout={layout}
            />
          ))}
        </div>
      );
    case "purge":
      return <CardRow cards={[visual.card]} layout={layout} tone="danger" />;
    case "duplicate":
      return <DuplicateCards card={visual.card} layout={layout} />;
    case "duplicateChoices":
      return choices(visual.choices);
    case "dreamsigns":
      return <DreamsignRow dreamsigns={visual.dreamsigns} layout={layout} />;
    case "site":
      return <SiteRewardVisual model={visual.model} />;
    case "mixed":
      return (
        <div
          style={{
            display: "grid",
            justifyItems: "center",
            gap: token("--space-m"),
          }}
        >
          <CardRow cards={visual.cards} layout={layout} fit="mixed-reward" />
          <DreamsignRow dreamsigns={visual.dreamsigns} layout={layout} />
        </div>
      );
  }
}

type CardTileWidth = CSSProperties["width"];

function cardGridColumns(
  count: number,
  layout: "mobile" | "desktop",
): CardChoiceGridColumns {
  const columns =
    layout === "desktop" ? Math.max(1, count) : Math.min(2, Math.max(1, count));
  if (columns <= 1) return "one";
  if (columns === 2) return "two";
  if (columns === 3) return "three";
  if (columns === 4) return "four";
  return "five";
}

function CardChoices({
  offerId,
  choices,
  layout,
  fit = "choice",
  columns = cardGridColumns(choices.length, layout),
  selectedChoiceId,
  selectedCopyCount,
  onSelect,
}: {
  offerId: string;
  choices: readonly AuguryCardChoiceView[];
  layout: "mobile" | "desktop";
  fit?: CardChoiceGridSiteFit;
  columns?: CardChoiceGridColumns;
  selectedChoiceId?: string;
  selectedCopyCount?: number;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  return (
    <CardChoiceGrid
      cards={choices.map((choice) => ({
        entryId: choice.id,
        model: choice.card.model,
        selection: selectedChoiceId === choice.id ? "highlighted" : undefined,
        quantityBadge:
          selectedChoiceId === choice.id && selectedCopyCount !== undefined
            ? { count: selectedCopyCount }
            : undefined,
        testId: `cumulus-augury-choice-${choice.id}`,
      }))}
      columns={columns}
      layout={{ kind: "site", viewport: layout, fit }}
      onCardPress={(choiceId) => onSelect(offerId, choiceId)}
    />
  );
}

function CardRow({
  cards,
  layout,
  fit = "choice",
  tone = "default",
}: {
  cards: readonly AuguryCardView[];
  layout: "mobile" | "desktop";
  fit?: CardChoiceGridSiteFit;
  tone?: "default" | "danger";
}) {
  return (
    <CardChoiceGrid
      cards={cards.map((card) => ({
        entryId: card.id,
        model: card.model,
        selection: tone === "danger" ? "danger" : undefined,
      }))}
      columns={cardGridColumns(cards.length, layout)}
      layout={{ kind: "site", viewport: layout, fit }}
    />
  );
}

function CardTile({
  card,
  width,
  selected = false,
  muted = false,
  danger = false,
  onPress,
  testId,
}: {
  card: AuguryCardView;
  width: CardTileWidth;
  selected?: boolean;
  muted?: boolean;
  danger?: boolean;
  onPress?: () => void;
  testId?: string;
}) {
  return (
    <div style={{ position: "relative", width }}>
      <GameCard
        model={card.model}
        onPress={onPress}
        unavailable={muted}
        selection={danger ? "danger" : selected ? "highlighted" : undefined}
        testId={testId}
      />
    </div>
  );
}

function TransitionArrow({ layout }: { layout: "mobile" | "desktop" }) {
  return (
    <span
      data-augury-transition-arrow=""
      style={{
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        fontSize: layout === "desktop" ? 32 : 24,
      }}
    >
      <StandaloneGlyph glyph={GLYPHS.arrowRightFilled} color="white" />
    </span>
  );
}

function Transition({
  before,
  after,
  layout,
}: {
  before: AuguryCardView;
  after: AuguryCardView;
  layout: "mobile" | "desktop";
}) {
  const width =
    layout === "desktop"
      ? "min(240px, 40cqw, 64cqh)"
      : "min(124px, 38cqw, 58cqh)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-s"),
      }}
    >
      <CardTile card={before} width={width} muted />
      <TransitionArrow layout={layout} />
      <CardTile card={after} width={width} selected />
    </div>
  );
}

function DuplicateCards({
  card,
  layout,
}: {
  card: AuguryCardView;
  layout: "mobile" | "desktop";
}) {
  const width =
    layout === "desktop"
      ? "min(300px, 72cqw, 62cqh)"
      : "min(210px, 72cqw, 56cqh)";
  return (
    <div style={{ position: "relative", width, aspectRatio: "4 / 5" }}>
      <div
        aria-hidden="true"
        style={{ position: "absolute", top: 0, right: 0, width: "80%" }}
      >
        <GameCard model={card.model} />
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, width: "80%" }}>
        <GameCard model={card.model} />
      </div>
    </div>
  );
}

function dreamsignSize(count: number, layout: "mobile" | "desktop"): number {
  if (layout === "desktop") return count === 1 ? 205 : 150;
  return count === 1 ? 128 : 88;
}

function DreamsignChoiceGrid({
  count,
  layout,
  children,
}: {
  count: number;
  layout: "mobile" | "desktop";
  children: ReactNode;
}) {
  const columns =
    layout === "desktop" ? Math.max(1, count) : Math.min(2, Math.max(1, count));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${String(columns)}, auto)`,
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-s"),
      }}
    >
      {children}
    </div>
  );
}

function DreamsignRow({
  dreamsigns,
  layout,
}: {
  dreamsigns: readonly DreamsignData[];
  layout: "mobile" | "desktop";
}) {
  const size = dreamsignSize(dreamsigns.length, layout);
  return (
    <DreamsignChoiceGrid count={dreamsigns.length} layout={layout}>
      {dreamsigns.map((dreamsign) => (
        <div key={dreamsign.id} style={{ width: size, height: size }}>
          <Dreamsign
            dreamsign={dreamsign}
            testid={`cumulus-augury-dreamsign-${dreamsign.id}`}
          />
        </div>
      ))}
    </DreamsignChoiceGrid>
  );
}

function SiteRewardVisual({ model }: { model: DreamscapeSiteModel }) {
  return (
    <div
      data-augury-site-preview=""
      style={{ position: "relative", width: 220, height: 220 }}
    >
      <SiteNode
        model={model}
        motion={false}
        presentation="reward"
        onSelect={() => undefined}
      />
    </div>
  );
}
