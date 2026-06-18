import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { SiteState } from "../types/quest";
import { CardDisplay } from "../components/CardDisplay";
import { EssenceGlyph, EssenceValue } from "../components/EssenceValue";
import { RulesText } from "../components/RulesText";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { guideForSiteType } from "../data/dreamscapes";
import { guidePortraitUrl, dreamsignIconUrl } from "../atlas/atlas-display";
import {
  MAX_PURGE_PER_VISIT,
  maxAffordablePurgeCount,
  purgeCardPrice,
  purgeDiscountPercent,
  purgeVisitCost,
  type PurgePriceModifiers,
} from "../purge/purge-pricing";
import "./purge-site.css";

/** Props for the PurgeSiteScreen component. */
interface PurgeSiteScreenProps {
  site: SiteState;
}

/** How long the dissolve animation plays before the cards leave the deck. */
const PURGE_DISSOLVE_MS = 640;

/** The width each card slot occupies in the deck grid, in pixels. */
const CARD_SLOT_WIDTH = 148;

const ESSENCE_COLOR = "var(--color-essence)";

/**
 * The Purge site as an immersive, full-bleed scene. Master Takeshi opens the
 * quest deck over the dimmed dreamscape (supplied by the shared site scene
 * backdrop) so the player can spend escalating essence to remove cards for
 * good; banes — both bane cards and bane Dreamsigns — leave for free.
 *
 * Pricing escalates with each card removed this visit (see
 * src/purge/purge-pricing.ts), so thinning one or two cards stays cheap while
 * emptying a large part of the deck is a major commitment. The surface mirrors
 * the Dreamsign Revelation: a frosted summary HUD, a centered deck grid of
 * selectable cards, a de-emphasized "walk on" link beside the commit button,
 * and the resident guide with a speech bubble docked to the lower-left.
 */
