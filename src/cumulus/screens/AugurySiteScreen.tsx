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
import {
  GlassPanel,
  type GlassPanelTextSegment,
} from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import { GuideGallerySiteLayout } from "./GuideGallerySiteLayout";

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

export interface AuguryDreamsignChoiceView {
  id: string;
  dreamsign: DreamsignData;
}

export type AuguryOfferVisualView =
  | { kind: "cards"; cards: readonly AuguryCardView[] }
  | { kind: "cardChoices"; choices: readonly AuguryCardChoiceView[]; doubled: boolean }
  | { kind: "beforeAfter"; pairs: readonly { id: string; before: AuguryCardView; after: AuguryCardView }[] }
  | { kind: "purge"; card: AuguryCardView }
  | { kind: "purgeReplace"; removed: AuguryCardView; choices: readonly AuguryCardChoiceView[] }
  | { kind: "duplicate"; card: AuguryCardView }
  | { kind: "duplicateChoices"; choices: readonly AuguryCardChoiceView[] }
  | { kind: "dreamsigns"; dreamsigns: readonly DreamsignData[] }
  | { kind: "dreamsignChoices"; choices: readonly AuguryDreamsignChoiceView[] }
  | { kind: "site"; model: DreamscapeSiteModel }
  | { kind: "mixed"; cards: readonly AuguryCardView[]; dreamsigns: readonly DreamsignData[] };

export interface AuguryOfferView {
  id: string;
  headline: string;
  subtitle: string | readonly GlassPanelTextSegment[];
  requiresSelection: boolean;
  tile: OfferTileModel;
  visual: AuguryOfferVisualView;
}

export interface AugurySiteView {
  siteId: string;
  scene: ArtRef | null;
  encounterSignature: string | null;
  guide: AuguryGuideView;
  offers: readonly AuguryOfferView[];
  unavailableMessage: string | null;
}

export type AuguryChoiceResult = { ok: true } | { ok: false; message: string };

export interface AugurySiteScreenProps {
  view: AugurySiteView;
  onInspectOffer?: (offerId: string) => void;
  onChoose: (offerId: string, choiceId: string | null) => AuguryChoiceResult;
  onClose: () => void;
}

