import type { JourneyContent } from "../../data/journey-content";
import {
  contentAvatarDefinitions,
  contentCardDefinitions,
  contentDreamsignDefinitions,
  contentDreamwellDefinitions,
  contentFigmentDefinitions,
  createCatalog,
  createEngine,
  type Engine,
  type EngineCardDefinition,
  type EngineDreamwellDefinition,
} from "../../engine";
import { energy, energyX } from "../../engine/dsl/builders";
import { developmentLabDefinitions } from "../../engine/development";
import type { CardData } from "../../types/cards";

const contentEngines = new WeakMap<JourneyContent, Engine>();
const journeySources = new WeakMap<Engine["catalog"], Map<EngineCardDefinition["id"], { definition: EngineCardDefinition; abilities: EngineCardDefinition["abilities"]; metadata: EngineCardDefinition["transfigurationState"]; fields: string; textless: boolean }>>();
const textlessSources = new WeakSet<EngineCardDefinition>();
function sourceFields({ abilities: _abilities, transfigurationState: _metadata, ...fields }: EngineCardDefinition): string { return JSON.stringify(fields); }
/** Only the exact normal post-catalog source and captured constructor fields qualify. */
export function journeySourceOrigin(catalog: Engine["catalog"], id: EngineCardDefinition["id"]) {
  const origin = journeySources.get(catalog)?.get(id);
  if (origin === undefined) return undefined;
  try {
    const current = catalog.card(id);
    if (Reflect.ownKeys(current).some(key => !("value" in Object.getOwnPropertyDescriptor(current, key)!))) return undefined;
    return current === origin.definition && current.abilities === origin.abilities && current.transfigurationState === origin.metadata && sourceFields(current) === origin.fields ? origin : undefined;
  } catch { return undefined; }
}

/**
 * The engine over loaded journey content: every card, Dreamwell card,
 * Avatar, and Dreamsign of the content modules, with their abilities, plus
 * any the loaded journey content adds, by UUID, and in a development build
 * the prompt lab's synthetic definitions (`developmentLabDefinitions`), which
 * the prompt-lab and card-lab QA scenes play. An entity the content
 * modules do not define plays text-less, as a pending entity does (D36).
 * Built once per content; the engine is pure, so one instance serves every
 * battle.
 */
export function journeyContentEngine(content: JourneyContent): Engine {
  const cached = contentEngines.get(content);
  if (cached !== undefined) return cached;
  const lab = developmentLabDefinitions();
  const aspectDefinitions = content.apollyonIncarnations.map(({ aspect }) => ({
    id: aspect.id,
    status: aspect.abilities !== undefined ? "authored" as const : aspect.vanilla === true ? "vanilla" as const : "pending" as const,
    abilities: aspect.abilities ?? (() => []),
  }));
  const avatarDefinitions = withLoaded(contentAvatarDefinitions(), aspectDefinitions, (definition) => definition);
  const cards = withLoaded(contentCardDefinitions(), [...content.cardDatabase.values()], textlessCard);
  const engine = createEngine(
    createCatalog(
      [...cards, ...lab.cards],
      withLoaded(
        contentDreamwellDefinitions(),
        content.dreamwellCards,
        (card): EngineDreamwellDefinition => ({
          id: card.id,
          order: card.order,
          energyAdded: card.energyAdded,
          status: "pending",
          abilities: () => [],
        }),
      ),
      {
        avatars: [...withLoaded(avatarDefinitions, content.avatars, textlessEmblem), ...(lab.emblems.avatars ?? [])],
        dreamsigns: [
          ...withLoaded(contentDreamsignDefinitions(), content.dreamsignTemplates, textlessEmblem),
          ...(lab.emblems.dreamsigns ?? []),
        ],
      },
      [...contentFigmentDefinitions(), ...lab.figments],
    ),
  );
  const sources = new Map<EngineCardDefinition["id"], NonNullable<ReturnType<typeof journeySourceOrigin>>>();
  for (const input of cards) {
    if (lab.cards.some(card => card.id === input.id)) continue;
    const definition = engine.catalog.card(input.id);
    sources.set(input.id, Object.freeze({ definition, abilities: definition.abilities, metadata: definition.transfigurationState, fields: sourceFields(definition), textless: textlessSources.has(input) }));
  }
  journeySources.set(engine.catalog, sources);
  contentEngines.set(content, engine);
  return engine;
}

/** The content-module definitions, then a text-less one for each loaded entity they lack. */
function withLoaded<Id, Definition extends { readonly id: Id }, Loaded extends { readonly id: Id }>(
  definitions: readonly Definition[],
  loaded: readonly Loaded[],
  textless: (entity: Loaded) => Definition,
): Definition[] {
  const known = new Set(definitions.map((definition) => definition.id));
  return [...definitions, ...loaded.filter((entity) => !known.has(entity.id)).map(textless)];
}

function textlessEmblem<Id>(entity: { readonly id: Id }): { id: Id; status: "pending"; abilities: () => [] } {
  return { id: entity.id, status: "pending", abilities: () => [] };
}

/** A card the content modules do not define, played text-less with its printed values (D36). */
function textlessCard(card: CardData): EngineCardDefinition {
  const labels = card.energyCosts ?? [card.energyCost === null ? "X" : String(card.energyCost)];
  const definition: EngineCardDefinition = {
    id: card.id,
    cardType: card.cardType === "Character" ? "character" : "event",
    costs: labels.map((label) => (label === "X" ? energyX() : energy(Number(label)))),
    spark: card.cardType !== "Character" ? null : card.sparkVariable === true ? "x" : (card.spark ?? 0),
    subtype: card.subtype,
    speed: card.isInterrupt === true ? "interrupt" : card.isFast ? "fast" : "standard",
    status: "pending",
    abilities: () => [],
  };
  textlessSources.add(definition);
  return definition;
}
