import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { SiteState, DeckEntry, TransfigurationType } from "../types/quest";
import type { CardData } from "../types/cards";
import { CardDisplay } from "../components/CardDisplay";
import { EssenceValue } from "../components/EssenceValue";
import { SiteGuide } from "../components/SiteGuide";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import {
  buildTransfigurationDisplay,
  TRANSFIGURATION_COLORS,
  TRANSFIGURATION_ICONS,
} from "../transfiguration/transfiguration-logic";
import "./transfiguration-site.css";

/** Props for the TransfigurationSiteScreen component. */
interface TransfigurationSiteScreenProps {
  site: SiteState;
}

/** One pickable form offered for a card, carried straight from the runtime. */
interface FormOffer {
  type: TransfigurationType;
  effectDescription: string;
  effectDetails: Record<string, unknown>;
  essenceCost: number;
}

/** A deck entry paired with the forms the site offers for it. */
interface TransfigurationCandidate {
  entry: DeckEntry;
  card: CardData;
  forms: FormOffer[];
}

/** How long the forge flash plays before the reforged card is committed. */
const FORGE_FLASH_MS = 620;

/** Card width (px) for the pick grid, per visit mode. */
const STANDARD_CARD_WIDTH = 210;
const HOME_CARD_WIDTH = 158;

/**
 * Groups the flat runtime offers (one row per form) back into per-card
 * candidates, preserving the offered form order. Entries that are missing,
 * already transfigured, or have no offered forms are skipped.
 */
function buildCandidates(
  deck: DeckEntry[],
  cardDatabase: Map<number, CardData>,
  offers: readonly {
    entryId: string;
    type: TransfigurationType;
    effectDescription: string;
    effectDetails: Record<string, unknown>;
    essenceCost: number;
  }[],
): TransfigurationCandidate[] {
  const deckByEntryId = new Map(deck.map((entry) => [entry.entryId, entry]));
  const byEntryId = new Map<string, TransfigurationCandidate>();
  const order: string[] = [];
  for (const offer of offers) {
    const entry = deckByEntryId.get(offer.entryId);
    if (entry === undefined || entry.transfiguration !== null) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (!card) continue;
    let candidate = byEntryId.get(offer.entryId);
    if (candidate === undefined) {
      candidate = { entry, card, forms: [] };
      byEntryId.set(offer.entryId, candidate);
      order.push(offer.entryId);
    }
    candidate.forms.push({
      type: offer.type,
      effectDescription: offer.effectDescription,
      effectDetails: offer.effectDetails,
      essenceCost: offer.essenceCost,
    });
  }
  return order
    .map((entryId) => byEntryId.get(entryId))
    .filter((candidate): candidate is TransfigurationCandidate =>
      candidate !== undefined && candidate.forms.length > 0,
    );
}

/** A deck card that already carries a transfiguration (shown dimmed at home). */
interface ReforgedTile {
  entryId: string;
  card: CardData;
  type: TransfigurationType;
}

/**
 * The Transfiguration site as an immersive, full-bleed scene. Durgan
 * Forgehammer (the shared {@link SiteGuide}) reforges one of the player's cards
 * over the dimmed dreamscape, in the deck-browser surface family shared with
 * Purge and Duplication. The flow is two calm steps:
 *
 *  1. PICK — choose a card (a small drawn hand, or the whole deck at Durgan's
 *     enhanced home forge, where already-reforged cards show dimmed).
 *  2. FORGE — choose one of the card's eligible forms; the reforged card
 *     previews live with the form's tint and emblem, then "Transfigure it"
 *     commits it.
 */
