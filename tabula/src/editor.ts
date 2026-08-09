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

export interface AffiliationDraft {
  default_random_draw_max_multiplier: string;
  default_opponent_deck_max_multiplier: string;
  affiliations: Affiliation[];
}

export type EditorOperation =
  | { operation: "set_affiliation_catalog_field"; field: "default_random_draw_max_multiplier" | "default_opponent_deck_max_multiplier"; value: number }
  | { operation: "set_affiliation_field"; affiliation_id: string; field: "name" | "atlas_card_theme"; value: string }
  | { operation: "replace_affiliation_signature_cards"; affiliation_id: string; card_ids: string[] };

export interface DraftValidation {
  fields: Record<string, string>;
  unresolvedCardIds: Record<string, string[]>;
  errorCount: number;
}

export interface EditorTransport {
  load(): Promise<EditorSnapshot>;
  open(path: string): Promise<EditorSnapshot>;
  save(operations: readonly EditorOperation[], revision: string): Promise<EditorSnapshot>;
}

export function draftFromSnapshot(snapshot: EditorSnapshot): AffiliationDraft {
  return {
    default_random_draw_max_multiplier: String(snapshot.default_random_draw_max_multiplier),
    default_opponent_deck_max_multiplier: String(snapshot.default_opponent_deck_max_multiplier),
    affiliations: structuredClone(snapshot.affiliations),
  };
}

export function buildOperations(snapshot: EditorSnapshot, draft: AffiliationDraft): EditorOperation[] {
  const operations: EditorOperation[] = [];
  const random = Number(draft.default_random_draw_max_multiplier);
  const opponent = Number(draft.default_opponent_deck_max_multiplier);
  if (random !== snapshot.default_random_draw_max_multiplier) operations.push({ operation: "set_affiliation_catalog_field", field: "default_random_draw_max_multiplier", value: random });
  if (opponent !== snapshot.default_opponent_deck_max_multiplier) operations.push({ operation: "set_affiliation_catalog_field", field: "default_opponent_deck_max_multiplier", value: opponent });
  for (const affiliation of draft.affiliations) {
    const original = snapshot.affiliations.find((entry) => entry.id === affiliation.id);
    if (!original) continue;
    if (affiliation.name !== original.name) operations.push({ operation: "set_affiliation_field", affiliation_id: affiliation.id, field: "name", value: affiliation.name });
    if (affiliation.atlas_card_theme !== original.atlas_card_theme) operations.push({ operation: "set_affiliation_field", affiliation_id: affiliation.id, field: "atlas_card_theme", value: affiliation.atlas_card_theme });
    if (affiliation.signature_card_ids.join("\0") !== original.signature_card_ids.join("\0")) {
      operations.push({ operation: "replace_affiliation_signature_cards", affiliation_id: affiliation.id, card_ids: affiliation.signature_card_ids });
    }
  }
  return operations;
}

export function validateDraft(draft: AffiliationDraft, cards: readonly CardData[]): DraftValidation {
  const fields: Record<string, string> = {};
  const unresolvedCardIds: Record<string, string[]> = {};
  const validateMultiplier = (field: keyof Pick<AffiliationDraft, "default_random_draw_max_multiplier" | "default_opponent_deck_max_multiplier">) => {
    const value = Number(draft[field]);
    if (!Number.isFinite(value) || value < 1) fields[field] = "Enter a number greater than or equal to 1.";
  };
  validateMultiplier("default_random_draw_max_multiplier");
  validateMultiplier("default_opponent_deck_max_multiplier");
  const knownCards = new Set<string>(cards.map((card) => card.id));
  for (const affiliation of draft.affiliations) {
    if (!affiliation.name.trim()) fields[`${affiliation.id}.name`] = "Name is required.";
    if (!affiliation.atlas_card_theme.trim()) fields[`${affiliation.id}.atlas_card_theme`] = "Atlas card theme is required.";
    if (affiliation.signature_card_ids.length === 0) fields[`${affiliation.id}.signature_card_ids`] = "Choose at least one signature card.";
    if (new Set(affiliation.signature_card_ids).size !== affiliation.signature_card_ids.length) fields[`${affiliation.id}.signature_card_ids`] = "A signature card can appear only once.";
    const unresolved = affiliation.signature_card_ids.filter((id) => !knownCards.has(id));
    if (unresolved.length) unresolvedCardIds[affiliation.id] = unresolved;
  }
  return { fields, unresolvedCardIds, errorCount: Object.keys(fields).length + Object.values(unresolvedCardIds).reduce((count, ids) => count + ids.length, 0) };
}

