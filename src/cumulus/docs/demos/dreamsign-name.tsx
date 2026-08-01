import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { DreamsignName } from "../../components/hud/DreamsignName";
import type { CumulusComponent } from "../registry";

const SAMPLE_DREAMSIGN: DreamsignData = {
  id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
  name: "Amplified Acorn",
  imageName: "acorn_gold.png",
  imageAlt: "Golden fruit-like charm with a mesh-patterned orb.",
  effectDescription:
    "Once per turn, when you discard a card, your next card this turn costs 2● less.",
  isBane: false,
};

function DreamsignNameDemo({
  dreamsign = SAMPLE_DREAMSIGN,
}: {
  dreamsign?: DreamsignData;
}) {
  return <DreamsignName dreamsign={dreamsign} />;
}

export const dreamsignNameDemo: CumulusComponent = {
  id: "dreamsign-name",
  title: "Dreamsign Name",
  blurb:
    "The text-only Dreamsign entity: an underlined authored name that reveals the Dreamsign's primary object InfoCard and glossary definitions.",
  group: "Components",
  docName: "DreamsignName",
  Component: DreamsignNameDemo,
  usage: [
    {
      note: "Use where the authored Dreamsign name should carry the complete semantic reveal without showing collectible art on the source surface.",
      code: `import { DreamsignName } from "src/cumulus/components/hud/DreamsignName";

<DreamsignName dreamsign={dreamsign} />`,
    },
  ],
  demo: {
    defaultArgs: {},
    sampleContent: { dreamsign: SAMPLE_DREAMSIGN },
  },
};
