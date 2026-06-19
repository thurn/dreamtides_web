import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { SiteState, DeckEntry } from "../types/quest";
import type { CardData } from "../types/cards";
import { CardDisplay } from "../components/CardDisplay";
import { SiteGuide } from "../components/SiteGuide";
import { SiteCloseButton } from "../components/SiteCloseButton";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import {
  buildTransfigurationDisplay,
  TRANSFIGURATION_COLORS,
  transfigurationEffectDetails,
  type TransfigurationOffer,
} from "../transfiguration/transfiguration-logic";
import "./transfiguration-site.css";

/** Props for the TransfigurationSiteScreen component. */
interface TransfigurationSiteScreenProps {
  site: SiteState;
}

/** A deck entry paired with its assigned transfiguration offer. */
interface TransfigurationCandidate {
  entry: DeckEntry;
  card: CardData;
  offer: TransfigurationOffer;
}

/** Builds transfiguration candidates from shared runtime entry ids. */
function buildCandidates(
  deck: DeckEntry[],
  cardDatabase: Map<number, CardData>,
  offers: readonly {
    entryId: string;
    type: TransfigurationOffer["type"];
    effectDescription: string;
    previewCard: CardData;
  }[],
): TransfigurationCandidate[] {
  const deckByEntryId = new Map(deck.map((entry) => [entry.entryId, entry]));
  const candidates: TransfigurationCandidate[] = [];
  for (const runtimeOffer of offers) {
    const entry = deckByEntryId.get(runtimeOffer.entryId);
    if (entry === undefined || entry.transfiguration !== null) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (!card) continue;
    candidates.push({
      entry,
      card,
      offer: {
        type: runtimeOffer.type,
        description: runtimeOffer.effectDescription,
        previewCard: runtimeOffer.previewCard,
      },
    });
  }
  return candidates;
}

/**
 * The Transfiguration site as an immersive, full-bleed scene. Durgan
 * Forgehammer (the shared {@link SiteGuide}) offers to reforge a card over the
 * dimmed dreamscape. The surface mirrors the Purge and Duplication screens: no
 * heading (the guide's bubble carries the narration), a centered row of
 * before -> after card pairs the player accepts one of, and a red close button
 * in the top-right corner to leave. When enhanced, the player first picks any
 * untransfigured card from a deck grid and then reviews its single preview.
 */
