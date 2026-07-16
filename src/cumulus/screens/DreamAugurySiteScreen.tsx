import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import type { OfferTileModel } from "../components/controls/OfferTile";
import {
  OfferTile,
  OFFER_TILE_COMPACT_SIZE,
} from "../components/controls/OfferTile";
import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../components/dreamscape/SiteNode";
import { Dreamsign } from "../components/hud/Dreamsign";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { GuideGallerySiteLayout } from "./GuideGallerySiteLayout";

export interface DreamAuguryGuideView {
  id: string;
  name: string;
  line: string;
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
  | { kind: "cardChoices"; choices: readonly DreamAuguryCardChoiceView[]; doubled: boolean }
  | { kind: "beforeAfter"; pairs: readonly { id: string; before: DreamAuguryCardView; after: DreamAuguryCardView }[] }
  | { kind: "purge"; card: DreamAuguryCardView }
  | { kind: "purgeReplace"; removed: DreamAuguryCardView; choices: readonly DreamAuguryCardChoiceView[] }
  | { kind: "duplicate"; card: DreamAuguryCardView }
  | { kind: "duplicateChoices"; choices: readonly DreamAuguryCardChoiceView[] }
  | { kind: "dreamsigns"; dreamsigns: readonly DreamsignData[] }
  | { kind: "dreamsignChoices"; choices: readonly DreamAuguryDreamsignChoiceView[] }
  | { kind: "site"; model: DreamscapeSiteModel }
  | { kind: "mixed"; cards: readonly DreamAuguryCardView[]; dreamsigns: readonly DreamsignData[] };

export interface DreamAuguryOfferView {
  id: string;
  headline: string;
  subtitle: string;
  requiresSelection: boolean;
  tile: OfferTileModel;
  visual: DreamAuguryOfferVisualView;
}

export interface DreamAugurySiteView {
  siteId: string;
  scene: ArtRef | null;
  encounterSignature: string | null;
  guide: DreamAuguryGuideView;
  offers: readonly DreamAuguryOfferView[];
  unavailableMessage: string | null;
}

export type DreamAuguryChoiceResult = { ok: true } | { ok: false; message: string };

export interface DreamAugurySiteScreenProps {
  view: DreamAugurySiteView;
  onInspectOffer?: (offerId: string) => void;
  onChoose: (offerId: string, choiceId: string | null) => DreamAuguryChoiceResult;
  onClose: () => void;
}

function requiresWideDesktopDetail(
  visual: DreamAuguryOfferVisualView,
): boolean {
  switch (visual.kind) {
    case "cards":
      return visual.cards.length > 2;
    case "cardChoices":
      return visual.choices.length > 2;
    case "beforeAfter":
      return visual.pairs.length * 2 > 2;
    case "purgeReplace":
      return true;
    case "duplicateChoices":
      return visual.choices.length > 2;
    case "mixed":
      return visual.cards.length > 2;
    case "purge":
    case "duplicate":
    case "dreamsigns":
    case "dreamsignChoices":
    case "site":
      return false;
  }
}

export function DreamAugurySiteScreen({
  view,
  onInspectOffer,
  onChoose,
  onClose,
}: DreamAugurySiteScreenProps) {
  const reduceMotion = useReducedMotion();
  const [selectedChoices, setSelectedChoices] = useState<ReadonlyMap<string, string>>(new Map());
  const [inspectedOfferId, setInspectedOfferId] = useState<string | null>(null);
  const [committingOfferId, setCommittingOfferId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inspectedOffer = view.offers.find((offer) => offer.id === inspectedOfferId) ?? null;
  const wideDesktopDetail = inspectedOffer !== null
    && requiresWideDesktopDetail(inspectedOffer.visual);
  const available = view.offers.length === 2;
  const guide = available
    ? view.guide
    : {
        ...view.guide,
        line: view.unavailableMessage ?? "The visions are clouded. Walk on for now.",
      };

  const selectChoice = useCallback((offerId: string, choiceId: string) => {
    setErrorMessage(null);
    setSelectedChoices((current) => new Map(current).set(offerId, choiceId));
  }, []);

  const inspectOffer = useCallback((offer: DreamAuguryOfferView) => {
    setErrorMessage(null);
    setInspectedOfferId(offer.id);
    onInspectOffer?.(offer.id);
  }, [onInspectOffer]);

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

  const confirmOffer = useCallback((offer: DreamAuguryOfferView) => {
    const result = onChoose(offer.id, selectedChoices.get(offer.id) ?? null);
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setCommittingOfferId(offer.id);
  }, [onChoose, selectedChoices]);

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
      screenTestId="cumulus-dream-augury-site-screen"
      guideArtTestId="cumulus-dream-augury-guide-art"
      speechAnchorTestId="cumulus-dream-augury-speech-anchor"
      speechBubbleTestId="cumulus-dream-augury-speech"
      renderGallery={(layout) => (
        <section
          data-dream-augury-layout={layout}
          data-augury-phase={inspectedOffer === null ? "comparison" : "detail"}
          data-augury-desktop-placement={
            inspectedOffer === null ? undefined : "center"
          }
          data-encounter-signature={view.encounterSignature ?? undefined}
          style={{
            width: "100%",
            maxWidth:
              layout === "desktop"
                ? wideDesktopDetail
                  ? 1120
                  : 820
                : "100%",
            justifySelf:
              layout === "desktop" && inspectedOffer !== null
                ? "center"
                : undefined,
            height: "100%",
            minHeight: 0,
            display: "grid",
            placeItems: "center",
            padding: layout === "desktop" ? token("--space-6") : token("--space-3"),
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
                style={{ width: "100%", height: "100%", minHeight: 0, pointerEvents: "auto" }}
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
                style={{ display: "grid", justifyItems: "center", gap: token("--space-5"), pointerEvents: "auto" }}
              >
                <div
                  data-dream-augury-offer-row=""
                  style={{
                    display: "flex",
                    width: layout === "mobile" ? "100%" : undefined,
                    maxWidth: "100%",
                    alignItems: "center",
                    justifyContent: layout === "desktop" ? "center" : "flex-start",
                    gap: layout === "desktop" ? token("--space-9") : token("--space-4"),
                    overflowX: layout === "mobile" ? "auto" : undefined,
                    paddingInline:
                      layout === "mobile"
                        ? `calc((100% - ${String(OFFER_TILE_COMPACT_SIZE)}px) / 2)`
                        : undefined,
                    boxSizing: "border-box",
                    scrollSnapType: layout === "mobile" ? "x mandatory" : undefined,
                  }}
                >
                  {view.offers.map((offer) => (
                    <div
                      key={offer.id}
                      style={{
                        flex: "0 0 auto",
                        scrollSnapAlign: layout === "mobile" ? "center" : undefined,
                      }}
                    >
                      <OfferTile
                        model={offer.tile}
                        size={layout === "desktop" ? "standard" : "compact"}
                        onPress={() => inspectOffer(offer)}
                        testId={`cumulus-dream-augury-offer-${offer.id}`}
                      />
                    </div>
                  ))}
                </div>
                <GlassButton
                  label="Decline Offer"
                  disabled={committingOfferId !== null}
                  onPress={onClose}
                  testId="cumulus-dream-augury-decline"
                />
              </motion.div>
            ) : (
              <motion.div key="unavailable" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} style={{ pointerEvents: "auto" }}>
                <GlassButton label="Walk On" onPress={onClose} testId="cumulus-dream-augury-unavailable-exit" />
              </motion.div>
            )}
        </section>
      )}
    />
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
  offer: DreamAuguryOfferView;
  layout: "mobile" | "desktop";
  selectedChoiceId?: string;
  disabled: boolean;
  errorMessage: string | null;
  onSelect: (offerId: string, choiceId: string) => void;
  onChooseAgain: () => void;
  onConfirm: (offer: DreamAuguryOfferView) => void;
}) {
  const confirmDisabled = disabled || (offer.requiresSelection && selectedChoiceId === undefined);
  return (
    <article
      data-testid="cumulus-dream-augury-detail"
      data-offer-id={offer.id}
      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, pointerEvents: "auto" }}
    >
      <GlassPanel
        title={offer.headline}
        subtitle={offer.subtitle}
        headerSpacing="medium"
        footer={
          <div
            data-dream-augury-actions=""
            style={{
              display: "flex",
              justifyContent: layout === "mobile" ? "center" : "flex-end",
              alignItems: "center",
              gap: token("--space-4"),
              padding: layout === "mobile"
                ? `0 ${token("--space-4")} ${token("--space-4")}`
                : `0 ${token("--space-8")} ${token("--space-6")}`,
            }}
          >
            <GlassButton label="Choose Again" placement="onGlass" disabled={disabled} onPress={onChooseAgain} testId="cumulus-dream-augury-choose-again" />
            <GlassButton label="Confirm" variant="accent" placement="onGlass" disabled={confirmDisabled} onPress={() => onConfirm(offer)} testId={`cumulus-dream-augury-confirm-${offer.id}`} />
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
            containerType: "size",
            display: "grid",
            placeItems: "center",
            gap: token("--space-4"),
            padding: layout === "desktop" ? token("--space-7") : token("--space-4"),
            boxSizing: "border-box",
          }}
        >
          <OfferDetailVisual offerId={offer.id} visual={offer.visual} layout={layout} selectedChoiceId={selectedChoiceId} onSelect={onSelect} />
          {errorMessage !== null && (
            <p role="status" data-testid="cumulus-dream-augury-error" style={{ margin: 0, color: token("--danger"), font: token("--t-body"), textAlign: "center" }}>
              {errorMessage}
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
  visual: DreamAuguryOfferVisualView;
  layout: "mobile" | "desktop";
  selectedChoiceId?: string;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  const directWidth = cardWidthForCount(1, layout);
  const choices = (items: readonly DreamAuguryCardChoiceView[]) => (
    <CardChoices
      offerId={offerId}
      choices={items}
      layout={layout}
      selectedChoiceId={selectedChoiceId}
      onSelect={onSelect}
    />
  );
  switch (visual.kind) {
    case "cards":
      return <CardRow cards={visual.cards} layout={layout} />;
    case "cardChoices":
      return choices(visual.choices);
    case "beforeAfter":
      return (
        <div style={{ display: "grid", gap: token("--space-4") }}>
          {visual.pairs.map((pair) => (
            <Transition key={pair.id} before={pair.before} after={pair.after} layout={layout} />
          ))}
        </div>
      );
    case "purge":
      return <CardTile card={visual.card} width={directWidth} danger />;
    case "purgeReplace":
      return (
        <TradeCards
          offerId={offerId}
          removed={visual.removed}
          choices={visual.choices}
          layout={layout}
          selectedChoiceId={selectedChoiceId}
          onSelect={onSelect}
        />
      );
    case "duplicate":
      return <DuplicateCards card={visual.card} layout={layout} />;
    case "duplicateChoices":
      return choices(visual.choices);
    case "dreamsigns":
      return <DreamsignRow dreamsigns={visual.dreamsigns} layout={layout} />;
    case "dreamsignChoices":
      return (
        <DreamsignChoiceGrid count={visual.choices.length} layout={layout}>
          {visual.choices.map((choice) => {
            const selected = selectedChoiceId === choice.id;
            return (
              <div key={choice.id} data-selected={selected ? "true" : "false"} style={{ padding: token("--space-2"), borderRadius: token("--radius-panel"), border: `1px solid ${selected ? token("--border-accent") : "transparent"}`, boxShadow: selected ? token("--glow-accent-soft") : undefined }}>
                <Dreamsign dreamsign={choice.dreamsign} sizePx={dreamsignSize(visual.choices.length, layout)} onPress={() => onSelect(offerId, choice.id)} testid={`cumulus-augury-choice-${choice.id}`} />
              </div>
            );
          })}
        </DreamsignChoiceGrid>
      );
    case "site":
      return <SiteRewardVisual model={visual.model} />;
    case "mixed":
      return (
        <div style={{ display: "grid", justifyItems: "center", gap: token("--space-5") }}>
          <CardRow
            cards={visual.cards}
            layout={layout}
            width={layout === "desktop" ? "min(160px, 24cqw, 34cqh)" : "min(96px, 38cqw, 24cqh)"}
          />
          <DreamsignRow dreamsigns={visual.dreamsigns} layout={layout} />
        </div>
      );
  }
}

type CardTileWidth = CSSProperties["width"];

/**
 * Complete desktop cards read in place at 240px. Container query units keep
 * that target whenever the detail body can hold it, then shrink the complete
 * set against both available width and height without introducing overflow.
 */
function cardWidthForCount(count: number, layout: "mobile" | "desktop"): string {
  if (layout === "desktop") {
    const widthShare = count <= 1 ? 72 : count === 2 ? 42 : count === 3 ? 29 : 23.5;
    return `min(240px, ${String(widthShare)}cqw, 64cqh)`;
  }
  const rows = count <= 2 ? 1 : 2;
  const maxWidth = count <= 1 ? 180 : 128;
  const widthShare = count <= 1 ? 72 : 40;
  const heightShare = rows === 1 ? 56 : 31;
  return `min(${String(maxWidth)}px, ${String(widthShare)}cqw, ${String(heightShare)}cqh)`;
}

function cardGridColumns(count: number, layout: "mobile" | "desktop"): number {
  return layout === "desktop" ? Math.max(1, count) : Math.min(2, Math.max(1, count));
}

function cardGridStyle(columns: number, width: CardTileWidth): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${String(columns)}, ${String(width)})`,
    justifyContent: "center",
    alignItems: "center",
    gap: token("--space-4"),
    minWidth: 0,
  };
}

function CardChoices({ offerId, choices, layout, width = cardWidthForCount(choices.length, layout), columns = cardGridColumns(choices.length, layout), selectedChoiceId, onSelect }: { offerId: string; choices: readonly DreamAuguryCardChoiceView[]; layout: "mobile" | "desktop"; width?: CardTileWidth; columns?: number; selectedChoiceId?: string; onSelect: (offerId: string, choiceId: string) => void }) {
  return (
    <div data-augury-card-grid-columns={columns} style={cardGridStyle(columns, width)}>
      {choices.map((choice) => (
        <CardTile key={choice.id} card={choice.card} width={width} selected={selectedChoiceId === choice.id} onActivate={() => onSelect(offerId, choice.id)} testId={`cumulus-augury-choice-${choice.id}`} />
      ))}
    </div>
  );
}

function CardRow({ cards, layout, width = cardWidthForCount(cards.length, layout) }: { cards: readonly DreamAuguryCardView[]; layout: "mobile" | "desktop"; width?: CardTileWidth }) {
  const columns = cardGridColumns(cards.length, layout);
  return <div data-augury-card-grid-columns={columns} style={cardGridStyle(columns, width)}>{cards.map((card) => <CardTile key={card.id} card={card} width={width} />)}</div>;
}

function CardTile({ card, width, selected = false, muted = false, danger = false, onActivate, testId }: { card: DreamAuguryCardView; width: CardTileWidth; selected?: boolean; muted?: boolean; danger?: boolean; onActivate?: () => void; testId?: string }) {
  return <div style={{ width }}><GameCard model={card.model} onActivate={onActivate} unavailable={muted} selected={selected || danger} selectionColor={danger ? "danger" : undefined} testId={testId} /></div>;
}

function TransitionArrow({ layout }: { layout: "mobile" | "desktop" }) {
  return <span data-augury-transition-arrow="" style={{ display: "grid", placeItems: "center", flexShrink: 0 }}><GlowIcon iconClass={GLYPHS.arrowRightFilled} color="white" size={layout === "desktop" ? "32px" : "24px"} /></span>;
}

function Transition({ before, after, layout }: { before: DreamAuguryCardView; after: DreamAuguryCardView; layout: "mobile" | "desktop" }) {
  const width = layout === "desktop" ? "min(240px, 40cqw, 64cqh)" : "min(124px, 38cqw, 58cqh)";
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: token("--space-4") }}><CardTile card={before} width={width} muted /><TransitionArrow layout={layout} /><CardTile card={after} width={width} selected /></div>;
}

function TradeCards({ offerId, removed, choices, layout, selectedChoiceId, onSelect }: { offerId: string; removed: DreamAuguryCardView; choices: readonly DreamAuguryCardChoiceView[]; layout: "mobile" | "desktop"; selectedChoiceId?: string; onSelect: (offerId: string, choiceId: string) => void }) {
  const removedWidth = layout === "desktop" ? "min(190px, 18cqw, 55cqh)" : "min(96px, 23cqw, 58cqh)";
  const choiceWidth = layout === "desktop" ? "min(178px, 15.5cqw, 52cqh)" : "min(74px, 18cqw, 27cqh)";
  return (
    <div data-augury-trade-layout={layout} style={{ display: "grid", gridTemplateColumns: "auto auto minmax(0, 1fr)", alignItems: "center", justifyContent: "center", gap: layout === "desktop" ? token("--space-5") : token("--space-3"), minWidth: 0 }}>
      <CardTile card={removed} width={removedWidth} danger />
      <TransitionArrow layout={layout} />
      <CardChoices offerId={offerId} choices={choices} layout={layout} width={choiceWidth} columns={layout === "desktop" ? choices.length : 2} selectedChoiceId={selectedChoiceId} onSelect={onSelect} />
    </div>
  );
}

function DuplicateCards({ card, layout }: { card: DreamAuguryCardView; layout: "mobile" | "desktop" }) {
  const width = layout === "desktop" ? "min(300px, 72cqw, 62cqh)" : "min(210px, 72cqw, 56cqh)";
  return <div style={{ position: "relative", width, aspectRatio: "4 / 5" }}><div aria-hidden="true" style={{ position: "absolute", top: 0, right: 0, width: "80%" }}><GameCard model={card.model} /></div><div style={{ position: "absolute", bottom: 0, left: 0, width: "80%" }}><GameCard model={card.model} /></div></div>;
}

function dreamsignSize(count: number, layout: "mobile" | "desktop"): number {
  if (layout === "desktop") return count === 1 ? 205 : 150;
  return count === 1 ? 128 : 88;
}

function DreamsignChoiceGrid({ count, layout, children }: { count: number; layout: "mobile" | "desktop"; children: ReactNode }) {
  const columns = layout === "desktop" ? Math.max(1, count) : Math.min(2, Math.max(1, count));
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${String(columns)}, auto)`, alignItems: "center", justifyContent: "center", gap: token("--space-4") }}>{children}</div>;
}

function DreamsignRow({ dreamsigns, layout }: { dreamsigns: readonly DreamsignData[]; layout: "mobile" | "desktop" }) {
  return <DreamsignChoiceGrid count={dreamsigns.length} layout={layout}>{dreamsigns.map((dreamsign) => <Dreamsign key={dreamsign.id} dreamsign={dreamsign} sizePx={dreamsignSize(dreamsigns.length, layout)} testid={`cumulus-augury-dreamsign-${dreamsign.id}`} />)}</DreamsignChoiceGrid>;
}

function SiteRewardVisual({ model }: { model: DreamscapeSiteModel }) {
  return <div data-augury-site-preview="" style={{ position: "relative", width: 156, height: 156 }}><SiteNode model={model} motion={false} onSelect={() => undefined} /></div>;
}
