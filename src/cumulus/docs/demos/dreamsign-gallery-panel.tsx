import { assertLocalized } from "@trox/runtime";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { DreamsignGalleryPanel } from "../../components/card/DreamsignGalleryPanel";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";
import { GLOSSARY_IDS } from "../../../data/glossary";

const DEMO_DREAMSIGNS = [
  {
    id: "c706d0ba-2f41-4b14-95d8-db168ac6246c",
    name: "Amplified Acorn",
    imageName: "acorn_gold.png",
    imageAlt: "Golden fruit-like charm with a mesh-patterned orb.",
    effectDescription:
      "Once per turn, when you discard a card, your next card this turn costs 2● less.",
  },
  {
    id: "278ec1ab-f532-4862-84ae-63df5e49548c",
    name: "Pyramid Relic",
    imageName: "aertfact.png",
    imageAlt: "Blue-gray panel with bright red-orange branching nodes.",
    effectDescription: "The second character you play each turn costs 1● less.",
  },
  {
    id: "6e20e6c7-295a-48b1-b252-b8b00d6902c9",
    name: "Amanita",
    imageName: "amanita.png",
    imageAlt: "Red spotted mushroom with white flecks.",
    effectDescription:
      "Once per turn, when an ally leaves play, your next character this turn costs 2● less.",
  },
].map(localizedDreamsignFixture);

function DreamsignGalleryPanelDemo() {
  return (
    <div style={{ width: "min(720px, 100%)" }}>
      <DreamsignGalleryPanel
        title={assertLocalized("Dreamsign Bazaar")}
        entries={DEMO_DREAMSIGNS.map((dreamsign, index) => ({
          entryId: `demo-${dreamsign.id}`,
          dreamsign,
          price: 100 + index * 25,
          state:
            index === 0
              ? "available"
              : index === 1
                ? "unaffordable"
                : "purchased",
        }))}
        endAction={{
          entryId: "restock",
          glyph: GLYPHS.refresh,
          label: assertLocalized("Restock Offers"),
          glossaryId: GLOSSARY_IDS.dreamsignRestock,
          price: null,
          text: assertLocalized("Restocked"),
          disabled: true,
        }}
        closeLabel={assertLocalized("Leave bazaar")}
        onClose={() => undefined}
        onEntryPress={() => undefined}
        onEndActionPress={() => undefined}
      />
    </div>
  );
}

export const dreamsignGalleryPanelDemo: CumulusComponent = {
  id: "dreamsign-gallery-panel",
  title: "Dreamsign Gallery Panel",
  blurb:
    "The liquid-glass purchase shelf for Dreamsign offers: UUID-keyed collectible art, essence captions, a close disc, and one bare-glyph end action.",
  callout: "Use this when Dreamsigns are the primary purchasable objects.",
  details: [
    "The panel preserves the chrome-free Dreamsign material and shared InfoCard reveal while matching the Dream Market's gallery frame and direct-buy interaction.",
  ],
  group: "Components",
  docName: "DreamsignGalleryPanel",
  Component: DreamsignGalleryPanelDemo,
  usage: [
    {
      note: "Resolve each Dreamsign by UUID before building the entry. Purchased entries reserve their shelf footprint.",
      code: `import { DreamsignGalleryPanel } from "src/cumulus/components/card/DreamsignGalleryPanel";

<DreamsignGalleryPanel
  title={assertLocalized("Dreamsign Bazaar")}
  entries={offers}
  endAction={restock}
  closeLabel={assertLocalized("Leave bazaar")}
  onClose={leave}
  onEntryPress={buy}
  onEndActionPress={restockOffers}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
