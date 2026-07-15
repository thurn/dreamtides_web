import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import type { OfferTileModel } from "../components/controls/OfferTile";
import { OfferTile } from "../components/controls/OfferTile";
import { Dreamsign } from "../components/hud/Dreamsign";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import type { Glyph } from "../primitives/glyph";
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
  | { kind: "site"; siteName: string; glyph: Glyph }
  | { kind: "mixed"; cards: readonly DreamAuguryCardView[]; dreamsigns: readonly DreamsignData[] };

export interface DreamAuguryOfferView {
  id: string;
  headline: string;
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
      desktopComposition="split"
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
          data-encounter-signature={view.encounterSignature ?? undefined}
          style={{
            width: "100%",
            maxWidth: layout === "desktop" ? 820 : "100%",
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
                style={{ width: "100%", minHeight: 0, pointerEvents: "auto" }}
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: layout === "desktop" ? token("--space-9") : token("--space-4") }}>
                  {view.offers.map((offer) => (
                    <OfferTile
                      key={offer.id}
                      model={offer.tile}
                      size={layout === "desktop" ? "standard" : "compact"}
                      onPress={() => inspectOffer(offer)}
                      testId={`cumulus-dream-augury-offer-${offer.id}`}
                    />
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
      style={{ width: "100%", maxHeight: "100%", minWidth: 0, pointerEvents: "auto" }}
    >
      <GlassPanel
        title={offer.headline}
        headerAlign="center"
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
            minHeight: layout === "desktop" ? 320 : 220,
            maxHeight: layout === "desktop" ? "min(56vh, 590px)" : "44dvh",
            overflow: "auto",
            display: "grid",
            placeItems: "center",
            gap: token("--space-4"),
            padding: layout === "desktop" ? token("--space-7") : token("--space-4"),
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
  const directWidth = layout === "desktop" ? 260 : 180;
  const groupWidth = layout === "desktop" ? 190 : 122;
  const dreamsignSize = layout === "desktop" ? 205 : 128;
  const choices = (items: readonly DreamAuguryCardChoiceView[]) => (
    <CardChoices offerId={offerId} choices={items} width={groupWidth} selectedChoiceId={selectedChoiceId} onSelect={onSelect} />
  );
  switch (visual.kind) {
    case "cards":
      return <CardRow cards={visual.cards} width={visual.cards.length === 1 ? directWidth : groupWidth} />;
    case "cardChoices":
      return choices(visual.choices);
    case "beforeAfter":
      return (
        <div style={{ display: "grid", gap: token("--space-4") }}>
          {visual.pairs.map((pair) => (
            <Transition key={pair.id} before={pair.before} after={pair.after} width={groupWidth} />
          ))}
        </div>
      );
    case "purge":
      return <CardTile card={visual.card} width={directWidth} danger />;
    case "purgeReplace":
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: token("--space-4") }}>
          <CardTile card={visual.removed} width={groupWidth} danger />
          <GlowIcon iconClass={GLYPHS.chevronRight} color="accent-bright" size="32px" />
          {choices(visual.choices)}
        </div>
      );
    case "duplicate":
      return <DuplicateCards card={visual.card} width={directWidth} />;
    case "duplicateChoices":
      return choices(visual.choices);
    case "dreamsigns":
      return <DreamsignRow dreamsigns={visual.dreamsigns} size={dreamsignSize} />;
    case "dreamsignChoices":
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: token("--space-4") }}>
          {visual.choices.map((choice) => {
            const selected = selectedChoiceId === choice.id;
            return (
              <div key={choice.id} data-selected={selected ? "true" : "false"} style={{ padding: token("--space-2"), borderRadius: token("--radius-panel"), border: `1px solid ${selected ? token("--border-accent") : "transparent"}`, boxShadow: selected ? token("--glow-accent-soft") : undefined }}>
                <Dreamsign dreamsign={choice.dreamsign} sizePx={dreamsignSize} onPress={() => onSelect(offerId, choice.id)} testid={`cumulus-augury-choice-${choice.id}`} />
              </div>
            );
          })}
        </div>
      );
    case "site":
      return <SiteRewardVisual siteName={visual.siteName} glyph={visual.glyph} />;
    case "mixed":
      return (
        <div style={{ display: "grid", justifyItems: "center", gap: token("--space-5") }}>
          <CardRow cards={visual.cards} width={groupWidth} />
          <DreamsignRow dreamsigns={visual.dreamsigns} size={dreamsignSize} />
        </div>
      );
  }
}

function CardChoices({ offerId, choices, width, selectedChoiceId, onSelect }: { offerId: string; choices: readonly DreamAuguryCardChoiceView[]; width: number; selectedChoiceId?: string; onSelect: (offerId: string, choiceId: string) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: token("--space-4") }}>
      {choices.map((choice) => (
        <CardTile key={choice.id} card={choice.card} width={width} selected={selectedChoiceId === choice.id} onActivate={() => onSelect(offerId, choice.id)} testId={`cumulus-augury-choice-${choice.id}`} />
      ))}
    </div>
  );
}

function CardRow({ cards, width }: { cards: readonly DreamAuguryCardView[]; width: number }) {
  return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: token("--space-4") }}>{cards.map((card) => <CardTile key={card.id} card={card} width={width} />)}</div>;
}

function CardTile({ card, width, selected = false, muted = false, danger = false, onActivate, testId }: { card: DreamAuguryCardView; width: number; selected?: boolean; muted?: boolean; danger?: boolean; onActivate?: () => void; testId?: string }) {
  return <div style={{ width }}><GameCard model={card.model} onActivate={onActivate} unavailable={muted} selected={selected || danger} selectionColor={danger ? "danger" : undefined} testId={testId} /></div>;
}

function Transition({ before, after, width }: { before: DreamAuguryCardView; after: DreamAuguryCardView; width: number }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: token("--space-4") }}><CardTile card={before} width={width} muted /><GlowIcon iconClass={GLYPHS.chevronRight} color="accent-bright" size="32px" /><CardTile card={after} width={width} selected /></div>;
}

function DuplicateCards({ card, width }: { card: DreamAuguryCardView; width: number }) {
  return <div style={{ position: "relative", width: width * 1.35, height: width * 1.52 }}><div aria-hidden="true" style={{ position: "absolute", top: 0, right: 0, width }}><GameCard model={card.model} /></div><div style={{ position: "absolute", bottom: 0, left: 0, width }}><GameCard model={card.model} /></div></div>;
}

function DreamsignRow({ dreamsigns, size }: { dreamsigns: readonly DreamsignData[]; size: number }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: token("--space-4") }}>{dreamsigns.map((dreamsign) => <Dreamsign key={dreamsign.id} dreamsign={dreamsign} sizePx={size} testid={`cumulus-augury-dreamsign-${dreamsign.id}`} />)}</div>;
}

function SiteRewardVisual({ siteName, glyph }: { siteName: string; glyph: Glyph }) {
  return <div style={{ display: "grid", justifyItems: "center", gap: token("--space-5") }}><div style={{ width: 156, height: 156, borderRadius: token("--radius-pill"), border: `1px solid ${token("--border-accent")}`, display: "grid", placeItems: "center", boxShadow: token("--glow-accent-soft") }}><GlowIcon iconClass={glyph} color="accent-bright" size="72px" shadow title={siteName} /></div><span style={{ font: token("--t-lead") }}>{siteName}</span></div>;
}