export function TransfigurationSiteScreen({
  site,
}: TransfigurationSiteScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { deck } = state;
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
    // Log once per visit, on first mount.
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
  const acceptedEntryIds = useMemo(
    () => new Set(cardChoiceRuntime?.acceptedEntryIds ?? []),
    [cardChoiceRuntime],
  );

  // Enhanced mode: pick from full deck.
  const [enhancedPickedEntry, setEnhancedPickedEntry] =
    useState<DeckEntry | null>(null);
  const [enhancedOffer, setEnhancedOffer] =
    useState<TransfigurationOffer | null>(null);
  const [enhancedAccepted, setEnhancedAccepted] = useState(false);

  const handleAccept = useCallback(
    (candidate: TransfigurationCandidate) => {
      if (acceptedEntryIds.size > 0) return;
      mutations.acceptTransfigurationChoice(
        site.id,
        candidate.entry.entryId,
        candidate.offer.type,
        candidate.offer.description,
        transfigurationEffectDetails(candidate.offer, candidate.card),
      );
    },
    [mutations, acceptedEntryIds.size, site.id],
  );

  const handleEnhancedPick = useCallback(
    (entry: DeckEntry) => {
      const candidate = candidates.find(
        (option) => option.entry.entryId === entry.entryId,
      );
      if (candidate === undefined) return;
      setEnhancedPickedEntry(candidate.entry);
      setEnhancedOffer(candidate.offer);
    },
    [candidates],
  );

  const handleEnhancedAccept = useCallback(() => {
    if (!enhancedPickedEntry || !enhancedOffer) return;
    const card = cardDatabase.get(enhancedPickedEntry.cardNumber);
    if (!card) return;
    mutations.acceptTransfigurationChoice(
      site.id,
      enhancedPickedEntry.entryId,
      enhancedOffer.type,
      enhancedOffer.description,
      transfigurationEffectDetails(enhancedOffer, card),
    );
    setEnhancedAccepted(true);
  }, [enhancedPickedEntry, enhancedOffer, mutations, cardDatabase, site.id]);

  const handleEnhancedReject = useCallback(() => {
    setEnhancedPickedEntry(null);
    setEnhancedOffer(null);
  }, []);

  const handleClose = useCallback(() => {
    mutations.completeSite(site.id, "transfiguration_skipped");
  }, [mutations, site.id]);

  const guide = (
    <>
      <SiteGuide siteType="Transfiguration" isEnhanced={site.isEnhanced} />
      <SiteCloseButton onClose={handleClose} testId="transfiguration-close" />
    </>
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

  // Enhanced mode: full-deck browser for picking, then a single preview.
  if (site.isEnhanced) {
    return (
      <div
        className={`transfiguration-site${mounted ? " mounted" : ""}`}
        data-testid="transfiguration-site-screen"
      >
        <div className="tf-summary" data-transfiguration-enhanced="true">
          <span className="tf-summary-star" aria-hidden="true">
            {"⭐"}
          </span>
          {enhancedPickedEntry
            ? "Review the reforging below."
            : "Enhanced — choose any card to reforge."}
        </div>

        {!enhancedPickedEntry && (
          <div className="tf-deck">
            {candidates.map((candidate) => (
              <div
                key={candidate.entry.entryId}
                className="tf-slot"
                onClick={() => handleEnhancedPick(candidate.entry)}
              >
                <CardDisplay card={candidate.card} />
              </div>
            ))}
          </div>
        )}

        {enhancedPickedEntry && enhancedOffer && !enhancedAccepted && (
          <EnhancedPreview
            entry={enhancedPickedEntry}
            offer={enhancedOffer}
            cardDatabase={cardDatabase}
            onAccept={handleEnhancedAccept}
            onReject={handleEnhancedReject}
          />
        )}

        {enhancedAccepted && (
          <p className="tf-status" style={{ color: "#10b981" }}>
            The card is reforged.
          </p>
        )}

        {guide}
      </div>
    );
  }

  // Normal mode: a row of fixed candidate reforgings.
  return (
    <div
      className={`transfiguration-site${mounted ? " mounted" : ""}`}
      data-testid="transfiguration-site-screen"
    >
      {candidates.length === 0 ? (
        <p className="tf-status">No eligible cards to reforge.</p>
      ) : (
        <div className="tf-row">
          {candidates.map((candidate, index) => {
            const isAccepted = acceptedEntryIds.has(candidate.entry.entryId);
            const color = TRANSFIGURATION_COLORS[candidate.offer.type];
            const preview = buildTransfigurationDisplay(
              candidate.card,
              candidate.offer.type,
            );
            return (
              <div
                key={candidate.entry.entryId}
                className="tf-col"
                style={
                  { "--i": index, "--tf-accent": color } as CSSProperties
                }
              >
                <span className="tf-type">{candidate.offer.type}</span>

                <div className="tf-preview-card">
                  <CardDisplay
                    card={preview.card}
                    selected={true}
                    selectionColor={color}
                    transfiguration={preview.display}
                  />
                </div>

                <p className="tf-desc">{candidate.offer.description}</p>

                {isAccepted ? (
                  <div className="tf-state applied">Reforged</div>
                ) : acceptedEntryIds.size > 0 ? (
                  <div className="tf-state unavailable">Unavailable</div>
                ) : (
                  <button
                    type="button"
                    className="tf-accept"
                    onClick={() => handleAccept(candidate)}
                  >
                    Accept {candidate.offer.type}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {guide}
    </div>
  );
}

/** Renders the enhanced mode preview for a single picked card. */
function EnhancedPreview({
  entry,
  offer,
  cardDatabase,
  onAccept,
  onReject,
}: {
  entry: DeckEntry;
  offer: TransfigurationOffer;
  cardDatabase: Map<number, CardData>;
  onAccept: () => void;
  onReject: () => void;
}) {
  const card = cardDatabase.get(entry.cardNumber);
  if (!card) return null;

  const color = TRANSFIGURATION_COLORS[offer.type];
  const preview = buildTransfigurationDisplay(card, offer.type);

  return (
    <div
      className="tf-preview"
      style={{ "--tf-accent": color } as CSSProperties}
    >
      <div className="tf-card">
        <CardDisplay card={card} />
      </div>

      <div className="tf-arrow">
        <span className="tf-arrow-glyph" aria-hidden="true">
          {"↓"}
        </span>
        <span className="tf-type">{offer.type}</span>
      </div>

      <p className="tf-desc">{offer.description}</p>

      <div className="tf-preview-card">
        <CardDisplay
          card={preview.card}
          selected={true}
          selectionColor={color}
          transfiguration={preview.display}
        />
      </div>

      <div className="tf-preview-actions">
        <button type="button" className="tf-accept" onClick={onAccept}>
          Accept
        </button>
        <button type="button" className="tf-reject" onClick={onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}
