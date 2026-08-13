import { invoke } from "@tauri-apps/api/core";

export interface Affiliation {
  id: string;
  name: string;
  atlas_card_theme: string;
  tide_ids: string[];
}

export interface TideSummary {
  id: string;
  displayName: string;
  role: string;
}

export interface EditorSnapshot {
  dataset: "affiliations";
  repositoryRoot: string;
  sourceRevision: string;
  affiliations: Affiliation[];
  tides: TideSummary[];
}

export interface AffiliationDraft {
  affiliations: Affiliation[];
}

export type EditorOperation =
  | { operation: "set_affiliation_field"; affiliation_id: string; field: "name" | "atlas_card_theme"; value: string }
  | { operation: "replace_affiliation_tides"; affiliation_id: string; tide_ids: string[] };

export interface DraftValidation {
  fields: Record<string, string>;
  unresolvedTideIds: Record<string, string[]>;
  errorCount: number;
}

export interface EditorTransport {
  persistence: "disk" | "memory";
  load(): Promise<EditorSnapshot>;
  open(path: string): Promise<EditorSnapshot>;
  save(operations: readonly EditorOperation[], revision: string): Promise<EditorSnapshot>;
}

export function draftFromSnapshot(snapshot: EditorSnapshot): AffiliationDraft {
  return { affiliations: structuredClone(snapshot.affiliations) };
}

export function buildOperations(snapshot: EditorSnapshot, draft: AffiliationDraft): EditorOperation[] {
  const operations: EditorOperation[] = [];
  for (const affiliation of draft.affiliations) {
    const original = snapshot.affiliations.find((entry) => entry.id === affiliation.id);
    if (!original) continue;
    if (affiliation.name !== original.name) operations.push({ operation: "set_affiliation_field", affiliation_id: affiliation.id, field: "name", value: affiliation.name });
    if (affiliation.atlas_card_theme !== original.atlas_card_theme) operations.push({ operation: "set_affiliation_field", affiliation_id: affiliation.id, field: "atlas_card_theme", value: affiliation.atlas_card_theme });
    if (affiliation.tide_ids.join("\0") !== original.tide_ids.join("\0")) {
      operations.push({ operation: "replace_affiliation_tides", affiliation_id: affiliation.id, tide_ids: affiliation.tide_ids });
    }
  }
  return operations;
}

export function validateDraft(draft: AffiliationDraft, tides: readonly TideSummary[]): DraftValidation {
  const fields: Record<string, string> = {};
  const unresolvedTideIds: Record<string, string[]> = {};
  const knownTides = new Set(tides.map((tide) => tide.id));
  for (const affiliation of draft.affiliations) {
    if (!affiliation.name.trim()) fields[`${affiliation.id}.name`] = "Name is required.";
    if (!affiliation.atlas_card_theme.trim()) fields[`${affiliation.id}.atlas_card_theme`] = "Atlas card theme is required.";
    if (affiliation.tide_ids.length !== 3) fields[`${affiliation.id}.tide_ids`] = "Choose exactly three tides.";
    if (new Set(affiliation.tide_ids).size !== affiliation.tide_ids.length) fields[`${affiliation.id}.tide_ids`] = "Each tide must be distinct.";
    const unresolved = affiliation.tide_ids.filter((id) => !knownTides.has(id));
    if (unresolved.length) unresolvedTideIds[affiliation.id] = unresolved;
  }
  return {
    fields,
    unresolvedTideIds,
    errorCount: Object.keys(fields).length + Object.values(unresolvedTideIds).reduce((count, ids) => count + ids.length, 0),
  };
}

class NativeTransport implements EditorTransport {
  persistence = "disk" as const;
  load = () => invoke<EditorSnapshot>("load_editor_snapshot");
  open = (path: string) => invoke<EditorSnapshot>("open_repository", { path });
  save = (operations: readonly EditorOperation[], revision: string) =>
    invoke<EditorSnapshot>("save_editor_operations", { operations, expectedSourceRevision: revision });
}

const FIXTURE_TIDES: TideSummary[] = [
  { id: "00000000-0000-4000-8000-000000000101", displayName: "Dawn Chorus", role: "facet" },
  { id: "00000000-0000-4000-8000-000000000102", displayName: "Unseen Paths", role: "facet" },
  { id: "00000000-0000-4000-8000-000000000103", displayName: "Patient Embers", role: "neutral" },
  { id: "00000000-0000-4000-8000-000000000104", displayName: "Falling Stars", role: "neutral" },
];

class DemoTransport implements EditorTransport {
  persistence = "memory" as const;
  private snapshot?: EditorSnapshot;
  async load() {
    if (this.snapshot) return structuredClone(this.snapshot);
    this.snapshot = {
      dataset: "affiliations", repositoryRoot: "Demo repository", sourceRevision: "demo-1",
      affiliations: [
        { id: "0ee6bf31-2588-4fb7-ac16-8348480c94bd", name: "Radiant Exiles", atlas_card_theme: "dawnlit ruins", tide_ids: FIXTURE_TIDES.slice(0, 3).map((tide) => tide.id) },
        { id: "74f5d8bc-2db4-4075-9fab-7a95a9e5bcf4", name: "Keepers of the Deep", atlas_card_theme: "submerged archive", tide_ids: [FIXTURE_TIDES[1].id, FIXTURE_TIDES[2].id, FIXTURE_TIDES[3].id] },
      ],
      tides: FIXTURE_TIDES,
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
  tideIds: string[];
}

interface RuntimeTides {
  tides: TideSummary[];
}

class RealDataPreviewTransport implements EditorTransport {
  persistence = "memory" as const;
  private snapshot?: EditorSnapshot;
  async load() {
    if (this.snapshot) return structuredClone(this.snapshot);
    const [affiliations, tideCatalog] = await Promise.all([
      fetch("/affiliations-data.json").then((response) => response.json()) as Promise<RuntimeAffiliation[]>,
      fetch("/tides4-data.json").then((response) => response.json()) as Promise<RuntimeTides>,
    ]);
    this.snapshot = {
      dataset: "affiliations",
      repositoryRoot: "Current worktree data",
      sourceRevision: "real-data-preview",
      affiliations: affiliations.map((entry) => ({
        id: entry.id,
        name: entry.name,
        atlas_card_theme: entry.atlasCardTheme,
        tide_ids: entry.tideIds,
      })),
      tides: tideCatalog.tides,
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
    const affiliation = snapshot.affiliations.find((entry) => entry.id === operation.affiliation_id)!;
    if (operation.operation === "set_affiliation_field") affiliation[operation.field] = operation.value;
    else affiliation.tide_ids = [...operation.tide_ids];
  }
}

export const editorRegistry = new Map<string, () => EditorTransport>([["affiliations", () => new NativeTransport()]]);

export function createTransport(): EditorTransport {
  const parameters = new URLSearchParams(location.search);
  if (parameters.has("real")) return new RealDataPreviewTransport();
  if (parameters.has("demo")) return new DemoTransport();
  return editorRegistry.get("affiliations")!();
}
