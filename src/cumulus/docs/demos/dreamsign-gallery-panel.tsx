import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { DreamsignGalleryPanel } from "../../components/card/DreamsignGalleryPanel";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";
import { GLOSSARY_IDS } from "../../../data/glossary";

const DEMO_DREAMSIGNS: DreamsignData[] = [
  {
    id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
    name: "Amplified Acorn",
    imageName: "acorn_gold.png",
    imageAlt: "Golden fruit-like charm with a mesh-patterned orb.",
    effectDescription:
      "Once per turn, when you discard a card, your next card this turn costs 2● less.",
    isNegative: false,
  },
  {
    id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
    name: "Pyramid Relic",
    imageName: "aertfact.png",
    imageAlt: "Blue-gray panel with bright red-orange branching nodes.",
    effectDescription: "The second character you play each turn costs 1● less.",
    isNegative: false,
  },
  {
    id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
    name: "Amanita",
    imageName: "amanita.png",
    imageAlt: "Red spotted mushroom with white flecks.",
    effectDescription:
      "Once per turn, when an ally leaves play, your next character this turn costs 2● less.",
    isNegative: true,
  },
];

function DreamsignGalleryPanelDemo() {
  return (
    <div style={{ width: "min(720px, 100%)" }}>
      <DreamsignGalleryPanel
        title="Dreamsign Bazaar"
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
          label: "Restock Offers",
          glossaryId: GLOSSARY_IDS.dreamsignRestock,
          price: null,
          text: "Restocked",
          disabled: true,
        }}
        closeLabel="Leave bazaar"
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
  title="Dreamsign Bazaar"
  entries={offers}
  endAction={restock}
  closeLabel="Leave bazaar"
  onClose={leave}
  onEntryPress={buy}
  onEndActionPress={restockOffers}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
