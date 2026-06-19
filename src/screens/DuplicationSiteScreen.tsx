import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { SiteState, DeckEntry } from "../types/quest";
import type { CardData } from "../types/cards";
import { CardDisplay } from "../components/CardDisplay";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { SiteGuide } from "../components/SiteGuide";
import "./duplication-site.css";

/** Props for the DuplicationSiteScreen component. */
interface DuplicationSiteScreenProps {
  site: SiteState;
}

/** A deck entry paired with a deterministic copy count for duplication. */
interface DuplicationCandidate {
  entry: DeckEntry;
  card: CardData;
  copyCount: number;
}

/** How long the copy "lifts away" before the mutation returns to the map. */
const DUPLICATE_LIFT_MS = 640;

/** Width each card slot occupies in the deck grid, in pixels. */
const CARD_SLOT_WIDTH = 168;

const ACCENT_COLOR = "#c084fc";

/**
 * The number of copies a given deck entry yields at a given site, derived
 * deterministically so the offer is stable across re-renders and matches the
 * count the `acceptDuplicationChoice` mutation will commit.
 */
export function duplicationCopyCount(siteId: string, entryId: string): number {
  let hash = 0;
  for (const char of `${siteId}:${entryId}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 4) + 1;
}

/** Builds duplication candidates from the shared runtime's entry ids. */
function buildCandidates(
  deck: DeckEntry[],
  cardDatabase: Map<number, CardData>,
  siteId: string,
  entryIds: readonly string[],
): DuplicationCandidate[] {
  const deckByEntryId = new Map(deck.map((entry) => [entry.entryId, entry]));
  const candidates: DuplicationCandidate[] = [];
  for (const entryId of entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (!card) continue;
    const copyCount = duplicationCopyCount(siteId, entryId);
    candidates.push({ entry, card, copyCount });
  }
  return candidates;
}

/**
 * The Duplication site as an immersive, full-bleed scene. Deacon Holt opens the
 * quest deck over the dimmed dreamscape (supplied by the shared site scene
 * backdrop) so the player can pick one card and add copies of it to the deck.
 *
 * The surface mirrors the sibling Purge and Dreamsign Revelation screens: a
 * frosted summary HUD, a centered deck grid of selectable cards, a
 * de-emphasized "walk on" link beside the commit button, and the resident
 * guide with a speech bubble docked to the lower-left in landscape. At an
 * enhanced site (Hope's End, Holt's home) the runtime surfaces the entire deck
 * to choose from; otherwise it surfaces a small random hand. Either way the
 * interaction is the same: select one card, then confirm. The copy count each
 * card yields (1–4) is fixed per card and surfaced on its chip and in the HUD.
 */
export function DuplicationSiteScreen({ site }: DuplicationSiteScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { deck } = state;
  const runtime = state.siteRuntime[site.id];
  const cardChoiceRuntime =
    runtime !== undefined &&
    runtime.kind === "cardChoice" &&
    runtime.choiceKind === "duplication"
      ? runtime
      : null;

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureCardChoiceRuntime(site.id, "duplication");
    }
  }, [mutations, runtime, site.id]);

  const candidates = useMemo(
    () =>
      cardChoiceRuntime === null
        ? []
        : buildCandidates(
            deck,
            cardDatabase,
            site.id,
            cardChoiceRuntime.entryIds ?? [],
          ),
    [cardChoiceRuntime, cardDatabase, deck, site.id],
  );

  // A choice already committed this visit (e.g. a re-render before the return
  // to the map) locks the surface so the offer cannot be taken twice.
  const duplicated = (cardChoiceRuntime?.acceptedEntryIds?.length ?? 0) > 0;

  // The selected entry id; single-select, toggled off by re-clicking.
  const [pickedEntryId, setPickedEntryId] = useState<string | null>(null);
  // Entrance + lift animation, mirroring the Purge surface.
  const [mounted, setMounted] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    // Log once per visit, on first mount, for behaviour reconstruction.
    logEvent("site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: deck.length,
      candidateCount: cardChoiceRuntime?.entryIds?.length ?? 0,
    });
  }, []);

  const picked = useMemo(
    () => candidates.find((c) => c.entry.entryId === pickedEntryId) ?? null,
    [candidates, pickedEntryId],
  );

  const toggle = useCallback(
    (entryId: string) => {
      if (copying || duplicated) return;
      setPickedEntryId((prev) => (prev === entryId ? null : entryId));
    },
    [copying, duplicated],
  );

  const handleConfirm = useCallback(() => {
    if (picked === null || copying || duplicated) return;
    const { entry, copyCount } = picked;
    setCopying(true);

    logEvent("duplication_completed", {
      siteId: site.id,
      entryId: entry.entryId,
      cardNumber: entry.cardNumber,
      copyCount,
      isEnhanced: site.isEnhanced,
      deckSizeBefore: deck.length,
      deckSizeAfter: deck.length + copyCount,
      currentDreamscape: state.currentDreamscape,
      completionLevel: state.completionLevel,
    });

    // Let the copy lift away, then commit; the mutation returns to the map.
    window.setTimeout(() => {
      mutations.acceptDuplicationChoice(site.id, entry.entryId, copyCount);
    }, DUPLICATE_LIFT_MS);
  }, [
    picked,
    copying,
    duplicated,
    mutations,
    site.id,
    site.isEnhanced,
    deck.length,
    state.currentDreamscape,
    state.completionLevel,
  ]);

  const handleClose = useCallback(() => {
    if (copying) return;
    logEvent("site_completed", {
      siteType: "Duplication",
      outcome: "skipped",
    });
    mutations.completeSite(site.id, "duplication_skipped");
  }, [copying, mutations, site.id]);

  if (cardChoiceRuntime === null) {
    return (
      <div className="duplication-site is-status" data-testid="duplication-site-screen">
        <p className="dup-status">Preparing choices...</p>
      </div>
    );
  }

  const hasPick = picked !== null;
  const copyCount = picked?.copyCount ?? 0;
  const deckAfter = deck.length + copyCount;

  const slotState = (selected: boolean): string => {
    if (copying && selected) return "copying";
    return mounted ? "show" : "enter";
  };

  return (
    <div
      className={`duplication-site${mounted ? " mounted" : ""}`}
      data-testid="duplication-site-screen"
    >
      {/* Summary HUD */}
      <div className="dup-summary">
        <div className="dup-cell">
          <span className="dup-cell-k">Deck after</span>
          <span className="dup-cell-v">
            {deckAfter}
            <span className="unit">/ {deck.length}</span>
          </span>
        </div>
        <div className="dup-cell is-copies">
          <span className="dup-cell-k">Copies added</span>
          <span className="dup-cell-v">
            {hasPick ? (
              `×${String(copyCount)}`
            ) : (
              <span className="dup-cell-note">Pick a card</span>
            )}
          </span>
        </div>
        {site.isEnhanced && (
          <div className="dup-cell is-enhanced" data-duplication-enhanced="true">
            <span className="dup-cell-k">Enhanced</span>
            <span className="dup-cell-v">Any card</span>
          </div>
        )}
      </div>

      {/* Deck grid — one selectable card per candidate. */}
      {candidates.length === 0 ? (
        <p className="dup-status">No cards available.</p>
      ) : (
        <div
          className="dup-deck"
          style={{ "--dup-cardw": `${CARD_SLOT_WIDTH}px` } as CSSProperties}
        >
          {candidates.map((candidate, index) => {
            const entryId = candidate.entry.entryId;
            const selected = pickedEntryId === entryId;
            const dimmed = hasPick && !selected;
            return (
              <div
                key={entryId}
                className={`dup-slot ${slotState(selected)}${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
                style={{ "--i": index } as CSSProperties}
                data-duplication-entry={entryId}
                data-duplication-selected={selected ? "true" : "false"}
              >
                {/* copy-count chip, brightened when this card is chosen */}
                <div className="dup-chip">
                  <i className="bxf bx-copy" aria-hidden="true" />
                  {`×${String(candidate.copyCount)}`}
                </div>

                <div className="dup-card-wrap">
                  {/* ghost copy slides out behind the chosen card */}
                  <div className="dup-ghost" aria-hidden="true">
                    <CardDisplay card={candidate.card} />
                  </div>

                  <div
                    className="dup-card"
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`Duplicate ${candidate.card.name} (${String(candidate.copyCount)} ${candidate.copyCount === 1 ? "copy" : "copies"})`}
                    onClick={() => toggle(entryId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(entryId);
                      }
                    }}
                  >
                    <CardDisplay
                      card={candidate.card}
                      selected={selected}
                      selectionColor={ACCENT_COLOR}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="dup-foot">
        <button
          type="button"
          className="dup-walk"
          data-testid="duplication-walk-on"
          onClick={handleClose}
        >
          Walk on
        </button>
        <button
          type="button"
          className="dup-dupe-btn"
          data-testid="duplication-confirm"
          disabled={!hasPick || copying || duplicated}
          onClick={handleConfirm}
        >
          <i className="bxf bx-copy" aria-hidden="true" />
          Duplicate this card
          {hasPick && (
            <span className="dup-dupe-count">{`×${String(copyCount)}`}</span>
          )}
        </button>
      </div>

      {/* collection target, bottom-right — where the copy lands on confirm */}
      <div className="dup-tray" aria-hidden="true">
        <i className="bxf bx-layers" />
      </div>

      {/* Deacon Holt (shared SiteGuide), docked lower-left in landscape. */}
      <SiteGuide siteType="Duplication" isEnhanced={site.isEnhanced} />
    </div>
  );
}
