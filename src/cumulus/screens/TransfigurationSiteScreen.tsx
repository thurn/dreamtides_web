// TransfigurationSiteScreen — Durgan Forgehammer's standard desktop forge.

import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import type { TransfigurationButtonModel } from "../components/controls/TransfigurationButton";
import { TransfigurationPickerPanel } from "../components/card/TransfigurationPickerPanel";
import { TransfigurationDetailPanel } from "../components/card/TransfigurationDetailPanel";
import type { ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import type { TransfigurationType } from "../../types/journey";
import {
  SiteLayout,
  type SiteLayoutGuide,
} from "../components/layout/SiteLayout";
import { useIsDesktop } from "../primitives/use-is-desktop";
import { useLocalizer } from "../../runtime/localization/use-localizer";

export type TransfigurationGuideView = Omit<SiteLayoutGuide, "presence">;

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
// Keeps the desktop detail compact once forge-form descriptions are carried
// accessibly instead of occupying a second visible line in every option.
const DESKTOP_DETAIL_PANEL_MAX_WIDTH_PX = 640;

export function TransfigurationSiteScreen({
  view,
  onClose,
  onTransfigure,
}: TransfigurationSiteScreenProps) {
  const resolve = useLocalizer();
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [pickedEntryId, setPickedEntryId] = useState<string | null>(null);
  const [selectedFormType, setSelectedFormType] =
    useState<TransfigurationType | null>(null);
  const [travel, setTravel] = useState<CardTravel | null>(null);
  const [confirming, setConfirming] = useState(false);
  const layout = useIsDesktop() ? "desktop" : "mobile";
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
    <div data-testid="cumulus-transfiguration-site-screen">
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        atmosphere="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition={
          view.candidates.some((candidate) => candidate.forms.length > 3)
            ? view.isEnhanced
              ? "balanced-expanded-revelation"
              : "content-led-expanded-revelation"
            : view.isEnhanced
              ? "balanced-revelation"
              : "content-led-revelation"
        }
      >
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
                state={
                  view.ready
                    ? {
                        kind: "ready",
                        presentation: view.isEnhanced ? "open-deck" : "offer",
                        cards: view.candidates.map((candidate) => ({
                          entryId: candidate.entryId,
                          card: candidate.model,
                          availability: candidate.availability,
                          reforgedType: candidate.reforgedType,
                        })),
                      }
                    : { kind: "loading" }
                }
                onDismiss={onClose}
                onCardPress={(entryId) => beginPick(entryId, layout)}
              />
            ) : (
              <TransfigurationDetailPanel
                candidate={{
                  entryId: picked.entryId,
                  card: picked.model,
                  forms: picked.forms,
                }}
                value={selectedFormType}
                status={
                  confirming
                    ? "submitting"
                    : view.alreadyAccepted
                      ? "accepted"
                      : "idle"
                }
                quote="show-cost"
                navigation={{ kind: "reselectable", onBack: goBack }}
                onChange={(type) =>
                  setSelectedFormType((current) =>
                    current === type ? null : type,
                  )
                }
                onConfirm={(type) => {
                  const form = picked.forms.find(
                    (candidateForm) => candidateForm.type === type,
                  );
                  if (form === undefined) return;
                  setConfirming(true);
                  onTransfigure(
                    picked.entryId,
                    type,
                    resolve(form.presentation.description),
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
                  candidate={{
                    entryId: fallbackCandidate.entryId,
                    card: fallbackCandidate.model,
                    forms: fallbackCandidate.forms,
                  }}
                  value={null}
                  status="idle"
                  quote="show-cost"
                  navigation={{ kind: "reselectable", onBack: () => undefined }}
                  onChange={() => undefined}
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
      </SiteLayout>
    </div>
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
