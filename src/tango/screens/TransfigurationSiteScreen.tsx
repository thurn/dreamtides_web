// TransfigurationSiteScreen — Durgan Forgehammer's standard desktop forge.

import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import { IconButton } from "../components/controls/IconButton";
import {
  TransfigurationFormButton,
  TRANSFIGURATION_FORM_GLYPHS,
} from "../components/controls/TransfigurationFormButton";
import { EssenceValue } from "../components/hud/EssenceValue";
import { glassSurfaceStyle } from "../internal/glass-surface";
import type { ArtRef } from "../primitives/art";
import type { TangoColor } from "../primitives/color";
import { GLYPHS } from "../primitives/glyph";
import { Pressable } from "../primitives/Pressable";
import { token } from "../primitives/tokens";
import type { TransfigurationType } from "../../types/quest";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";

export type TransfigurationGuideView = GuideGalleryGuideView;

export interface TransfigurationFormView {
  /** Named forge form committed to the concrete deck entry. */
  type: TransfigurationType;
  /** Player-facing description of the resulting rules change. */
  description: string;
  /** Persisted reconstruction payload passed back to the mutation. */
  effectDetails: Record<string, unknown>;
  /** Stable quoted essence cost for this visit. */
  essenceCost: number;
  /** Whether the current wallet can pay this quoted cost. */
  affordable: boolean;
  /** Data-driven transfiguration color used for the option edge and card ring. */
  accent: TangoColor;
  /** The transformed card plus its marked transfiguration display. */
  previewModel: GameCardModel;
}

export interface TransfigurationCandidateView {
  /** Concrete deck-entry id; duplicate cards remain independent choices. */
  entryId: string;
  /** Unmodified card shown in the three-card picker. */
  model: GameCardModel;
  /** Eligible forms in persisted offer order. */
  forms: TransfigurationFormView[];
}

export interface TransfigurationSiteView {
  siteId: string;
  scene: ArtRef | null;
  guide: TransfigurationGuideView;
  ready: boolean;
  alreadyAccepted: boolean;
  candidates: readonly TransfigurationCandidateView[];
}

export interface TransfigurationSiteScreenProps {
  view: TransfigurationSiteView;
  onClose: () => void;
  onTransfigure: (
    entryId: string,
    type: TransfigurationType,
    effectDescription: string,
    effectDetails: Record<string, unknown>,
    essenceCost: number,
  ) => void;
}

