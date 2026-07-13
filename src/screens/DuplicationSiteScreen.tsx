import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { SiteState, DeckEntry } from "../types/quest";
import type { CardData } from "../types/cards";
import { CardDisplay } from "../components/CardDisplay";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { SiteGuide } from "../components/SiteGuide";
import { Button } from "../cumulus/components/controls/Button";
import { IconButton } from "../cumulus/components/controls/IconButton";
import { GLYPHS } from "../cumulus/primitives/glyph";
import "./duplication-site.css";
import "./site-leave-control.css";

/** Props for the DuplicationSiteScreen component. */
interface DuplicationSiteScreenProps {
  site: SiteState;
}

/** A deck entry eligible to be duplicated. */
interface DuplicationCandidate {
  entry: DeckEntry;
  card: CardData;
}

/** How long the copy "lifts away" before the mutation returns to the map. */
const DUPLICATE_LIFT_MS = 640;

/** Width each card slot occupies in the deck grid, in pixels. */
const CARD_SLOT_WIDTH = 168;

const ACCENT_COLOR = "#c084fc";

/** Builds duplication candidates from the shared runtime's entry ids. */
function buildCandidates(
  deck: DeckEntry[],
  cardDatabase: Map<number, CardData>,
  entryIds: readonly string[],
): DuplicationCandidate[] {
  const deckByEntryId = new Map(deck.map((entry) => [entry.entryId, entry]));
  const candidates: DuplicationCandidate[] = [];
  for (const entryId of entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (!card) continue;
    candidates.push({ entry, card });
  }
  return candidates;
}

/**
 * The Duplication site as an immersive, full-bleed scene. Deacon Holt opens the
 * quest deck over the dimmed dreamscape (supplied by the shared site scene
 * backdrop) so the player can pick one card and add copies of it to the deck.
 *
 * The surface mirrors the sibling Purge and Dreamsign Revelation screens: a
 * frosted summary HUD, a centered deck grid of selectable cards, the commit
 * button in the footer, a top-right leave icon button,
 * and the resident guide with a speech bubble docked to the lower-left in
 * landscape. At an
 * enhanced site (Hope's End, Holt's home) the runtime surfaces the entire deck
 * to choose from; otherwise it surfaces a small random hand. Either way the
 * interaction is the same: select one card, then confirm to add one copy of it
 * to the deck.
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
        : buildCandidates(deck, cardDatabase, cardChoiceRuntime.entryIds ?? []),
    [cardChoiceRuntime, cardDatabase, deck],
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
    const { entry } = picked;
    setCopying(true);

    logEvent("duplication_completed", {
      siteId: site.id,
      entryId: entry.entryId,
      cardNumber: entry.cardNumber,
      copyCount: 1,
      isEnhanced: site.isEnhanced,
      deckSizeBefore: deck.length,
      deckSizeAfter: deck.length + 1,
      currentDreamscape: state.currentDreamscape,
      completionLevel: state.completionLevel,
    });

    // Let the copy lift away, then commit; the mutation returns to the map.
    window.setTimeout(() => {
      mutations.acceptDuplicationChoice(site.id, entry.entryId);
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
  const slotState = (selected: boolean): string => {
    if (copying && selected) return "copying";
    return mounted ? "show" : "enter";
  };

  return (
    <div
      className={`duplication-site${mounted ? " mounted" : ""}`}
      data-testid="duplication-site-screen"
    >
      {/* Top bar: the duplicate commit button pinned right so the way to
          confirm is always visible above the scrolling deck. */}
      <div
        className={`dup-topbar${site.isEnhanced ? " is-enhanced" : ""}`}
      >
        <div className="dup-summary">
          {site.isEnhanced && (
            <div className="dup-cell is-enhanced" data-duplication-enhanced="true">
              <span className="dup-cell-k">Enhanced</span>
              <span className="dup-cell-v">Any card</span>
            </div>
          )}
        </div>

        <div
          className="cumulus duplication-confirm-control"
          data-testid="duplication-confirm"
        >
          <Button
            label="Duplicate this card"
            disabled={!hasPick || copying || duplicated}
            onClick={handleConfirm}
          />
        </div>
      </div>

      {/* Scrollable deck area — one selectable card per candidate. The scroll is
          contained below the fixed top bar so the first row never slips above
          the top edge. */}
      {candidates.length === 0 ? (
        <p className="dup-status">No cards available.</p>
      ) : (
        <div className="dup-scroll">
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
                    aria-label={`Duplicate ${candidate.card.name}`}
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
        </div>
      )}

      {/* collection target, bottom-right — where the copy lands on confirm */}
      <div className="dup-tray" aria-hidden="true">
        <i className="bxf bx-layers" />
      </div>

      {/* Deacon Holt (shared SiteGuide), docked lower-left in landscape. */}
      <SiteGuide siteType="Duplication" isEnhanced={site.isEnhanced} />

      <div className="cumulus site-leave-control">
        <IconButton
          glyph={GLYPHS.close}
          label="Leave site"
          onPress={handleClose}
          testId="duplication-walk-on"
          disabled={copying || duplicated}
        />
      </div>
    </div>
  );
}
