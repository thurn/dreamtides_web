// TransfigurationSiteScreen — Durgan Forgehammer's standard desktop forge.

import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import { Button } from "../components/controls/Button";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import { groupPanelStyle } from "../components/controls/GroupPanel";
import { EssenceValue } from "../components/hud/EssenceValue";
import { glassSurfaceStyle } from "../internal/glass-surface";
import type { ArtRef } from "../primitives/art";
import { GLYPHS, type Glyph } from "../primitives/glyph";
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
  accent: `#${string}`;
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

const FORM_GLYPHS: Readonly<Record<TransfigurationType, Glyph>> = {
  Empowered: GLYPHS.transfigurationEmpowered,
  Amplified: GLYPHS.transfigurationAmplified,
  Kindled: GLYPHS.transfigurationKindled,
  Inspired: GLYPHS.transfigurationInspired,
  Enduring: GLYPHS.transfigurationEnduring,
  Hastened: GLYPHS.transfigurationHastened,
  Resonant: GLYPHS.transfigurationResonant,
  Attuned: GLYPHS.transfigurationAttuned,
  Perfected: GLYPHS.transfigurationPerfected,
};
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
      const firstForm =
        candidate.forms.find((form) => form.affordable) ?? candidate.forms[0];
      if (firstForm === undefined) return;
      setSelectedFormType(firstForm.type);

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
      source.style.visibility = "hidden";
      setTravel({
        candidate,
        source: snapshotRect(source.getBoundingClientRect()),
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
            width: "100%",
            pointerEvents: "auto",
            display: "grid",
            alignItems: "center",
          }}
        >
          {picked === null ? (
            <PickerPanel view={view} onClose={onClose} onPick={beginPick} />
          ) : (
            <DetailPanel
              candidate={picked}
              selectedFormType={selectedFormType}
              confirming={confirming}
              alreadyAccepted={view.alreadyAccepted}
              onBack={goBack}
              onSelectForm={setSelectedFormType}
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
                candidate={fallbackCandidate}
                selectedFormType={fallbackCandidate.forms[0]?.type ?? null}
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
  view,
  onClose,
  onPick,
}: {
  readonly view: TransfigurationSiteView;
  readonly onClose: () => void;
  readonly onPick: (entryId: string) => void;
}) {
  return (
    <CardGalleryPanel
      title="Transfiguration"
      subtitle={view.ready ? "Choose a card to reforge" : "Heating the forge…"}
      rightAccessory={{
        kind: "iconButton",
        glyph: GLYPHS.close,
        label: "Leave Transfiguration",
        onPress: onClose,
        testId: "tango-transfiguration-leave",
      }}
      cards={view.candidates.map((candidate) => ({
        entryId: candidate.entryId,
        model: candidate.model,
        testId: `tango-transfiguration-card-${candidate.entryId}`,
      }))}
      emptyLabel={view.ready ? "No eligible cards to reforge." : "Heating the forge…"}
      columns="three"
      cardSize="roomy"
      frame="floating"
      widthMode="fill"
      spacing="regular"
      testId="tango-transfiguration-picker"
      onCardPress={onPick}
    />
  );
}

function DetailPanel({
  candidate,
  selectedFormType,
  confirming,
  alreadyAccepted,
  onBack,
  onSelectForm,
  onConfirm,
}: {
  readonly candidate: TransfigurationCandidateView;
  readonly selectedFormType: TransfigurationType | null;
  readonly confirming: boolean;
  readonly alreadyAccepted: boolean;
  readonly onBack: () => void;
  readonly onSelectForm: (type: TransfigurationType) => void;
  readonly onConfirm: (form: TransfigurationFormView) => void;
}) {
  const activeForm =
    candidate.forms.find((form) => form.type === selectedFormType) ??
    candidate.forms[0] ??
    null;
  const disabled =
    activeForm === null ||
    !activeForm.affordable ||
    confirming ||
    alreadyAccepted;

  return (
    <section
      data-testid="tango-transfiguration-detail"
      style={{
        ...glassSurfaceStyle(),
        width: "100%",
        maxHeight: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        color: token("--text-on-glass"),
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: token("--space-5"),
          padding: token("--space-6"),
          borderBottom: `1px solid ${token("--border-strong")}`,
        }}
      >
        <GlassButton
          placement="onGlass"
          glyph={GLYPHS.chevronLeft}
          label="Back"
          disabled={confirming}
          onPress={onBack}
          testId="tango-transfiguration-back"
        />
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
              color: token("--text-on-glass-muted"),
            }}
          >
            Transfiguration
          </p>
          <h2 style={{ margin: 0, font: token("--t-title") }}>
            Choose Its New Form
          </h2>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 0.82fr) minmax(320px, 1.18fr)",
          gap: token("--space-8"),
          alignItems: "center",
          padding: token("--space-8"),
        }}
      >
        <div
          style={{
            width: "min(100%, 278px)",
            justifySelf: "center",
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
            display: "flex",
            flexDirection: "column",
            gap: token("--space-4"),
          }}
        >
          <div
            role="radiogroup"
            aria-label="Transfiguration options"
            data-transfiguration-options=""
            style={{
              display: "flex",
              flexDirection: "column",
              gap: token("--space-3"),
              maxHeight: "min(52vh, 520px)",
              overflowY: "auto",
              paddingRight: token("--space-2"),
            }}
          >
            {candidate.forms.map((form) => {
              const selected = form.type === activeForm?.type;
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
                    ...groupPanelStyle(),
                    width: "100%",
                    boxSizing: "border-box",
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                    gap: token("--space-4"),
                    alignItems: "center",
                    padding: token("--space-4"),
                    border: `2px solid ${selected ? form.accent : "transparent"}`,
                    color: token("--text-primary"),
                    textAlign: "left",
                    opacity: form.affordable ? 1 : 0.46,
                  }}
                >
                  <GlowIcon
                    iconClass={FORM_GLYPHS[form.type]}
                    color={form.accent}
                    size="28px"
                    shadow
                  />
                  <span style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        font: token("--t-button"),
                        color: token("--text-primary"),
                      }}
                    >
                      {form.type}
                    </strong>
                    <span
                      style={{
                        display: "block",
                        marginTop: token("--space-1"),
                        font: token("--t-caption"),
                        color: token("--text-secondary"),
                      }}
                    >
                      {form.description}
                    </span>
                  </span>
                  <span
                    style={{
                      font: token("--t-button"),
                      color: token("--text-primary"),
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
          <div style={{ alignSelf: "flex-end" }}>
            <Button
              size="lg"
              label={confirming ? "Reforging…" : "Transfigure Card"}
              cost={activeForm?.essenceCost ?? null}
              disabled={disabled}
              onClick={() => {
                if (activeForm !== null) onConfirm(activeForm);
              }}
            />
          </div>
        </div>
      </div>
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