interface RectSnapshot {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CardTravel {
  candidate: TransfigurationCandidateView;
  source: RectSnapshot;
  target: RectSnapshot;
}

const CARD_DISMISS_SCALE = 0;

export function TransfigurationSiteScreen({
  view,
  onClose,
  onTransfigure,
}: TransfigurationSiteScreenProps) {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [pickedEntryId, setPickedEntryId] = useState<string | null>(null);
  const [selectedFormType, setSelectedFormType] =
    useState<TransfigurationType | null>(null);
  const [travel, setTravel] = useState<CardTravel | null>(null);
  const [confirming, setConfirming] = useState(false);
  const picked =
    view.candidates.find((candidate) => candidate.entryId === pickedEntryId) ??
    null;
  const fallbackCandidate = picked ?? view.candidates[0] ?? null;

  const beginPick = useCallback(
    (entryId: string) => {
      if (travel !== null) return;
      const candidate = view.candidates.find(
        (choice) => choice.entryId === entryId,
      );
      if (candidate === undefined) return;
      if (reduceMotion === true) {
        setPickedEntryId(entryId);
        return;
      }

      const source = Array.from(
        document.querySelectorAll<HTMLElement>("[data-gallery-entry-id]"),
      ).find((element) => element.dataset.galleryEntryId === entryId);
      const target = document.querySelector<HTMLElement>(
        "[data-transfiguration-detail-card-target]",
      );
      if (source === undefined || target === null) {
        setPickedEntryId(entryId);
        return;
      }

      for (const sibling of document.querySelectorAll<HTMLElement>(
        "[data-gallery-entry-id]",
      )) {
        if (sibling.dataset.galleryEntryId === entryId) continue;
        sibling.animate?.(
          [
            { transform: "scale(1)" },
            { transform: `scale(${String(CARD_DISMISS_SCALE)})` },
          ],
          { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
        );
      }
      const activeCard = source.querySelector<HTMLElement>(
        '[data-game-card-source][data-reveal-active="true"]',
      );
      const revealCard =
        activeCard === null
          ? null
          : document.querySelector<HTMLElement>(
              '[data-tango-reveal-card="primary"]',
            );
      const travelSource = revealCard ?? source;
      const sourceRect = snapshotRect(travelSource.getBoundingClientRect());
      if (revealCard !== null) revealCard.style.visibility = "hidden";
      source.style.visibility = "hidden";
      setTravel({
        candidate,
        source: sourceRect,
        target: snapshotRect(target.getBoundingClientRect()),
      });
    },
    [reduceMotion, travel, view.candidates],
  );

  const goBack = useCallback(() => {
    if (confirming) return;
    setPickedEntryId(null);
    setSelectedFormType(null);
  }, [confirming]);

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="tango-transfiguration-site-screen"
      guideArtTestId="tango-transfiguration-guide-art"
      speechAnchorTestId="tango-transfiguration-speech-anchor"
      speechBubbleTestId="tango-transfiguration-speech-bubble"
      renderGallery={(layout) => (
        <section
          data-transfiguration-workspace=""
          data-transfiguration-layout={layout}
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: 0,
            height: "100%",
            maxHeight: "100%",
            width:
              layout === "mobile"
                ? `calc(100vw - (${token("--space-4")} * 2))`
                : "100%",
            boxSizing: "border-box",
            pointerEvents: "auto",
            display: "grid",
            alignItems: layout === "mobile" ? "start" : "center",
            justifyItems: "center",
            alignSelf: layout === "mobile" ? "start" : undefined,
            justifySelf: layout === "mobile" ? "center" : undefined,
          }}
        >
          {picked === null ? (
            <PickerPanel
              layout={layout}
              view={view}
              onClose={onClose}
              onPick={beginPick}
            />
          ) : (
            <DetailPanel
              layout={layout}
              candidate={picked}
              selectedFormType={selectedFormType}
              confirming={confirming}
              alreadyAccepted={view.alreadyAccepted}
              onBack={goBack}
              onSelectForm={(type) =>
                setSelectedFormType((current) =>
                  current === type ? null : type,
                )
              }
              onConfirm={(form) => {
                setConfirming(true);
                onTransfigure(
                  picked.entryId,
                  form.type,
                  form.description,
                  form.effectDetails,
                  form.essenceCost,
                );
              }}
            />
          )}
          {picked === null && fallbackCandidate !== null && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                visibility: "hidden",
                pointerEvents: "none",
              }}
            >
              <DetailPanel
                layout={layout}
                candidate={fallbackCandidate}
                selectedFormType={null}
                confirming={false}
                alreadyAccepted={false}
                onBack={() => undefined}
                onSelectForm={() => undefined}
                onConfirm={() => undefined}
              />
            </div>
          )}
          {travel !== null && (
            <motion.div
              data-testid="tango-transfiguration-card-travel"
              initial={{ x: 0, y: 0, scale: 1 }}
              animate={{
                x: travel.target.left - travel.source.left,
                y: travel.target.top - travel.source.top,
                scale: travel.target.width / travel.source.width,
              }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => {
                setPickedEntryId(travel.candidate.entryId);
                setTravel(null);
              }}
              style={{
                position: "fixed",
                left: travel.source.left,
                top: travel.source.top,
                width: travel.source.width,
                height: travel.source.height,
                zIndex: 60,
                pointerEvents: "none",
                transformOrigin: "top left",
                willChange: "transform",
              }}
            >
              <GameCard model={travel.candidate.model} />
            </motion.div>
          )}
        </section>
      )}
    />
  );
}