export function searchCards(cards: readonly CardData[], query: string, cardType: string): CardData[] {
  const normalized = query.trim().toLocaleLowerCase();
  return cards.filter((card) => {
    if (cardType !== "all" && card.cardType !== cardType) return false;
    return normalized === "" || [card.name, card.renderedText, card.subtype, card.id]
      .some((value) => String(value).toLocaleLowerCase().includes(normalized));
  }).sort((first, second) => first.name.localeCompare(second.name));
}

class NativeTransport implements EditorTransport {
  load = () => invoke<EditorSnapshot>("load_editor_snapshot");
  open = (path: string) => invoke<EditorSnapshot>("open_repository", { path });
  save = (operations: readonly EditorOperation[], revision: string) =>
    invoke<EditorSnapshot>("save_editor_operations", { operations, expectedSourceRevision: revision });
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
  async save(operations: readonly EditorOperation[], _revision: string) {
    const snapshot = await this.load();
    applyOperations(snapshot, operations);
    snapshot.sourceRevision = `demo-${Date.now()}`;
    this.snapshot = snapshot;
    return structuredClone(snapshot);
  }
}

interface RuntimeAffiliation {
  id: string;
  name: string;
  atlasCardTheme: string;
  signatureCards: string[];
  weightStrength: number;
  opponentBiasStrength: number;
}

class RealDataPreviewTransport implements EditorTransport {
  private snapshot?: EditorSnapshot;
  async load() {
    if (this.snapshot) return structuredClone(this.snapshot);
    const [affiliations, cards] = await Promise.all([
      fetch("/affiliations-data.json").then((response) => response.json()) as Promise<RuntimeAffiliation[]>,
      fetch("/cards_v2-data.json").then((response) => response.json()) as Promise<CardData[]>,
    ]);
    const first = affiliations[0];
    this.snapshot = {
      dataset: "affiliations",
      repositoryRoot: "Current worktree data",
      sourceRevision: "real-data-preview",
      default_random_draw_max_multiplier: first?.weightStrength ?? 1,
      default_opponent_deck_max_multiplier: first?.opponentBiasStrength ?? 1,
      affiliations: affiliations.map((entry) => ({
        id: entry.id,
        name: entry.name,
        atlas_card_theme: entry.atlasCardTheme,
        signature_card_ids: entry.signatureCards,
      })),
      cards,
    };
    return structuredClone(this.snapshot);
  }
  open = (_path: string) => this.load();
  async save(operations: readonly EditorOperation[], _revision: string) {
    const snapshot = await this.load();
    applyOperations(snapshot, operations);
    snapshot.sourceRevision = `real-data-preview-${Date.now()}`;
    this.snapshot = snapshot;
    return structuredClone(snapshot);
  }
}

function applyOperations(snapshot: EditorSnapshot, operations: readonly EditorOperation[]): void {
  for (const operation of operations) {
    if (operation.operation === "set_affiliation_catalog_field") snapshot[operation.field] = operation.value;
    else {
      const affiliation = snapshot.affiliations.find((entry) => entry.id === operation.affiliation_id)!;
      if (operation.operation === "set_affiliation_field") affiliation[operation.field] = operation.value;
      else affiliation.signature_card_ids = [...operation.card_ids];
    }
  }
}

export const editorRegistry = new Map<string, () => EditorTransport>([["affiliations", () => new NativeTransport()]]);

export function createTransport(): EditorTransport {
  const parameters = new URLSearchParams(location.search);
  if (parameters.has("real")) return new RealDataPreviewTransport();
  if (parameters.has("demo")) return new DemoTransport();
  return editorRegistry.get("affiliations")!();
}
