import type { CardData } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type { JourneyState } from "../../types/journey";
import { resolveDeckEntryCard } from "../../card-type-change";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import type { TransfigurationData } from "../../types/transfiguration-data";
import type {
  JourneyDebugEditorView,
  JourneyDebugDeckEntryView,
  JourneyDebugDreamsignView,
} from "../../cumulus/screens/JourneyDebugEditorScreen";
import { assertLocalized } from "@trox/runtime";

/**
 * Builds the diagnostic editor's complete presentation model from live journey
 * state. Mutation addressing remains UUID- or entry-id-backed; positional
 * Dreamsign mutations carry their explicit provider address separately.
 */
export function buildJourneyDebugEditorView(
  transfigurationData: TransfigurationData,
  state: JourneyState,
  cardDatabase: ReadonlyMap<number, CardData>,
  dreamsignOptions: readonly DreamsignTemplate[],
): JourneyDebugEditorView {
  return {
    transfigurationOptions: [
      { value: "none", label: assertLocalized("None") },
      ...transfigurationData.forms.map((form) => ({
        value: form.id,
        label: assertLocalized(form.name),
      })),
    ],
    essence: state.essence,
    maxDreamsigns: state.maxDreamsigns,
    completionLevel: state.completionLevel,
    dreamsigns: state.dreamsigns.map(
      (dreamsign, index): JourneyDebugDreamsignView => ({
        actionId: `dreamsign:${index}`,
        templateId: dreamsign.id ?? null,
        name: assertLocalized(dreamsign.name),
      }),
    ),
    dreamsignOptions: dreamsignOptions.map((template) => ({
      id: template.id,
      name: assertLocalized(template.name),
    })),
    cards: [...cardDatabase.values()].map((card) => ({
      cardId: card.id,
      title: assertLocalized(card.name),
      model: { cardId: card.id, displaySnapshot: card },
    })),
    deck: state.deck.map((entry): JourneyDebugDeckEntryView => {
      const base = cardDatabase.get(entry.cardNumber);
      const displaySnapshot =
        base === undefined
          ? null
          : resolveDeckEntryCard(transfigurationData, base, entry);
      return {
        entryId: entry.entryId,
        name: assertLocalized(
          displaySnapshot?.name ?? `Unknown ${String(entry.cardNumber)}`,
        ),
        detail: assertLocalized(
          displaySnapshot === null
            ? "Card data is unavailable."
            : `${displaySnapshot.cardType}${displaySnapshot.subtype === "" ? "" : ` · ${displaySnapshot.subtype}`} · E ${displaySnapshot.energyCost === null ? "—" : String(displaySnapshot.energyCost)} · S ${displaySnapshot.spark === null ? "—" : String(displaySnapshot.spark)}`,
        ),
        isBane: entry.isBane,
        transfiguration: entry.transfiguration,
        typeChange: entry.typeChange ?? null,
        keywordModification: entry.keywordModification ?? null,
        statOverride: entry.statOverride ?? null,
        model:
          displaySnapshot === null
            ? null
            : {
                cardId: displaySnapshot.id,
                displaySnapshot,
                ...(entry.transfiguration === null || base === undefined
                  ? {}
                  : {
                      transfiguration: buildTransfigurationDisplay(
                        transfigurationData,
                        base,
                        entry.transfiguration,
                      ).display,
                    }),
              },
      };
    }),
  };
}