export function PurgeSiteScreen({ site }: PurgeSiteScreenProps) {
  const { state, mutations, cardDatabase, questContent } = useQuest();
  const { deck, essence, dreamsigns } = state;

  // Master Takeshi tends every Purge site; resolve him from guide content so his
  // name, portrait, and dialog stay data-driven, matching the Revelation.
  const guide = useMemo(
    () => guideForSiteType(questContent.guides, "Purge"),
    [questContent.guides],
  );
  const guideLine = useMemo(() => {
    if (guide === null || guide.dialog.length === 0) return null;
    return guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }, [guide]);

  // Bane cards and bane Dreamsigns are removed for free. Bane cards live in the
  // deck and render inline with a free chip; bane Dreamsigns have no card art
  // and render as self-contained tiles after the deck.
  const baneDreamsignIndices = useMemo(
    () =>
      dreamsigns
        .map((dreamsign, index) => ({ dreamsign, index }))
        .filter(({ dreamsign }) => dreamsign.isBane)
        .map(({ index }) => index),
    [dreamsigns],
  );

  // Selected bane removals (free). Keyed `card:<entryId>` / `dreamsign:<index>`.
  const [selectedBaneKeys, setSelectedBaneKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleBane = useCallback((key: string) => {
    setSelectedBaneKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const modifiers: PurgePriceModifiers = useMemo(
    () => ({
      isEnhanced: site.isEnhanced,
      essenceDiscountPercent: state.shopModifiers.essenceDiscountPercent,
    }),
    [site.isEnhanced, state.shopModifiers.essenceDiscountPercent],
  );

  const discountPercent = purgeDiscountPercent(modifiers);

  const purgeableCount = useMemo(
    () => deck.filter((entry) => !entry.isBane).length,
    [deck],
  );

  // Selection is ordered so the price of each selected card reflects the order
  // it was chosen: the first card chosen is the cheapest.
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);

  // How many cards the player can afford this visit, capped by the per-visit
  // soft cap and the deck size.
  const affordableCount = useMemo(
    () =>
      Math.min(
        maxAffordablePurgeCount(essence, MAX_PURGE_PER_VISIT, modifiers),
        purgeableCount,
      ),
    [essence, modifiers, purgeableCount],
  );

  const selectedCount = selectedEntryIds.length;
  const totalCost = useMemo(
    () => purgeVisitCost(selectedCount, modifiers),
    [selectedCount, modifiers],
  );
  const nextCardPrice = purgeCardPrice(selectedCount + 1, modifiers);
  const canSelectMore = selectedCount < affordableCount;
  const atVisitLimit = selectedCount >= MAX_PURGE_PER_VISIT;
  const essenceAfter = Math.max(0, essence - totalCost);

  const toggleSelection = useCallback(
    (entryId: string) => {
      setSelectedEntryIds((prev) => {
        const index = prev.indexOf(entryId);
        if (index !== -1) {
          return prev.filter((id) => id !== entryId);
        }
        if (prev.length >= affordableCount) {
          return prev;
        }
        return [...prev, entryId];
      });
    },
    [affordableCount],
  );

  const selectedBaneCardEntryIds = useMemo(
    () =>
      deck
        .filter(
          (entry) =>
            entry.isBane && selectedBaneKeys.has(`card:${entry.entryId}`),
        )
        .map((entry) => entry.entryId),
    [deck, selectedBaneKeys],
  );
  const selectedBaneDreamsignIndices = useMemo(
    () =>
      baneDreamsignIndices.filter((index) =>
        selectedBaneKeys.has(`dreamsign:${String(index)}`),
      ),
    [baneDreamsignIndices, selectedBaneKeys],
  );
  const selectedBaneCount =
    selectedBaneCardEntryIds.length + selectedBaneDreamsignIndices.length;
  const removeCount = selectedCount + selectedBaneCount;

  // Entrance animation, mirroring the Revelation surface.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(id);
  }, []);

  // Slot keys mid-dissolve while a confirmed purge plays its animation.
  const [purging, setPurging] = useState<Set<string> | null>(null);

  useEffect(() => {
    // Log once per visit, on first mount.
    logEvent("site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: deck.length,
    });
  }, []);

  const handlePurge = useCallback(() => {
    if (removeCount === 0 || purging) return;

    const purgedEntries = selectedEntryIds
      .map((entryId) => deck.find((e) => e.entryId === entryId))
      .filter((entry): entry is (typeof deck)[number] => entry !== undefined);
    const purgedCardNumbers = purgedEntries.map((entry) => entry.cardNumber);
    const perCardPrices = purgedEntries.map((_, order) =>
      purgeCardPrice(order + 1, modifiers),
    );
    const cost = purgeVisitCost(purgedEntries.length, modifiers);

    // Mark the chosen slots as dissolving, then commit once the animation ends.
    const dissolving = new Set<string>([
      ...selectedEntryIds.map((entryId) => `slot:card:${entryId}`),
      ...selectedBaneCardEntryIds.map((entryId) => `slot:card:${entryId}`),
      ...selectedBaneDreamsignIndices.map(
        (index) => `slot:sign:${String(index)}`,
      ),
    ]);
    setPurging(dissolving);

    logEvent("purge_completed", {
      purgedCardNumbers,
      count: purgedCardNumbers.length,
      perCardPrices,
      totalCost: cost,
      banesRemovedCount: selectedBaneCount,
      baneCardsRemoved: selectedBaneCardEntryIds.length,
      baneDreamsignsRemoved: selectedBaneDreamsignIndices.length,
      isEnhanced: site.isEnhanced,
      discountPercent,
      essenceBefore: essence,
      essenceAfter: Math.max(0, essence - cost),
      completionLevel: state.completionLevel,
      currentDreamscape: state.currentDreamscape,
    });

    window.setTimeout(() => {
      mutations.purgeDeckCards(
        site.id,
        [
          ...purgedEntries.map((entry) => entry.entryId),
          ...selectedBaneCardEntryIds,
        ],
        cost,
        "purge",
        selectedBaneDreamsignIndices,
      );
      setSelectedEntryIds([]);
      setSelectedBaneKeys(new Set());
      setPurging(null);
    }, PURGE_DISSOLVE_MS);
  }, [
    removeCount,
    purging,
    selectedEntryIds,
    selectedBaneCount,
    selectedBaneCardEntryIds,
    selectedBaneDreamsignIndices,
    deck,
    modifiers,
    mutations,
    site.id,
    site.isEnhanced,
    discountPercent,
    essence,
    state.completionLevel,
    state.currentDreamscape,
  ]);

  const handleClose = useCallback(() => {
    if (purging) return;
    logEvent("site_completed", {
      siteType: "Purge",
      outcome: "skipped",
    });
    mutations.markSiteVisited(site.id);
    mutations.setScreen({ type: "dreamscape" });
  }, [mutations, purging, site.id]);

  const slotState = (key: string): string => {
    if (purging?.has(key)) return "purging";
    return mounted ? "show" : "enter";
  };

  return (
    <div
      className={`purge-site${mounted ? " mounted" : ""}`}
      data-testid="purge-site-screen"
    >
      {/* Summary HUD */}
      <div className="pg-summary">
        <div className="pg-cell">
          <span className="pg-cell-k">Essence after</span>
          <span className="pg-cell-v">
            <EssenceValue amount={essenceAfter} color="inherit" />
            <span className="unit">/ {essence}</span>
          </span>
        </div>
        <div className="pg-cell is-next">
          <span className="pg-cell-k">Next card</span>
          <span className="pg-cell-v">
            {atVisitLimit ? (
              <span className="pg-cell-note">Visit limit reached</span>
            ) : canSelectMore ? (
              <EssenceValue amount={nextCardPrice} color="inherit" />
            ) : (
              <span className="pg-cell-note">Not enough essence</span>
            )}
          </span>
        </div>
        {site.isEnhanced && (
          <div className="pg-cell is-enhanced" data-purge-enhanced="true">
            <span className="pg-cell-k">Enhanced</span>
            <span className="pg-cell-v">{discountPercent}% off</span>
          </div>
        )}
      </div>

      {/* Deck grid — paid cards, inline bane cards, then bane Dreamsign tiles. */}
      {deck.length === 0 && baneDreamsignIndices.length === 0 ? (
        <p className="pg-status">Your deck is empty.</p>
      ) : (
        <div
          className="pg-deck"
          style={{ "--pg-cardw": `${CARD_SLOT_WIDTH}px` } as CSSProperties}
        >
          {deck.map((entry, index) => {
            const card = cardDatabase.get(entry.cardNumber);
            if (!card) return null;
            const slotKey = `slot:card:${entry.entryId}`;
            const baneKey = `card:${entry.entryId}`;

            if (entry.isBane) {
              const isSelected = selectedBaneKeys.has(baneKey);
              return (
                <div
                  key={entry.entryId}
                  className={`pg-slot is-bane ${slotState(slotKey)}${isSelected ? " selected" : ""}`}
                  style={{ "--i": index } as CSSProperties}
                  data-purge-bane-key={baneKey}
                  data-purge-bane-selected={isSelected ? "true" : "false"}
                >
                  <div className="pg-chip free">
                    <i className="bxf bx-wind" aria-hidden="true" /> Free
                  </div>
                  <div className="pg-bane-tag">Bane</div>
                  <div className="pg-bane-wash" aria-hidden="true" />
                  <CardDisplay
                    card={card}
                    onClick={() => toggleBane(baneKey)}
                    selected={isSelected}
                    selectionColor="#ef4444"
                  />
                </div>
              );
            }

            const order = selectedEntryIds.indexOf(entry.entryId);
            const isSelected = order !== -1;
            const cardPrice = isSelected
              ? purgeCardPrice(order + 1, modifiers)
              : null;
            const disabled = !isSelected && !canSelectMore;
            return (
              <div
                key={entry.entryId}
                className={`pg-slot ${slotState(slotKey)}${isSelected ? " selected" : ""}${disabled ? " disabled" : ""}`}
                style={{ "--i": index } as CSSProperties}
                data-purge-card-selected={isSelected ? "true" : "false"}
              >
                {cardPrice !== null && (
                  <div className="pg-chip">
                    <EssenceGlyph /> {cardPrice}
                  </div>
                )}
                <CardDisplay
                  card={card}
                  onClick={
                    disabled ? undefined : () => toggleSelection(entry.entryId)
                  }
                  selected={isSelected}
                  selectionColor="#ef4444"
                />
              </div>
            );
          })}

          {baneDreamsignIndices.map((dsIndex, gridIndex) => {
            const dreamsign = dreamsigns[dsIndex];
            const baneKey = `dreamsign:${String(dsIndex)}`;
            const slotKey = `slot:sign:${String(dsIndex)}`;
            const isSelected = selectedBaneKeys.has(baneKey);
            return (
              <div
                key={baneKey}
                className={`pg-slot is-bane ${slotState(slotKey)}${isSelected ? " selected" : ""}`}
                style={{ "--i": deck.length + gridIndex } as CSSProperties}
                data-purge-bane-key={baneKey}
                data-purge-bane-selected={isSelected ? "true" : "false"}
              >
                <div className="pg-chip free">
                  <i className="bxf bx-wind" aria-hidden="true" /> Free
                </div>
                <div
                  className="pg-sign"
                  role="button"
                  tabIndex={0}
                  aria-label={`Bane Dreamsign: ${dreamsign.name}`}
                  onClick={() => toggleBane(baneKey)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleBane(baneKey);
                    }
                  }}
                >
                  <div className="pg-bane-tag">Bane</div>
                  {dreamsign.imageName ? (
                    <img
                      className="pg-sign-art"
                      src={dreamsignIconUrl(String(dreamsign.imageName))}
                      alt={dreamsign.imageAlt ?? dreamsign.name}
                    />
                  ) : (
                    <div className="pg-sign-fallback" aria-hidden="true">
                      ✦
                    </div>
                  )}
                  <div className="pg-sign-name">{dreamsign.name}</div>
                  <div className="pg-sign-rule">
                    <RulesText text={dreamsign.effectDescription} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="pg-foot">
        <button
          type="button"
          className="pg-walk"
          data-testid="purge-walk-on"
          onClick={handleClose}
        >
          Walk on
        </button>
        <button
          type="button"
          className="pg-purge-btn"
          data-testid="purge-confirm"
          disabled={removeCount === 0 || purging !== null}
          onClick={handlePurge}
        >
          <i className="bxf bx-hot" aria-hidden="true" />
          {removeCount === 0
            ? "Purge cards"
            : `Purge ${String(removeCount)} ${removeCount === 1 ? "card" : "cards"}`}
          {selectedCount > 0 && (
            <span className="pg-purge-cost">
              {" · "}
              <EssenceValue amount={totalCost} color={ESSENCE_COLOR} />
            </span>
          )}
        </button>
      </div>

      {/* Master Takeshi + speech bubble */}
      {guide !== null && (
        <div className="pg-guide" aria-hidden="true">
          <div className="pg-bubble">
            <span className="pg-bubble-mono">{guide.name}</span>
            {guideLine !== null && <p>{`“${guideLine}”`}</p>}
          </div>
          <img
            className="pg-takeshi"
            src={guidePortraitUrl(guide.id)}
            alt={guide.name}
          />
        </div>
      )}
    </div>
  );
}