export function TransfigurationSiteScreen({
  site,
}: TransfigurationSiteScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { deck, essence } = state;
  const isHome = site.isEnhanced;
  const runtime = state.siteRuntime[site.id];
  const cardChoiceRuntime =
    runtime !== undefined &&
    runtime.kind === "cardChoice" &&
    runtime.choiceKind === "transfiguration" &&
    Array.isArray(runtime.transfigurationOffers)
      ? runtime
      : null;

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureCardChoiceRuntime(site.id, "transfiguration");
    }
  }, [mutations, runtime, site.id]);

  useEffect(() => {
    // Log once per visit, on first mount, for behaviour reconstruction.
    logEvent("site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: deck.length,
    });
  }, []);

  // Entrance animation, mirroring the Purge/Duplication surfaces.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 20);
    return () => window.clearTimeout(id);
  }, []);

  const candidates = useMemo(
    () =>
      cardChoiceRuntime === null
        ? []
        : buildCandidates(
            deck,
            cardDatabase,
            cardChoiceRuntime.transfigurationOffers,
          ),
    [cardChoiceRuntime, cardDatabase, deck],
  );

  // At the home forge, deck cards already reforged on earlier visits show as
  // dimmed, unpickable tiles alongside the eligible picks.
  const reforgedTiles = useMemo<ReforgedTile[]>(() => {
    if (!isHome) return [];
    const tiles: ReforgedTile[] = [];
    for (const entry of deck) {
      if (entry.transfiguration === null) continue;
      const card = cardDatabase.get(entry.cardNumber);
      if (!card) continue;
      tiles.push({
        entryId: entry.entryId,
        card,
        type: entry.transfiguration,
      });
    }
    return tiles;
  }, [isHome, deck, cardDatabase]);

  const alreadyAccepted =
    (cardChoiceRuntime?.acceptedEntryIds.length ?? 0) > 0;

  // Two-step flow: pick a card, then choose and forge a form.
  const [pickedEntryId, setPickedEntryId] = useState<string | null>(null);
  const [formType, setFormType] = useState<TransfigurationType | null>(null);
  const [forging, setForging] = useState(false);

  const picked = useMemo(
    () => candidates.find((c) => c.entry.entryId === pickedEntryId) ?? null,
    [candidates, pickedEntryId],
  );
  const activeForm = useMemo(
    () => picked?.forms.find((f) => f.type === formType) ?? null,
    [picked, formType],
  );
  const activeAffordable =
    activeForm !== null && activeForm.essenceCost <= essence;

  const pick = useCallback(
    (candidate: TransfigurationCandidate) => {
      setPickedEntryId(candidate.entry.entryId);
      // Preview the first form the player can afford; fall back to the first
      // form so the preview still shows something when none are affordable.
      const firstAffordable = candidate.forms.find(
        (form) => form.essenceCost <= essence,
      );
      setFormType(
        (firstAffordable ?? candidate.forms[0])?.type ?? null,
      );
    },
    [essence],
  );

  const back = useCallback(() => {
    if (forging) return;
    setPickedEntryId(null);
    setFormType(null);
  }, [forging]);

  const confirm = useCallback(() => {
    if (
      picked === null ||
      activeForm === null ||
      forging ||
      alreadyAccepted ||
      activeForm.essenceCost > essence
    ) {
      return;
    }
    setForging(true);

    logEvent("transfiguration_completed", {
      siteId: site.id,
      entryId: picked.entry.entryId,
      cardNumber: picked.entry.cardNumber,
      transfigurationType: activeForm.type,
      effectDescription: activeForm.effectDescription,
      effectDetails: activeForm.effectDetails,
      essenceCost: activeForm.essenceCost,
      essenceBefore: essence,
      essenceAfter: Math.max(0, essence - activeForm.essenceCost),
      offeredForms: picked.forms.map((f) => f.type),
      isEnhanced: site.isEnhanced,
      currentDreamscape: state.currentDreamscape,
      completionLevel: state.completionLevel,
    });

    // Let the forge flash play, then commit; the mutation returns to the map.
    window.setTimeout(() => {
      mutations.acceptTransfigurationChoice(
        site.id,
        picked.entry.entryId,
        activeForm.type,
        activeForm.effectDescription,
        activeForm.effectDetails,
      );
    }, FORGE_FLASH_MS);
  }, [
    picked,
    activeForm,
    essence,
    forging,
    alreadyAccepted,
    mutations,
    site.id,
    site.isEnhanced,
    state.currentDreamscape,
    state.completionLevel,
  ]);

  // When the forge has nothing to reforge there is no card to pick and no form
  // to commit, so this is the one path that still needs an explicit way back to
  // the map.
  const leaveEmptyForge = useCallback(() => {
    if (forging) return;
    logEvent("site_completed", {
      siteType: "Transfiguration",
      outcome: "no_candidates",
    });
    mutations.completeSite(site.id, "transfiguration_no_candidates");
  }, [forging, mutations, site.id]);

  const tint = activeForm
    ? TRANSFIGURATION_COLORS[activeForm.type]
    : "#a855f7";

  const guide = (
    <SiteGuide siteType="Transfiguration" isEnhanced={site.isEnhanced} />
  );

  if (cardChoiceRuntime === null) {
    return (
      <div
        className={`transfiguration-site${mounted ? " mounted" : ""}`}
        data-testid="transfiguration-site-screen"
      >
        <p className="tf-status">Heating the forge...</p>
        {guide}
      </div>
    );
  }

  const inForge = picked !== null;
  const cardWidth = isHome ? HOME_CARD_WIDTH : STANDARD_CARD_WIDTH;

  return (
    <div
      className={`transfiguration-site${mounted ? " mounted" : ""}${forging ? " forging" : ""}`}
      style={{ "--tf-tint": tint } as CSSProperties}
      data-testid="transfiguration-site-screen"
    >
      <div className="tf-stage">
        <div className="tf-head">
          <div className="tf-eyebrow">SITE · TRANSFIGURATION</div>
          <div className="tf-sub">
            {inForge
              ? "Choose its new form."
              : isHome
                ? "Pick any card to reforge."
                : "Choose a card to reforge."}
          </div>
        </div>

        {!inForge ? (
          candidates.length === 0 && reforgedTiles.length === 0 ? (
            <div className="tf-empty">
              <p className="tf-status">No eligible cards to reforge.</p>
              <button
                type="button"
                className="tf-forge-btn"
                data-testid="transfiguration-leave-empty"
                onClick={leaveEmptyForge}
                disabled={forging}
              >
                <i className="bx bx-door-open" aria-hidden="true" />
                Leave the forge
              </button>
            </div>
          ) : (
            <div
              className={`tf-deck ${isHome ? "is-home" : "is-standard"}`}
              style={{ "--tf-cardw": `${cardWidth}px` } as CSSProperties}
            >
              {candidates.map((candidate, index) => (
                <div
                  key={candidate.entry.entryId}
                  className="tf-slot"
                  style={{ "--i": index } as CSSProperties}
                >
                  <div
                    className="tf-pick-card"
                    role="button"
                    tabIndex={0}
                    aria-label={`Reforge ${candidate.card.name}`}
                    data-transfiguration-entry={candidate.entry.entryId}
                    onClick={() => pick(candidate)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        pick(candidate);
                      }
                    }}
                  >
                    <CardDisplay card={candidate.card} />
                  </div>
                </div>
              ))}

              {reforgedTiles.map((tile, index) => (
                <div
                  key={`done-${tile.entryId}`}
                  className="tf-slot is-done"
                  style={
                    { "--i": candidates.length + index } as CSSProperties
                  }
                >
                  <div
                    className="tf-done-tag"
                    style={
                      {
                        "--tf-tint": TRANSFIGURATION_COLORS[tile.type],
                      } as CSSProperties
                    }
                  >
                    <i
                      className={`bxf ${TRANSFIGURATION_ICONS[tile.type]}`}
                      aria-hidden="true"
                    />
                    Reforged
                  </div>
                  <div className="tf-pick-card is-done">
                    <CardDisplay card={tile.card} />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="tf-forge">
              <div className="tf-preview">
                <ForgePreview card={picked.card} form={activeForm} />
              </div>

              <div className="tf-options">
                {picked.forms.map((form) => {
                  const active = form.type === formType;
                  const affordable = form.essenceCost <= essence;
                  return (
                    <button
                      key={form.type}
                      type="button"
                      className={`tf-opt${active ? " active" : ""}${affordable ? "" : " unaffordable"}`}
                      style={
                        {
                          "--tf-otint": TRANSFIGURATION_COLORS[form.type],
                        } as CSSProperties
                      }
                      aria-pressed={active}
                      disabled={!affordable}
                      onClick={() => setFormType(form.type)}
                    >
                      <span className="tf-opt-ico">
                        <i
                          className={`bxf ${TRANSFIGURATION_ICONS[form.type]}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="tf-opt-body">
                        <span className="tf-opt-name">{form.type}</span>
                        <span className="tf-opt-desc">
                          {form.effectDescription}
                        </span>
                      </span>
                      <span className="tf-opt-cost">
                        {form.essenceCost === 0 ? (
                          <span className="tf-opt-free">Free</span>
                        ) : (
                          <EssenceValue
                            amount={form.essenceCost}
                            color="inherit"
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="tf-foot">
              <button type="button" className="tf-back" onClick={back}>
                <i className="bx bx-chevron-left" aria-hidden="true" /> Back
              </button>
              <div className="tf-wallet" data-testid="transfiguration-wallet">
                <span className="tf-wallet-label">Essence</span>
                <EssenceValue amount={essence} />
              </div>
              <div className="tf-foot-spacer" />
              <button
                type="button"
                className="tf-forge-btn"
                data-testid="transfiguration-confirm"
                disabled={
                  activeForm === null ||
                  forging ||
                  alreadyAccepted ||
                  !activeAffordable
                }
                onClick={confirm}
              >
                <i className="bxf bx-wrench" aria-hidden="true" />
                {forging
                  ? "Reforging..."
                  : activeForm !== null && !activeAffordable
                    ? "Not enough essence"
                    : activeForm !== null && activeForm.essenceCost > 0
                      ? "Transfigure it · "
                      : "Transfigure it"}
                {!forging &&
                activeAffordable &&
                activeForm !== null &&
                activeForm.essenceCost > 0 ? (
                  <EssenceValue amount={activeForm.essenceCost} color="inherit" />
                ) : null}
              </button>
            </div>
          </>
        )}
      </div>

      {/* collection target, bottom-right — where the reforged card lands. */}
      <div className="tf-tray" aria-hidden="true">
        <i className="bxf bx-layers" />
      </div>

      {guide}
    </div>
  );
}

/** The reforged-card preview: the picked card painted with the chosen form. */
function ForgePreview({
  card,
  form,
}: {
  card: CardData;
  form: FormOffer | null;
}) {
  const preview = useMemo(
    () => (form ? buildTransfigurationDisplay(card, form.type) : null),
    [card, form],
  );
  const color = form ? TRANSFIGURATION_COLORS[form.type] : "#a855f7";

  return (
    <div className="tf-preview-card">
      <div className="tf-flash" aria-hidden="true" />
      {preview ? (
        <CardDisplay
          card={preview.card}
          selected={true}
          selectionColor={color}
          transfiguration={preview.display}
        />
      ) : (
        <CardDisplay card={card} />
      )}
    </div>
  );
}
