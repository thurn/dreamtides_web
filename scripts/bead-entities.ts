/** Print authoritative inventory facts for the UUIDs filed on a bead. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSemanticEntityId } from "../src/types/identifiers";

interface InventoryEntity {
  readonly id: unknown;
  readonly kind: string;
  readonly name: string;
  readonly module?: string;
  readonly text?: string;
  readonly amplifiedText?: string;
  readonly requiredPrimitives: {
    readonly existing: readonly string[];
    readonly new: readonly string[];
  };
  readonly promptKinds: readonly string[];
}

/** Inventory injection keeps callers and tests independent of catalog contents. */
export function beadEntities(
  uuids: readonly string[],
  inventory: { readonly entities: readonly InventoryEntity[] },
) {
  if (uuids.length === 0) throw new Error("Usage: npm run bead:entities -- <uuid> [uuid ...]");
  const byId = new Map(inventory.entities.map((entity) => [parseSemanticEntityId(entity.id), entity]));
  return uuids.flatMap((argument) => argument.split(",")).map((value) => {
    const uuid = parseSemanticEntityId(value);
    const entity = byId.get(uuid);
    if (entity === undefined) throw new Error(`Unknown inventory UUID: ${uuid}`);
    const firstByte = createHash("sha256").update(uuid).digest()[0];
    return {
      uuid,
      kind: entity.kind,
      name: entity.name,
      module: entity.module ?? null,
      text: entity.text ?? null,
      amplifiedText: entity.amplifiedText ?? null,
      requiredPrimitives: entity.requiredPrimitives,
      promptKinds: entity.promptKinds,
      d21: { firstByte, sampled: firstByte < 26 },
    };
  });
}

function main(): void {
  try {
    const inventory = JSON.parse(readFileSync(
      new URL("../docs/plan/evidence/content-inventory.json", import.meta.url), "utf8",
    )) as Parameters<typeof beadEntities>[1];
    console.log(JSON.stringify(beadEntities(process.argv.slice(2), inventory), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
