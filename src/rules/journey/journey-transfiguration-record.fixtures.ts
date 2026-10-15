import type { DeckEntry } from "../../types/journey";
import type { TransfigurationApplication } from "../../engine/dsl/types";
import { createCatalog, type EngineCardDefinition } from "../../engine/catalog";
import { energy } from "../../engine/dsl/builders";
import { makeAuguryTestCard, makeAuguryTestContent, makeAuguryTestDeckEntry } from "../../journey_v2/testing/fixtures";
import { transfigurationSourceState } from "../../transfiguration/transfiguration-logic";
import { testCardId } from "../../types/test-identities";
import { parseDeckEntryId } from "../../types/identifiers";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import type { JourneyTransfigurationProvider } from "./journey-transfiguration";
export type RecordedEntry = DeckEntry & { readonly transfigurationApplications?: readonly TransfigurationApplication[] };
export const data = transfigurationFixture();
export const character = makeAuguryTestCard({ id: testCardId("record-character"), cardNumber: 71, energyCost: 7, spark: 3 });
export const eventCard = makeAuguryTestCard({ id: testCardId("record-event"), cardNumber: 72, cardType: "Event", subtype: "", spark: null, energyCost: 4, renderedText: "", amplifiedText: "Reclaim." });
export const content = { ...makeAuguryTestContent({ cards: [character, eventCard] }), transfigurationData: data };
export const definitions: readonly EngineCardDefinition[] = [character, eventCard].map(card => ({ id: card.id, cardType: card.cardType === "Character" ? "character" : "event", subtype: card.subtype, costs: [energy(card.energyCost!)], spark: card.spark, speed: "standard", status: "vanilla", abilities: () => [], transfiguration: { amplified: card.amplifiedText !== undefined, resonant: { base: null, amplified: null } }, transfigurationState: (initially, steps) => transfigurationSourceState(card.renderedText, card.amplifiedText, initially, steps) }));
export const catalog = createCatalog(definitions, []);
export function entry(forms: readonly TransfigurationApplication[] = [{ form: "Kindled" }, { form: "Kindled" }], overrides: Partial<RecordedEntry> = {}): RecordedEntry {
 return { ...makeAuguryTestDeckEntry({ entryId: parseDeckEntryId("record-physical"), cardNumber: character.cardNumber }), transfiguration: forms[0]?.form ?? null, transfigurationApplications: forms, ...overrides };
}
type Capable = JourneyTransfigurationProvider & { validateRecord?: (entry: Readonly<DeckEntry>) => boolean; apply?: (entry: Readonly<DeckEntry>, form: NonNullable<DeckEntry["transfiguration"]>) => { ok: boolean; value?: DeckEntry; reason?: string } };
export function actualProvider(): Capable {
 const factory: (loaded: typeof content, source?: typeof catalog) => JourneyTransfigurationProvider = createJourneyTransfigurationProvider;
 return factory(content, catalog);
}