function PickerPanel({
  layout,
  view,
  onClose,
  onPick,
}: {
  readonly layout: "mobile" | "desktop";
  readonly view: TransfigurationSiteView;
  readonly onClose: () => void;
  readonly onPick: (entryId: string) => void;
}) {
  const desktop = layout === "desktop";
  return (
    <CardGalleryPanel
      title="Transfiguration"
      subtitle={view.ready ? "Choose a card to reforge" : "Heating the forge…"}
      rightAccessory={
        desktop
          ? undefined
          : {
              kind: "glassButton",
              label: "Decline",
              onPress: onClose,
              testId: "tango-transfiguration-decline",
            }
      }
      footerAction={
        desktop
          ? {
              label: "Decline Offer",
              onPress: onClose,
              testId: "tango-transfiguration-decline",
            }
          : undefined
      }
      cards={view.candidates.map((candidate) => ({
        entryId: candidate.entryId,
        model: candidate.model,
        testId: `tango-transfiguration-card-${candidate.entryId}`,
      }))}
      emptyLabel={view.ready ? "No eligible cards to reforge." : "Heating the forge…"}
      columns="three"
      cardSize={desktop ? "roomy" : "standard"}
      frame="floating"
      widthMode={desktop ? "content" : "fill"}
      spacing={desktop ? "spacious" : "medium"}
      testId="tango-transfiguration-picker"
      onCardPress={onPick}
    />
  );
}

