// TransfigurationSiteScreen — Durgan Forgehammer's standard desktop forge.

import { localizationTodo } from "@trox/runtime";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import { GlassButton } from "../components/controls/GlassButton";
import {
  TransfigurationButton,
  type TransfigurationButtonModel,
} from "../components/controls/TransfigurationButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import type { TransfigurationType } from "../../types/journey";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import { useMessages } from "../hooks/use-messages";

export type TransfigurationGuideView = GuideGalleryGuideView;

export interface TransfigurationFormView extends TransfigurationButtonModel {
  /** Persisted reconstruction payload passed back to the mutation. */
  effectDetails: Record<string, unknown>;
  /** The transformed card plus its marked transfiguration display. */
  previewModel: GameCardModel;
}

export interface TransfigurationCandidateView {
  /** Concrete deck-entry id; duplicate cards remain independent choices. */
  entryId: string;
  /** Card shown in the picker; reforged context cards include their form. */
  model: GameCardModel;
  /** Whether the card can enter the forge or is completed deck context. */
  availability: "available" | "reforged";
  /** Existing form named beneath a disabled reforged card. */
  reforgedType: TransfigurationType | null;
  /** Eligible forms in persisted offer order. */
  forms: TransfigurationFormView[];
}

export interface TransfigurationSiteView {
  siteId: string;
  scene: ArtRef | null;
  guide: TransfigurationGuideView;
  ready: boolean;
  isEnhanced: boolean;
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
// Keeps the desktop detail compact once forge-form descriptions are carried
// accessibly instead of occupying a second visible line in every option.
const DESKTOP_DETAIL_PANEL_MAX_WIDTH_PX = 640;

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
  const fallbackCandidate =
    picked ??
    view.candidates.find(
      (candidate) => candidate.availability === "available",
    ) ??
    null;

