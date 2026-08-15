import { meaning, tx, type LocalizedString } from "@trox/runtime";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useState, type ReactNode } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { CardChangePair } from "../components/card/CardChangePair";
import {
  CardChoiceGrid,
  type CardChoiceGridColumns,
  type CardChoiceGridSiteFit,
} from "../components/card/CardChoiceGrid";
import { GlassButton } from "../components/controls/GlassButton";
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
import type { LocalizedDreamsign } from "../components/hud/Dreamsign";
import type { AuguryArchetypeData } from "../../types/augury-data";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import {
  SiteLayout,
  type SiteLayoutGuideView,
} from "../components/layout/SiteLayout";
import { debugRerollCornerStyle } from "../primitives/chrome-geometry";
import { useIsDesktop } from "../primitives/use-is-desktop";
import type { SiteId } from "../../types/identifiers";
import type { OfferId } from "../../types/identifiers";
import type { ChoiceId } from "../../types/identifiers";
import type { AuguryCardViewId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";

export type AuguryGuideView = SiteLayoutGuideView;

export interface AuguryCardView {
  id: AuguryCardViewId;
  model: GameCardModel;
}

export interface AuguryCardChoiceView {
  id: ChoiceId;
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
        id: DeckEntryId;
        before: AuguryCardView;
        after: AuguryCardView;
      }[];
    }
  | { kind: "purge"; card: AuguryCardView }
  | { kind: "duplicate"; card: AuguryCardView }
  | { kind: "duplicateChoices"; choices: readonly AuguryCardChoiceView[] }
  | { kind: "dreamsigns"; dreamsigns: readonly LocalizedDreamsign[] }
  | { kind: "site"; model: DreamscapeSiteModel }
  | {
      kind: "mixed";
      cards: readonly AuguryCardView[];
      dreamsigns: readonly LocalizedDreamsign[];
    };

export interface AuguryOfferView {
  id: OfferId;
  requiresSelection: boolean;
  tile: OfferTileModel;
  presentation: AuguryArchetypeData["presentation"];
  visual: AuguryOfferVisualView;
}

export interface AugurySiteView {
  siteId: SiteId;
  scene: ArtRef | null;
  encounterSignature: string | null;
  guide: AuguryGuideView;
  offers: readonly AuguryOfferView[];
  unavailableMessage: LocalizedString | null;
  /** TOML-authored encounter rule; absent synthetic fixtures default to allowed. */
  allowDecline?: boolean;
}

export type AuguryChoiceResult =
  { ok: true } | { ok: false; message: LocalizedString };

export interface AugurySiteScreenProps {
  view: AugurySiteView;
  /** Requests a shared debug reroll of both Augury offers. */
  onReroll?: () => void;
  onInspectOffer?: (offerId: OfferId) => void;
  onChoose: (offerId: OfferId, choiceId: ChoiceId | null) => AuguryChoiceResult;
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
  const layout = isDesktop ? "desktop" : "mobile";
  const [selectedChoices, setSelectedChoices] = useState<
    ReadonlyMap<OfferId, ChoiceId>
  >(new Map());
  const [inspectedOfferId, setInspectedOfferId] = useState<OfferId | null>(
    null,
  );
  const [committingOfferId, setCommittingOfferId] = useState<OfferId | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<LocalizedString | null>(
    null,
  );
  const inspectedOffer =
    view.offers.find((offer) => offer.id === inspectedOfferId) ?? null;
  const wideDesktopDetail =
    inspectedOffer !== null && requiresWideDesktopDetail(inspectedOffer.visual);
  const available = view.offers.length === 2;
  const guide = available
    ? view.guide
    : {
        ...view.guide,
        line:
          view.unavailableMessage ??
          tx(
            "The visions are clouded. Walk on for now.",
            "[augury] Unavailable guide line.",
          ),
      };

  const selectChoice = useCallback((offerId: OfferId, choiceId: ChoiceId) => {
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
    <div
      data-testid="cumulus-augury-site-screen"
      style={{ position: "fixed", inset: 0 }}
    >
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{
          ...guide,
          presence: inspectedOffer === null ? "speaking" : "portrait-only",
        }}
        composition={
          inspectedOffer === null
            ? "balanced-revelation"
            : "content-led-expanded-revelation"
        }
      >
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
                    "[ui] Action declining the current site offer and leaving without its reward.",
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
                label={tx("Walk On", "[augury] Site walk on.")}
                onPress={onClose}
                testId="cumulus-augury-unavailable-exit"
              />
            </motion.div>
          )}
        </section>
      </SiteLayout>
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
            label={tx("Reroll Augury offers", "[augury] Reroll offers.")}
            onPress={onReroll}
            testId="reroll-augury-offers"
          />
        </div>
      )}
    </div>
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
  selectedChoiceId?: ChoiceId;
  disabled: boolean;
  errorMessage: LocalizedString | null;
  onSelect: (offerId: OfferId, choiceId: ChoiceId) => void;
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
        title={auguryOfferHeadline(offer.tile, offer.presentation)}
        subtitle={offerTileDescription(offer.tile, offer.presentation)}
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
                "[augury] Site choose again.",
              )}
              placement="onGlass"
              disabled={disabled}
              onPress={onChooseAgain}
              testId="cumulus-augury-choose-again"
            />
            <GlassButton
              label={tx(
                "Confirm",
                "[ui] Action confirming the current selection.",
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
  offerId: OfferId;
  visual: AuguryOfferVisualView;
  layout: "mobile" | "desktop";
  selectedChoiceId?: ChoiceId;
  onSelect: (offerId: OfferId, choiceId: ChoiceId) => void;
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
            <CardChangePair
              key={pair.id}
              model={{
                changeId: pair.id,
                kind: "replacement",
                before: {
                  entryId: parseDeckEntryId(pair.before.id),
                  card: pair.before.model,
                },
                after: {
                  entryId: parseDeckEntryId(pair.after.id),
                  card: pair.after.model,
                },
              }}
              reveal="complete"
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
  offerId: OfferId;
  choices: readonly AuguryCardChoiceView[];
  layout: "mobile" | "desktop";
  fit?: CardChoiceGridSiteFit;
  columns?: CardChoiceGridColumns;
  selectedChoiceId?: ChoiceId;
  selectedCopyCount?: number;
  onSelect: (offerId: OfferId, choiceId: ChoiceId) => void;
}) {
  return (
    <CardChoiceGrid<ChoiceId>
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
        entryId: parseDeckEntryId(card.id),
        model: card.model,
        selection: tone === "danger" ? "danger" : undefined,
      }))}
      columns={cardGridColumns(cards.length, layout)}
      layout={{ kind: "site", viewport: layout, fit }}
    />
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
  dreamsigns: readonly LocalizedDreamsign[];
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