function DetailPanel({
  layout,
  candidate,
  selectedFormType,
  confirming,
  alreadyAccepted,
  onBack,
  onSelectForm,
  onConfirm,
}: {
  readonly layout: "mobile" | "desktop";
  readonly candidate: TransfigurationCandidateView;
  readonly selectedFormType: TransfigurationType | null;
  readonly confirming: boolean;
  readonly alreadyAccepted: boolean;
  readonly onBack: () => void;
  readonly onSelectForm: (type: TransfigurationType) => void;
  readonly onConfirm: (form: TransfigurationFormView) => void;
}) {
  const mobile = layout === "mobile";
  const activeForm =
    candidate.forms.find((form) => form.type === selectedFormType) ?? null;
  const disabled =
    activeForm === null ||
    !activeForm.affordable ||
    confirming ||
    alreadyAccepted;

  return (
    <section
      data-testid="tango-transfiguration-detail"
      data-transfiguration-detail-layout={layout}
      style={{
        ...glassSurfaceStyle(),
        width: mobile
          ? `calc(100vw - (${token("--space-4")} * 2))`
          : "100%",
        height: mobile ? "100%" : undefined,
        maxHeight: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        color: token("--text-on-glass"),
        display: mobile ? "flex" : undefined,
        flexDirection: mobile ? "column" : undefined,
        justifySelf: mobile ? "center" : undefined,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: mobile ? "space-between" : undefined,
          padding: mobile ? token("--space-3") : token("--space-6"),
          paddingLeft: mobile ? token("--space-4") : undefined,
          borderBottom: `1px solid ${token("--border-strong")}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, font: token("--t-title-sm") }}>
            Choose Its New Form
          </h2>
        </div>
        {mobile && (
          <IconButton
            glyph={GLYPHS.chevronLeft}
            label="Choose another card"
            placement="onGlass"
            size="sm"
            disabled={confirming}
            onPress={onBack}
            testId="tango-transfiguration-back"
          />
        )}
      </header>

      <div
        style={{
          display: mobile ? "flex" : "grid",
          flex: mobile ? "1 1 auto" : undefined,
          minHeight: mobile ? 0 : undefined,
          flexDirection: mobile ? "column" : undefined,
          gridTemplateColumns: mobile
            ? undefined
            : "minmax(220px, 0.82fr) minmax(320px, 1.18fr)",
          gap: mobile ? token("--space-2") : token("--space-8"),
          alignItems: mobile ? "center" : "start",
          padding: mobile ? token("--space-2") : token("--space-8"),
        }}
      >
        <div
          style={{
            // Let short phones spend every remaining vertical pixel on the
            // card while wide/tall phones stop at the authored readable size.
            width: mobile ? "auto" : "min(100%, 278px)",
            height: mobile ? "100%" : undefined,
            maxWidth: mobile ? "58vw" : undefined,
            maxHeight: mobile ? 318 : undefined,
            aspectRatio: mobile ? String(CARD_ASPECT_RATIO_VALUE) : undefined,
            justifySelf: "center",
            minHeight: 0,
          }}
          data-transfiguration-detail-card-target=""
        >
          <GameCard
            model={activeForm?.previewModel ?? candidate.model}
            selected={activeForm !== null}
            selectionColor={activeForm?.accent}
            large
          />
        </div>

        <div
          style={{
            minWidth: 0,
            width: mobile ? "100%" : undefined,
            flex: mobile ? "0 0 auto" : undefined,
            display: "flex",
            flexDirection: "column",
            gap: mobile ? token("--space-2") : token("--space-4"),
          }}
        >
          <div
            role="radiogroup"
            aria-label="Transfiguration options"
            data-transfiguration-options=""
            data-transfiguration-option-layout={mobile ? "compact" : "detailed"}
            style={{
              display: "flex",
              flexDirection: mobile ? "row" : "column",
              justifyContent: mobile ? "center" : undefined,
              gap: mobile ? token("--space-4") : token("--space-3"),
              maxHeight: mobile ? undefined : "min(52vh, 520px)",
              overflowX: mobile ? "auto" : undefined,
              overflowY: mobile ? "hidden" : "auto",
              padding: token("--space-2"),
            }}
          >
            {candidate.forms.map((form) => {
              const selected = form.type === activeForm?.type;
              if (mobile) {
                return (
                  <TransfigurationFormButton
                    key={form.type}
                    id={`${candidate.entryId}:${form.type}`}
                    type={form.type}
                    description={form.description}
                    essenceCost={form.essenceCost}
                    affordable={form.affordable}
                    accent={form.accent}
                    selected={selected}
                    disabled={confirming}
                    onActivate={() => onSelectForm(form.type)}
                    testId={`tango-transfiguration-form-${form.type}`}
                  />
                );
              }
              return (
                <Pressable
                  key={form.type}
                  as="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!form.affordable || confirming}
                  data-testid={`tango-transfiguration-form-${form.type}`}
                  onClick={() => onSelectForm(form.type)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                    gap: token("--space-4"),
                    alignItems: "center",
                    padding: token("--space-4"),
                    border: `2px solid ${selected ? form.accent : token("--border-soft")}`,
                    borderRadius: token("--radius-control"),
                    background: "transparent",
                    boxShadow: "none",
                    color: token("--text-on-glass"),
                    textAlign: "left",
                    opacity: form.affordable ? 1 : 0.46,
                  }}
                >
                  <GlowIcon
                    iconClass={TRANSFIGURATION_FORM_GLYPHS[form.type]}
                    color={form.accent}
                    size="28px"
                    shadow
                  />
                  <span style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        font: token("--t-button"),
                        color: token("--text-on-glass"),
                      }}
                    >
                      {form.type}
                    </strong>
                    <span
                      style={{
                        display: "block",
                        marginTop: token("--space-1"),
                        font: token("--t-caption"),
                        color: token("--text-on-glass-muted"),
                      }}
                    >
                      {form.description}
                    </span>
                  </span>
                  <span
                    style={{
                      font: token("--t-button"),
                      color: token("--text-on-glass"),
                      whiteSpace: "nowrap",
                    }}
                  >
                    {form.essenceCost === 0 ? (
                      "Free"
                    ) : (
                      <EssenceValue amount={form.essenceCost} tone="inherit" />
                    )}
                  </span>
                </Pressable>
              );
            })}
          </div>
        </div>
      </div>
      <footer
        data-transfiguration-actions=""
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: token("--space-4"),
          paddingRight: mobile ? token("--space-4") : token("--space-8"),
          paddingBottom: mobile ? token("--space-4") : token("--space-6"),
          paddingLeft: mobile ? token("--space-4") : token("--space-8"),
        }}
      >
        {!mobile && (
          <GlassButton
            placement="onGlass"
            label="Choose Again"
            disabled={confirming}
            onPress={onBack}
            testId="tango-transfiguration-choose-again"
          />
        )}
        <GlassButton
          placement="onGlass"
          variant="accent"
          label={confirming ? "Reforging…" : "Transfigure"}
          cost={activeForm?.essenceCost ?? null}
          costSeparator="dot"
          disabled={disabled}
          onPress={() => {
            if (activeForm !== null) onConfirm(activeForm);
          }}
          testId="tango-transfiguration-confirm"
        />
      </footer>
    </section>
  );
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
