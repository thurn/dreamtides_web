// The policy worker's catalog composition boundary: one definition per UUID,
// the content module's or the development lab's where either defines it.
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCatalog } from "../catalog";
import {
  contentAvatarDefinitions,
  contentCardDefinitions,
  contentDreamsignDefinitions,
  contentDreamwellDefinitions,
  contentFigmentDefinitions,
} from "../content-catalog";
import { developmentLabDefinitions } from "../development";
import { BASE_VARIANT } from "../dsl/types";
import { battleSeed } from "../state/ids";
import type { BattleInit } from "../state/types";
import { SYNTHETIC_DREAMWELL, syntheticId } from "../testing/synthetic-cards";
import { LAB } from "../testing/prompt-lab";
import { AVATAR, DREAMSIGN } from "../testing/stack-cards";
import { parseAvatarId, parseDreamsignId } from "../../types/identifiers";
import { event } from "../dsl/builders";
import { gainPoints } from "../effects/primitives/gain-points";
import { catalogManifest, manifestCatalog, type CatalogManifest } from "./catalog-manifest";
import { entries, weak } from "./policy.fixtures";

/** The journey's composition of the content modules and the development lab. */
function sourceCatalog(): EngineCatalog {
  const lab = developmentLabDefinitions();
  return createCatalog(
    [...contentCardDefinitions(), ...lab.cards],
    contentDreamwellDefinitions(),
    {
      avatars: [...contentAvatarDefinitions(), ...(lab.emblems.avatars ?? [])],
      dreamsigns: [...contentDreamsignDefinitions(), ...(lab.emblems.dreamsigns ?? [])],
    },
    [...contentFigmentDefinitions(), ...lab.figments],
  );
}

/** A battle naming every content and lab card, Dreamwell card, avatar, and dreamsign. */
function everythingInit(): BattleInit {
  const lab = developmentLabDefinitions();
  const avatars = [...contentAvatarDefinitions(), ...(lab.emblems.avatars ?? [])].map(({ id }) => id);
  const dreamsigns = [...contentDreamsignDefinitions(), ...(lab.emblems.dreamsigns ?? [])].map(({ id }) => id);
  return {
    seed: battleSeed("manifest"),
    scoreToWin: 25,
    decks: {
      player: entries(contentCardDefinitions().map(({ id }) => id)),
      enemy: entries(lab.cards.map(({ id }) => id)),
    },
    dreamwell: contentDreamwellDefinitions().map(({ id }) => id),
    avatars: { player: avatars[0], enemy: AVATAR.drawer.id },
    dreamsigns: { player: dreamsigns, enemy: [DREAMSIGN.points.id] },
  };
}

describe("the policy worker's catalog", () => {
  it("clones a synthetic authored Dreamwell manifest and rebuilds an unknown UUID text-less", () => {
    const well = { ...SYNTHETIC_DREAMWELL[0], status: "authored" as const, abilities: () => [event(gainPoints(3))] };
    const source = createCatalog([weak], [well]);
    const init: BattleInit = { seed: battleSeed("dreamwell-manifest"), scoreToWin: 25,
      decks: { player: [], enemy: [] }, dreamwell: [well.id] };
    const manifest = structuredClone(catalogManifest(source, init));
    expect(manifest.dreamwell).toEqual([{ id: well.id, order: well.order, energyAdded: well.energyAdded, status: "authored" }]);
    const rebuilt = manifestCatalog(manifest).dreamwellCard(well.id);
    expect(rebuilt.abilities(BASE_VARIANT)).toEqual([]);
    expect(rebuilt).toMatchObject(manifest.dreamwell[0]);
    expect(source.dreamwellCard(well.id).abilities(BASE_VARIANT)).toHaveLength(1);
  });
  it("rebuilds the content module's or lab's definition, once, for every entity a manifest names that either defines", () => {
    const source = sourceCatalog();
    const init = everythingInit();
    const manifest = catalogManifest(source, init);
    // The manifest's plain data never overrides a defined entity.
    const altered: CatalogManifest = {
      ...manifest,
      maximumFixedCost: source.maximumFixedCost + 7,
      cards: manifest.cards.map((card) => ({ ...card, status: "pending", spark: 99 })),
      dreamwell: manifest.dreamwell.map((card) => ({ ...card, energyAdded: card.energyAdded + 5, status: "pending" })),
      avatars: manifest.avatars.map((avatar) => ({ ...avatar, status: "pending" })),
      dreamsigns: manifest.dreamsigns.map((dreamsign) => ({ ...dreamsign, status: "pending" })),
    };
    const rebuilt = manifestCatalog(JSON.parse(JSON.stringify(altered)) as CatalogManifest);
    for (const side of ["player", "enemy"] as const) {
      for (const { cardId } of init.decks[side]) expect(rebuilt.card(cardId)).toEqual(source.card(cardId));
      const avatar = init.avatars?.[side];
      if (avatar !== undefined) expect(rebuilt.avatar(avatar)).toEqual(source.avatar(avatar));
      for (const dreamsign of init.dreamsigns?.[side] ?? []) expect(rebuilt.dreamsign(dreamsign)).toEqual(source.dreamsign(dreamsign));
    }
    for (const id of init.dreamwell) expect(rebuilt.dreamwellCard(id)).toEqual(source.dreamwellCard(id));
    expect(rebuilt.card(LAB.abandon.id).abilities(BASE_VARIANT).length).toBeGreaterThan(0);
    expect(rebuilt.avatar(AVATAR.drawer.id).abilities(BASE_VARIANT).length).toBeGreaterThan(0);
    expect(rebuilt.dreamsign(DREAMSIGN.points.id).abilities(BASE_VARIANT).length).toBeGreaterThan(0);
    expect(rebuilt.maximumFixedCost).toBe(source.maximumFixedCost + 7);
  });

  it("plays text-less every entity only the manifest names", () => {
    const card = { ...weak, id: syntheticId(0x4a01), status: "pending" as const };
    const { abilities: _abilities, synthetic: _synthetic, ...plainCard } = card;
    const dreamwell = SYNTHETIC_DREAMWELL[4];
    const avatar = parseAvatarId("4a0a4a0a-0000-4000-8000-000000000001");
    const dreamsign = parseDreamsignId("4a0a4a0a-0000-4000-8000-000000000002");
    const manifest: CatalogManifest = {
      maximumFixedCost: 3,
      cards: [plainCard],
      dreamwell: [dreamwell],
      avatars: [{ id: avatar, status: "pending" }],
      dreamsigns: [{ id: dreamsign, status: "pending" }],
    };
    const rebuilt = manifestCatalog(manifest);
    const { abilities, ...rebuiltCard } = rebuilt.card(card.id);
    expect(rebuiltCard).toEqual(plainCard);
    expect(abilities(BASE_VARIANT)).toEqual([]);
    const { abilities: wellAbilities, ...rebuiltWell } = rebuilt.dreamwellCard(dreamwell.id);
    const { abilities: _syntheticAbilities, ...plainWell } = dreamwell;
    expect(rebuiltWell).toEqual(plainWell);
    expect(wellAbilities(BASE_VARIANT)).toEqual([]);
    expect(rebuilt.avatar(avatar)).toMatchObject({ status: "pending" });
    expect(rebuilt.avatar(avatar).abilities(BASE_VARIANT)).toEqual([]);
    expect(rebuilt.dreamsign(dreamsign).abilities(BASE_VARIANT)).toEqual([]);
  });

  it("rejects a catalog that defines a card UUID twice", () => {
    expect(() => createCatalog([weak, { ...weak, spark: 2 }], [])).toThrow();
  });
});