  const beginPick = useCallback(
    (entryId: string, layout: "mobile" | "desktop") => {
      if (travel !== null) return;
      const candidate = view.candidates.find(
        (choice) => choice.entryId === entryId,
      );
      if (candidate === undefined || candidate.availability !== "available") {
        return;
      }
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
          {
            duration: 320,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards",
          },
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
      desktopComposition={view.isEnhanced ? "split" : "showcase"}
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
                ? `calc(100vw - (${token("--space-s")} * 2))`
                : "100%",
            boxSizing: "border-box",
            pointerEvents: "auto",
            display: "grid",
            alignItems: layout === "mobile" ? "start" : "center",
            justifyItems:
              layout === "desktop" && !view.isEnhanced && picked === null
                ? "end"
                : "center",
            alignSelf: layout === "mobile" ? "start" : undefined,
            justifySelf: layout === "mobile" ? "center" : undefined,
          }}
        >
          <div
            data-transfiguration-panel-viewport=""
            style={{
              width: "100%",
              minWidth: 0,
              maxWidth:
                layout === "desktop" && !view.isEnhanced && picked !== null
                  ? DESKTOP_DETAIL_PANEL_MAX_WIDTH_PX
                  : undefined,
              height: layout === "mobile" ? "100%" : undefined,
              minHeight: layout === "mobile" ? 0 : undefined,
              maxHeight: "100%",
              overflow: "visible",
              display: "grid",
              alignContent:
                layout === "mobile" && picked !== null ? "end" : "center",
              alignItems:
                layout === "mobile" && picked !== null ? "end" : "center",
              justifyItems:
                layout === "desktop" && !view.isEnhanced && picked === null
                  ? "end"
                  : "center",
              justifySelf:
                layout === "desktop" && !view.isEnhanced && picked !== null
                  ? "end"
                  : undefined,
            }}
          >
            {picked === null ? (
              <TransfigurationPickerPanel
                layout={layout}
                ready={view.ready}
                isEnhanced={view.isEnhanced}
                candidates={view.candidates}
                onClose={onClose}
                onPick={(entryId) => beginPick(entryId, layout)}
              />
            ) : (
              <TransfigurationDetailPanel
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
                    form.presentation.description,
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
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: "100%",
                  maxWidth: DESKTOP_DETAIL_PANEL_MAX_WIDTH_PX,
                  display: "grid",
                  alignItems: "center",
                  visibility: "hidden",
                  pointerEvents: "none",
                }}
              >
                <TransfigurationDetailPanel
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

export function TransfigurationPickerPanel({
  layout,
  ready,
  isEnhanced,
  candidates,
  onClose,
  onPick,
}: {
  readonly layout: "mobile" | "desktop";
  readonly ready: boolean;
  readonly isEnhanced: boolean;
  readonly candidates: readonly TransfigurationCandidateView[];
  readonly onClose: () => void;
  readonly onPick: (entryId: string) => void;
}) {
  const t = useMessages();
  const desktop = layout === "desktop";
  const enhanced = isEnhanced;
  return (
    <CardPickerPanel
      title={localizationTodo(t("transfiguration-picker-title"))}
      subtitle={localizationTodo(t("transfiguration-picker-instruction", {
        state: ready ? (enhanced ? "enhanced" : "standard") : "loading",
      }))}
      rightAccessory={
        enhanced || !desktop
          ? {
              kind: "glassButton",
              button: {
                label: t("transfiguration-decline-action", {
                  presentation: "compact",
                }),
                onPress: onClose,
                testId: "cumulus-transfiguration-decline",
              },
            }
          : undefined
      }
      footerActions={
        desktop && !enhanced
          ? [
              {
                label: t("transfiguration-decline-action", {
                  presentation: "full",
                }),
                onPress: onClose,
                testId: "cumulus-transfiguration-decline",
              },
            ]
          : undefined
      }
      cards={candidates.map((candidate) => ({
        entryId: candidate.entryId,
        model: candidate.model,
        testId: `cumulus-transfiguration-card-${candidate.entryId}`,
        disabled: candidate.availability !== "available",
        caption:
          candidate.reforgedType === null
            ? undefined
            : {
                kind: "text" as const,
                text: t("transfiguration-reforged-card-caption", {
                  form: candidate.reforgedType,
                }),
              },
      }))}
      emptyLabel={localizationTodo(t("transfiguration-picker-empty-state", {
        state: ready ? "empty" : "loading",
      }))}
      testId="cumulus-transfiguration-picker"
      onCardPress={onPick}
    />
  );
}

export function TransfigurationDetailPanel({
  layout,
  candidate,
  selectedFormType,
  confirming,
  alreadyAccepted,
  showConfirmEssenceCost = true,
  onBack,
  onSelectForm,
  onConfirm,
}: {
  readonly layout: "mobile" | "desktop";
  readonly candidate: TransfigurationCandidateView;
  readonly selectedFormType: TransfigurationType | null;
  readonly confirming: boolean;
  readonly alreadyAccepted: boolean;
  /** Whether the confirmation action shows the selected form's quoted cost. */
  readonly showConfirmEssenceCost?: boolean;
  readonly onBack?: () => void;
  readonly onSelectForm: (type: TransfigurationType) => void;
  readonly onConfirm: (form: TransfigurationFormView) => void;
}) {
  const t = useMessages();
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
        width: mobile ? `calc(100vw - (${token("--space-s")} * 2))` : "100%",
        height: mobile ? "auto" : undefined,
        minHeight: mobile ? "100%" : undefined,
        maxHeight: mobile ? undefined : "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        display: mobile ? "flex" : undefined,
        flexDirection: mobile ? "column" : undefined,
        justifySelf: mobile ? "center" : undefined,
      }}
    >
      <GlassPanel
        title={localizationTodo(t("transfiguration-form-picker-title"))}
        headerSpacing={mobile ? "compact" : "medium"}
        footer={
          <div
            data-transfiguration-actions=""
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: mobile ? "center" : "flex-end",
              gap: token("--space-s"),
              paddingRight: mobile ? token("--space-s") : token("--space-2xl"),
              paddingBottom: mobile ? token("--space-s") : token("--space-l"),
              paddingLeft: mobile ? token("--space-s") : token("--space-2xl"),
            }}
          >
            {onBack !== undefined && (
              <GlassButton
                placement="onGlass"
                label={t("transfiguration-choose-again-action")}
                disabled={confirming}
                onPress={onBack}
                testId="cumulus-transfiguration-choose-again"
              />
            )}
            <GlassButton
              placement="onGlass"
              variant="accent"
              label={t("transfiguration-confirm-action", {
                state: confirming ? "pending" : "ready",
              })}
              essenceCost={
                showConfirmEssenceCost
                  ? activeForm?.essenceCost ?? null
                  : null
              }
              widthReservations={showConfirmEssenceCost
                ? [
                    {
                      label: t("transfiguration-confirm-action", {
                        state: "ready",
                      }),
                      essenceCost: null,
                    },
                    ...candidate.forms.flatMap((form) => [
                      {
                        label: t("transfiguration-confirm-action", {
                          state: "ready",
                        }),
                        essenceCost: form.essenceCost,
                      },
                      {
                        label: t("transfiguration-confirm-action", {
                          state: "pending",
                        }),
                        essenceCost: form.essenceCost,
                      },
                    ]),
                  ]
                : [
                    {
                      label: t("transfiguration-confirm-action", { state: "ready" }),
                      essenceCost: null,
                    },
                    {
                      label: t("transfiguration-confirm-action", { state: "pending" }),
                      essenceCost: null,
                    },
                  ]}
              disabled={disabled}
              onPress={() => {
                if (activeForm !== null) onConfirm(activeForm);
              }}
              testId="cumulus-transfiguration-confirm"
            />
          </div>
        }
      >
        <div
          data-transfiguration-detail-body=""
          data-transfiguration-detail-body-layout={
            mobile ? "side-by-side" : "desktop-columns"
          }
          style={{
            display: "grid",
            containerType: mobile ? "inline-size" : undefined,
            flex: mobile ? "1 0 auto" : undefined,
            minHeight: mobile ? "auto" : undefined,
            gridTemplateColumns: mobile
              ? "minmax(0, 1fr) minmax(0, 1fr)"
              : "minmax(220px, 278px) minmax(240px, 288px)",
            gridTemplateRows: mobile ? "auto" : undefined,
            gap: mobile ? token("--space-s") : token("--space-2xl"),
            alignItems: mobile ? "stretch" : "start",
            padding: mobile
              ? `${token("--space-l")} ${token("--space-s")}`
              : token("--space-2xl"),
          }}
        >
          <div
            style={{
              width: mobile
                ? `min(100%, ${String(MOBILE_DETAIL_CARD_MAX_WIDTH)}px)`
                : "min(100%, 278px)",
              height: mobile ? "auto" : undefined,
              aspectRatio: mobile ? String(CARD_ASPECT_RATIO_VALUE) : undefined,
              justifySelf: "center",
              alignSelf: mobile ? "start" : undefined,
              minHeight: 0,
            }}
            data-transfiguration-detail-card-target=""
          >
            <GameCard
              model={activeForm?.previewModel ?? candidate.model}
              selection={activeForm === null ? undefined : "transfigured"}
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
              gap: mobile ? token("--space-xs") : token("--space-s"),
            }}
          >
            <div
              role="radiogroup"
              aria-label={t("transfiguration-options-accessible-name")}
              data-transfiguration-options=""
              data-transfiguration-option-layout={mobile ? "compact" : "priced"}
              style={{
                display: "flex",
                minHeight: mobile ? 0 : undefined,
                height: mobile ? "auto" : undefined,
                boxSizing: "border-box",
                flexDirection: "column",
                alignItems: mobile ? "stretch" : undefined,
                justifyContent: mobile ? "flex-start" : undefined,
                gap: token("--space-xs"),
                maxHeight: mobile ? undefined : "min(52vh, 520px)",
                overflowY: mobile ? "visible" : "auto",
                padding: token("--space-xs"),
                paddingBlockStart: mobile ? token("--space-xs") : 0,
              }}
            >
              {candidate.forms.map((form) => {
                const selected = form.type === activeForm?.type;
                return (
                  <TransfigurationButton
                    key={form.type}
                    form={form}
                    variant={mobile ? "compact" : "priced"}
                    selected={selected}
                    disabled={confirming}
                    onPress={onSelectForm}
                    testId={`cumulus-transfiguration-form-${form.type}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </GlassPanel>
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
