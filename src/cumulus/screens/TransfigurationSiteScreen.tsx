// TransfigurationSiteScreen — Durgan Forgehammer's standard desktop forge.

import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import {
  TransfigurationFormButton,
  TRANSFIGURATION_FORM_GLYPHS,
} from "../components/controls/TransfigurationFormButton";
import { EssenceValue } from "../components/hud/EssenceValue";
import { glassSurfaceStyle } from "../internal/glass-surface";
import type { ArtRef } from "../primitives/art";
import type { CumulusColor } from "../primitives/color";
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
  accent: CumulusColor;
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
// The authored mobile card ceiling expressed as width so the card can fit both
// its equal visual column and the live detail-row height without distortion.
const MOBILE_DETAIL_CARD_MAX_WIDTH = 227;

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
    (entryId: string, layout: "mobile" | "desktop") => {
      if (travel !== null) return;
      const candidate = view.candidates.find(
        (choice) => choice.entryId === entryId,
      );
      if (candidate === undefined) return;
      if (layout === "mobile" || reduceMotion === true) {
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
              '[data-cumulus-reveal-card="primary"]',
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
      mobileComposition="revelation"
      mobileRegionSize={
        view.candidates.some((candidate) => candidate.forms.length > 3)
          ? "expanded"
          : "standard"
      }
      screenTestId="cumulus-transfiguration-site-screen"
      guideArtTestId="cumulus-transfiguration-guide-art"
      speechAnchorTestId="cumulus-transfiguration-speech-anchor"
      speechBubbleTestId="cumulus-transfiguration-speech-bubble"
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
          <div
            data-transfiguration-panel-viewport=""
            style={{
              width: "100%",
              height: layout === "mobile" ? "100%" : undefined,
              maxHeight: "100%",
              overflow: layout === "mobile" ? "hidden" : "visible",
              display: "grid",
              placeItems: "center",
            }}
          >
            {picked === null ? (
              <PickerPanel
                layout={layout}
                view={view}
                onClose={onClose}
                onPick={(entryId) => beginPick(entryId, layout)}
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
          </div>
          {layout === "desktop" &&
            picked === null &&
            fallbackCandidate !== null && (
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
              data-testid="cumulus-transfiguration-card-travel"
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
              testId: "cumulus-transfiguration-decline",
            }
      }
      footerAction={
        desktop
          ? {
              label: "Decline Offer",
              onPress: onClose,
              testId: "cumulus-transfiguration-decline",
            }
          : undefined
      }
      cards={view.candidates.map((candidate) => ({
        entryId: candidate.entryId,
        model: candidate.model,
        testId: `cumulus-transfiguration-card-${candidate.entryId}`,
      }))}
      emptyLabel={view.ready ? "No eligible cards to reforge." : "Heating the forge…"}
      columns="three"
      cardSize={desktop ? "roomy" : "standard"}
      frame="floating"
      widthMode={desktop ? "content" : "fill"}
      spacing={desktop ? "spacious" : "medium"}
      testId="cumulus-transfiguration-picker"
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
      data-testid="cumulus-transfiguration-detail"
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
          padding: mobile ? token("--space-4") : token("--space-6"),
          borderBottom: `1px solid ${token("--border-strong")}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, font: token("--t-title-sm") }}>
            Choose Its New Form
          </h2>
        </div>
      </header>

      <div
        data-transfiguration-detail-body=""
        data-transfiguration-detail-body-layout={
          mobile ? "side-by-side" : "desktop-columns"
        }
        style={{
          display: "grid",
          containerType: mobile ? "size" : undefined,
          flex: mobile ? "1 1 auto" : undefined,
          minHeight: mobile ? 0 : undefined,
          gridTemplateColumns: mobile
            ? "minmax(0, 1fr) minmax(0, 1fr)"
            : "minmax(220px, 0.82fr) minmax(320px, 1.18fr)",
          gridTemplateRows: mobile ? "minmax(0, 1fr)" : undefined,
          gap: mobile ? token("--space-4") : token("--space-8"),
          alignItems: mobile ? "stretch" : "start",
          padding: mobile
            ? `${token("--space-6")} ${token("--space-4")}`
            : token("--space-8"),
        }}
      >
        <div
          style={{
            // Let short phones spend every remaining vertical pixel on the
            // card while wide/tall phones stop at the authored readable size.
            width: mobile
              ? `min(100%, calc(100cqh * ${String(CARD_ASPECT_RATIO_VALUE)}), ${String(MOBILE_DETAIL_CARD_MAX_WIDTH)}px)`
              : "min(100%, 278px)",
            height: mobile ? "auto" : undefined,
            aspectRatio: mobile ? String(CARD_ASPECT_RATIO_VALUE) : undefined,
            justifySelf: "center",
            alignSelf: mobile ? "center" : undefined,
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
            minHeight: mobile ? 0 : undefined,
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
              minHeight: mobile ? 0 : undefined,
              height: mobile ? "100%" : undefined,
              boxSizing: "border-box",
              flexDirection: "column",
              alignItems: mobile ? "center" : undefined,
              justifyContent: mobile ? "center" : undefined,
              gap: token("--space-3"),
              maxHeight: mobile ? undefined : "min(52vh, 520px)",
              overflowY: "auto",
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
                    testId={`cumulus-transfiguration-form-${form.type}`}
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
                  data-testid={`cumulus-transfiguration-form-${form.type}`}
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
          justifyContent: mobile ? "center" : "flex-end",
          gap: token("--space-4"),
          paddingRight: mobile ? token("--space-4") : token("--space-8"),
          paddingBottom: mobile ? token("--space-4") : token("--space-6"),
          paddingLeft: mobile ? token("--space-4") : token("--space-8"),
        }}
      >
        <GlassButton
          placement="onGlass"
          label="Choose Again"
          disabled={confirming}
          onPress={onBack}
          testId="cumulus-transfiguration-choose-again"
        />
        <GlassButton
          placement="onGlass"
          variant="accent"
          label={confirming ? "Reforging…" : "Transfigure"}
          cost={activeForm?.essenceCost ?? null}
          costSeparator="dot"
          widthReservations={[
            { label: "Transfigure", cost: null },
            ...candidate.forms.flatMap((form) => [
              { label: "Transfigure", cost: form.essenceCost },
              { label: "Reforging…", cost: form.essenceCost },
            ]),
          ]}
          disabled={disabled}
          onPress={() => {
            if (activeForm !== null) onConfirm(activeForm);
          }}
          testId="cumulus-transfiguration-confirm"
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
