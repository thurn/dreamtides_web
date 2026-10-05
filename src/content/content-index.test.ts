import { describe, expect, it } from "vitest";
import { AVATARS } from "./avatars";
import { CARDS } from "./cards";
import { DREAMSIGNS } from "./dreamsigns";
import { DREAMWELL_CARDS } from "./dreamwell";
import type { Uuid } from "./define";
import { FIGMENTS } from "./figments";

interface Entity {
  readonly id: Uuid;
}

type ModuleMap = Record<string, Entity>;

const MODULES: Record<string, ModuleMap> = {
  avatars: import.meta.glob<Entity>(["./avatars/*.ts", "!./avatars/index.ts"], {
    eager: true,
    import: "default",
  }),
  cards: import.meta.glob<Entity>(["./cards/*.ts", "!./cards/index.ts"], {
    eager: true,
    import: "default",
  }),
  dreamsigns: import.meta.glob<Entity>(
    ["./dreamsigns/*.ts", "!./dreamsigns/index.ts"],
    { eager: true, import: "default" },
  ),
  dreamwell: import.meta.glob<Entity>(
    ["./dreamwell/*.ts", "!./dreamwell/index.ts"],
    { eager: true, import: "default" },
  ),
  figments: import.meta.glob<Entity>(
    ["./figments/*.ts", "!./figments/index.ts"],
    {
      eager: true,
      import: "default",
    },
  ),
};

const INDEXES: Record<string, readonly Entity[]> = {
  avatars: AVATARS,
  cards: CARDS,
  dreamsigns: DREAMSIGNS,
  dreamwell: DREAMWELL_CARDS,
  figments: FIGMENTS,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

describe.each(Object.keys(INDEXES))("%s content index", (kind) => {
  const modules = MODULES[kind] ?? {};
  const index = INDEXES[kind] ?? [];

  it("lists every entity module in its directory exactly once", () => {
    expect(new Set(index)).toEqual(new Set(Object.values(modules)));
    expect(new Set(index).size).toBe(index.length);
  });

  it("identifies every entity by a unique UUID", () => {
    const ids = index.map((entity) => entity.id);
    for (const id of ids) {
      expect(id).toMatch(UUID);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names each module file after its entity's UUID prefix", () => {
    for (const [path, entity] of Object.entries(modules)) {
      expect(path.endsWith(`-${entity.id.slice(0, 8)}.ts`)).toBe(true);
    }
  });
});
