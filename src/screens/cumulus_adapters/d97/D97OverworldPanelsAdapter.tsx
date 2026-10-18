// Adapter for the panels over the D97 overworld: the deck editor, the
// encounter preview, the quest surfaces (conversation, quest log, pending
// reward), the shop and the Menu, each shown while the overworld's open panel
// (./use-d97-interactions.ts) names it. Every equip and unequip is recorded
// as an intent. Wiring only.

import { useCallback, useMemo } from "react";
import { D97_COLLECTION } from "../../../content/d97/collection";
import { D97DeckEditorScreen } from "../../../cumulus/screens/d97/D97DeckEditorScreen";
import { D97EncounterPreview } from "../../../cumulus/screens/d97/D97EncounterPreview";
import { D97MenuPanel } from "../../../cumulus/screens/d97/D97MenuPanel";
import type { D97DialogueCatalog } from "../../../d97/dialogue/catalog";
import type { OverworldOccupants } from "../../../d97/overworld/occupants";
import type { D97Run } from "../../../rules/d97/d97-state";
import { useActions } from "../../../session/hooks";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";
import type { D97OwnedCopyId } from "../../../types/identifiers";
import { buildD97DeckEditorView } from "./d97-deck-editor-view-model";
import { D97QuestSurfacesAdapter } from "./D97QuestSurfacesAdapter";
import { D97ShopAdapter } from "./D97ShopAdapter";
import { useD97EncounterPreview } from "./use-d97-encounter";
import type { D97Interactions } from "./use-d97-interactions";

function reportFailure(error: unknown): void {
  console.error("D97 deck edit failed", error);
}

export function D97OverworldPanelsAdapter({
  run,
  interactions,
  occupants,
  catalog,
  cards,
  avatars,
}: {
  readonly run: D97Run;
  readonly interactions: D97Interactions;
  readonly occupants: OverworldOccupants;
  readonly catalog: D97DialogueCatalog;
  readonly cards: ReadonlyMap<CardId, CardData>;
  readonly avatars: readonly AvatarContent[];
}) {
  const actions = useActions();
  const { panel } = interactions;
  const anchorOf = (kind: "conversation" | "shop" | "preview") => (panel !== null && panel.kind === kind ? panel.anchorId : null);
  const shopAnchorId = anchorOf("shop");
  const preview = useD97EncounterPreview({ run, anchorId: anchorOf("preview"), avatars, cardsById: cards, occupants, dialogues: catalog.dialogues });
  const deckView = useMemo(() => buildD97DeckEditorView(run.collection, cards, D97_COLLECTION.minimumDeckSize), [run.collection, cards]);
  const equip = useCallback(
    (copyId: D97OwnedCopyId) => void actions.d97({ type: "D97_EQUIP_COPY", payload: { copyId } }).catch(reportFailure),
    [actions],
  );
  const unequip = useCallback(
    (copyId: D97OwnedCopyId) => void actions.d97({ type: "D97_UNEQUIP_COPY", payload: { copyId } }).catch(reportFailure),
    [actions],
  );

  return (
    <>
      <D97DeckEditorScreen isOpen={panel?.kind === "deck"} view={deckView} onEquip={equip} onUnequip={unequip} onClose={interactions.closeDeck} />
      {preview !== null && <D97EncounterPreview view={preview} onFight={interactions.fight} onNotNow={interactions.notNow} />}
      <D97QuestSurfacesAdapter
        run={run}
        catalog={catalog}
        occupants={occupants}
        cards={cards}
        avatars={avatars}
        conversationAnchorId={anchorOf("conversation")}
        questLogOpen={panel?.kind === "quests"}
        onChallenge={interactions.challenge}
        onOpenShop={interactions.openShop}
        onClose={interactions.close}
      />
      {shopAnchorId !== null && (
        <D97ShopAdapter
          run={run}
          anchorId={shopAnchorId}
          keeper={occupants.get(shopAnchorId)}
          dialogues={catalog.dialogues}
          cards={cards}
          onClose={interactions.close}
        />
      )}
      {panel?.kind === "menu" && <D97MenuPanel onClose={interactions.close} />}
    </>
  );
}