function requiresWideDesktopDetail(
  visual: AuguryOfferVisualView,
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

export function AugurySiteScreen({
  view,
  onInspectOffer,
  onChoose,
  onClose,
}: AugurySiteScreenProps) {
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

  const inspectOffer = useCallback((offer: AuguryOfferView) => {
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

  const confirmOffer = useCallback((offer: AuguryOfferView) => {
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
                  data-augury-offer-row=""
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
                        testId={`cumulus-augury-offer-${offer.id}`}
                      />
                    </div>
                  ))}
                </div>
                <GlassButton
                  label="Decline Offer"
                  disabled={committingOfferId !== null}
                  onPress={onClose}
                  testId="cumulus-augury-decline"
                />
              </motion.div>
            ) : (
              <motion.div key="unavailable" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} style={{ pointerEvents: "auto" }}>
                <GlassButton label="Walk On" onPress={onClose} testId="cumulus-augury-unavailable-exit" />
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
  offer: AuguryOfferView;
  layout: "mobile" | "desktop";
  selectedChoiceId?: string;
  disabled: boolean;
  errorMessage: string | null;
  onSelect: (offerId: string, choiceId: string) => void;
  onChooseAgain: () => void;
  onConfirm: (offer: AuguryOfferView) => void;
}) {
  const confirmDisabled = disabled || (offer.requiresSelection && selectedChoiceId === undefined);
  return (
    <article
      data-testid="cumulus-augury-detail"
      data-offer-id={offer.id}
      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, pointerEvents: "auto" }}
    >
      <GlassPanel
        title={offer.headline}
        {...(typeof offer.subtitle === "string"
          ? { subtitle: offer.subtitle }
          : { structuredSubtitle: offer.subtitle })}
        headerSpacing="medium"
        footer={
          <div
            data-augury-actions=""
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
            <GlassButton label="Choose Again" placement="onGlass" disabled={disabled} onPress={onChooseAgain} testId="cumulus-augury-choose-again" />
            <GlassButton label="Confirm" variant="accent" placement="onGlass" disabled={confirmDisabled} onPress={() => onConfirm(offer)} testId={`cumulus-augury-confirm-${offer.id}`} />
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
            <p role="status" data-testid="cumulus-augury-error" style={{ margin: 0, color: token("--danger"), font: token("--t-body"), textAlign: "center" }}>
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
  visual: AuguryOfferVisualView;
  layout: "mobile" | "desktop";
  selectedChoiceId?: string;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  const choices = (
    items: readonly AuguryCardChoiceView[],
    selectedBadge?: string,
  ) => (
    <CardChoices
      offerId={offerId}
      choices={items}
      layout={layout}
      selectedChoiceId={selectedChoiceId}
      selectedBadge={selectedBadge}
      onSelect={onSelect}
    />
  );
  switch (visual.kind) {
    case "cards":
      return <CardRow cards={visual.cards} layout={layout} />;
    case "cardChoices":
      return choices(visual.choices, visual.doubled ? "2x" : undefined);
    case "beforeAfter":
      return (
        <div style={{ display: "grid", gap: token("--space-4") }}>
          {visual.pairs.map((pair) => (
            <Transition key={pair.id} before={pair.before} after={pair.after} layout={layout} />
          ))}
        </div>
      );
    case "purge":
      return <CardRow cards={[visual.card]} layout={layout} tone="danger" />;
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
              <div key={choice.id} data-augury-dreamsign-choice="" data-selected={selected ? "true" : "false"} style={{ position: "relative", padding: token("--space-2"), borderRadius: token("--radius-panel"), border: `4px solid ${selected ? token("--accent-bright") : "transparent"}`, boxShadow: selected ? token("--glow-accent-soft") : undefined }}>
                <Dreamsign dreamsign={choice.dreamsign} sizePx={dreamsignSize(visual.choices.length, layout)} onPress={() => onSelect(offerId, choice.id)} testid={`cumulus-augury-choice-${choice.id}`} />
                {selected && (
                  <span aria-hidden="true" data-augury-dreamsign-selection-marker="" style={{ position: "absolute", top: token("--space-2"), right: token("--space-2"), width: 36, height: 36, borderRadius: token("--radius-pill"), display: "grid", placeItems: "center", color: token("--text-on-accent"), background: token("--accent-bright"), boxShadow: token("--shadow-md"), pointerEvents: "none" }}>
                    <GlowIcon iconClass={GLYPHS.check} color="white" size="24px" />
                  </span>
                )}
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
            fit="mixed-reward"
          />
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
  const columns = layout === "desktop" ? Math.max(1, count) : Math.min(2, Math.max(1, count));
  if (columns <= 1) return "one";
  if (columns === 2) return "two";
  if (columns === 3) return "three";
  if (columns === 4) return "four";
  return "five";
}

function CardChoices({ offerId, choices, layout, fit = "choice", columns = cardGridColumns(choices.length, layout), selectedChoiceId, selectedBadge, onSelect }: { offerId: string; choices: readonly AuguryCardChoiceView[]; layout: "mobile" | "desktop"; fit?: CardChoiceGridSiteFit; columns?: CardChoiceGridColumns; selectedChoiceId?: string; selectedBadge?: string; onSelect: (offerId: string, choiceId: string) => void }) {
  return (
    <CardChoiceGrid
      cards={choices.map((choice) => ({
        entryId: choice.id,
        model: choice.card.model,
        selected: selectedChoiceId === choice.id,
        selectionColor: "accent-bright",
        quantityBadge: selectedChoiceId === choice.id ? selectedBadge : undefined,
        testId: `cumulus-augury-choice-${choice.id}`,
      }))}
      columns={columns}
      layout={{ kind: "site", viewport: layout, fit }}
      onCardPress={(choiceId) => onSelect(offerId, choiceId)}
    />
  );
}

function CardRow({ cards, layout, fit = "choice", tone = "default" }: { cards: readonly AuguryCardView[]; layout: "mobile" | "desktop"; fit?: CardChoiceGridSiteFit; tone?: "default" | "danger" }) {
  return (
    <CardChoiceGrid
      cards={cards.map((card) => ({
        entryId: card.id,
        model: card.model,
        selected: tone === "danger",
        selectionColor: tone === "danger" ? "danger" : undefined,
      }))}
      columns={cardGridColumns(cards.length, layout)}
      layout={{ kind: "site", viewport: layout, fit }}
    />
  );
}

function CardTile({ card, width, selected = false, muted = false, danger = false, onActivate, testId }: { card: AuguryCardView; width: CardTileWidth; selected?: boolean; muted?: boolean; danger?: boolean; onActivate?: () => void; testId?: string }) {
  return (
    <div style={{ position: "relative", width }}>
      <GameCard model={card.model} onActivate={onActivate} unavailable={muted} selected={selected || danger} selectionColor={danger ? "danger" : "accent-bright"} testId={testId} />
    </div>
  );
}

function TransitionArrow({ layout }: { layout: "mobile" | "desktop" }) {
  return <span data-augury-transition-arrow="" style={{ display: "grid", placeItems: "center", flexShrink: 0 }}><GlowIcon iconClass={GLYPHS.arrowRightFilled} color="white" size={layout === "desktop" ? "32px" : "24px"} /></span>;
}

function Transition({ before, after, layout }: { before: AuguryCardView; after: AuguryCardView; layout: "mobile" | "desktop" }) {
  const width = layout === "desktop" ? "min(240px, 40cqw, 64cqh)" : "min(124px, 38cqw, 58cqh)";
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: token("--space-4") }}><CardTile card={before} width={width} muted /><TransitionArrow layout={layout} /><CardTile card={after} width={width} selected /></div>;
}

function TradeCards({ offerId, removed, choices, layout, selectedChoiceId, onSelect }: { offerId: string; removed: AuguryCardView; choices: readonly AuguryCardChoiceView[]; layout: "mobile" | "desktop"; selectedChoiceId?: string; onSelect: (offerId: string, choiceId: string) => void }) {
  const removedWidth = layout === "desktop" ? "min(190px, 18cqw, 55cqh)" : "min(96px, 23cqw, 58cqh)";
  return (
    <div data-augury-trade-layout={layout} style={{ display: "grid", gridTemplateColumns: "auto auto minmax(0, 1fr)", alignItems: "center", justifyContent: "center", gap: layout === "desktop" ? token("--space-5") : token("--space-3"), minWidth: 0 }}>
      <CardTile card={removed} width={removedWidth} danger />
      <TransitionArrow layout={layout} />
      <CardChoices offerId={offerId} choices={choices} layout={layout} fit="compact-choice" columns={cardGridColumns(choices.length, layout)} selectedChoiceId={selectedChoiceId} onSelect={onSelect} />
    </div>
  );
}

function DuplicateCards({ card, layout }: { card: AuguryCardView; layout: "mobile" | "desktop" }) {
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
  return <div data-augury-site-preview="" style={{ position: "relative", width: 220, height: 220 }}><SiteNode model={model} motion={false} presentation="reward" onSelect={() => undefined} /></div>;
}
