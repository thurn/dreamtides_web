import { invoke } from "@tauri-apps/api/core";
import type { CardData } from "../../src/types/cards";

export interface Affiliation {
  id: string;
  name: string;
  atlas_card_theme: string;
  signature_card_ids: string[];
}

export interface EditorSnapshot {
  dataset: "affiliations";
  repositoryRoot: string;
  sourceRevision: string;
  default_random_draw_max_multiplier: number;
  default_opponent_deck_max_multiplier: number;
  affiliations: Affiliation[];
  cards: CardData[];
}

export type EditorOperation =
  | { operation: "set_affiliation_catalog_field"; field: string; value: number }
  | { operation: "set_affiliation_field"; affiliation_id: string; field: string; value: string }
  | { operation: "replace_affiliation_signature_cards"; affiliation_id: string; card_ids: string[] };
export type EditorOperationFactory = (current: EditorSnapshot) => EditorOperation;

export interface EditorTransport {
  load(): Promise<EditorSnapshot>;
  open(path: string): Promise<EditorSnapshot>;
  save(operation: EditorOperation, revision: string): Promise<EditorSnapshot>;
}

export function updateSignatureCards(
  affiliationId: string,
  update: (ids: string[]) => string[],
): EditorOperationFactory {
  return (current) => {
    const affiliation = current.affiliations.find((entry) => entry.id === affiliationId);
    if (!affiliation) throw new Error(`Affiliation ${affiliationId} is unavailable`);
    return {
      operation: "replace_affiliation_signature_cards",
      affiliation_id: affiliationId,
      card_ids: update(affiliation.signature_card_ids),
    };
  };
}

export function searchAvailableCards(
  cards: readonly CardData[],
  selectedIds: readonly string[],
  query: string,
  cardType: string,
): CardData[] {
  const selected = new Set(selectedIds);
  const normalized = query.trim().toLocaleLowerCase();
  return cards.filter((card) => {
    if (selected.has(card.id)) return false;
    if (cardType !== "all" && card.cardType !== cardType) return false;
    return normalized === "" || [card.name, card.renderedText, card.subtype, card.id]
      .some((value) => String(value).toLocaleLowerCase().includes(normalized));
  }).sort((first, second) => first.name.localeCompare(second.name));
}

class NativeTransport implements EditorTransport {
  load = () => invoke<EditorSnapshot>("load_editor_snapshot");
  open = (path: string) => invoke<EditorSnapshot>("open_repository", { path });
  save = (operation: EditorOperation, revision: string) =>
    invoke<EditorSnapshot>("save_editor_operation", { operation, expectedSourceRevision: revision });
}

const FIXTURE_IDS = [
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
];

class DemoTransport implements EditorTransport {
  private snapshot?: EditorSnapshot;
  async load() {
    if (this.snapshot) return structuredClone(this.snapshot);
    const cards = await fetch("/cards_v2-data.json").then((response) => response.json()) as CardData[];
    this.snapshot = {
      dataset: "affiliations", repositoryRoot: "Demo repository", sourceRevision: "demo-1",
      default_random_draw_max_multiplier: 1.25, default_opponent_deck_max_multiplier: 3.5,
      affiliations: [
        { id: "0ee6bf31-2588-4fb7-ac16-8348480c94bd", name: "Radiant Exiles", atlas_card_theme: "dawnlit ruins", signature_card_ids: FIXTURE_IDS },
        { id: "74f5d8bc-2db4-4075-9fab-7a95a9e5bcf4", name: "Keepers of the Deep", atlas_card_theme: "submerged archive", signature_card_ids: cards.slice(8, 13).map((card) => card.id) },
        { id: "bd320abe-2e7c-4ee0-b54e-fe1b08fbca68", name: "The Unwritten", atlas_card_theme: "ink and constellations", signature_card_ids: cards.slice(15, 20).map((card) => card.id) },
      ], cards,
    };
    return structuredClone(this.snapshot);
  }
  open = (_path: string) => this.load();
  async save(operation: EditorOperation, _revision: string) {
    const snapshot = await this.load();
    if (operation.operation === "set_affiliation_catalog_field") {
      if (operation.field === "default_random_draw_max_multiplier") snapshot.default_random_draw_max_multiplier = operation.value;
      else snapshot.default_opponent_deck_max_multiplier = operation.value;
    } else {
      const affiliation = snapshot.affiliations.find((entry) => entry.id === operation.affiliation_id)!;
      if (operation.operation === "set_affiliation_field") {
        if (operation.field === "name") affiliation.name = operation.value;
        else affiliation.atlas_card_theme = operation.value;
      } else affiliation.signature_card_ids = operation.card_ids;
    }
    snapshot.sourceRevision = `demo-${Date.now()}`;
    this.snapshot = snapshot;
    return structuredClone(snapshot);
  }
}

export const editorRegistry = new Map<string, () => EditorTransport>([
  ["affiliations", () => new NativeTransport()],
]);

export function createTransport(): EditorTransport {
  return new URLSearchParams(location.search).has("demo")
    ? new DemoTransport()
    : editorRegistry.get("affiliations")!();
}
