import { CardStatOrb } from "../../components/card/CardStatOrb";
import type { TangoComponent } from "../registry";

function CardStatOrbDemo(args: Record<string, unknown>) {
  const variant =
    args.variant === "spark" || args.variant === "dreamwellEnergy"
      ? args.variant
      : "energy";
  return (
    <CardStatOrb
      variant={variant}
      value={typeof args.value === "string" ? args.value : "2"}
      sizeVar={typeof args.sizeVar === "string" ? args.sizeVar : "56px"}
      numberSizeVar={
        typeof args.numberSizeVar === "string" ? args.numberSizeVar : "22px"
      }
      numberCapPx={typeof args.numberCapPx === "number" ? args.numberCapPx : 22}
      ariaLabel={typeof args.ariaLabel === "string" ? args.ariaLabel : undefined}
      tooltip={typeof args.tooltip === "string" ? args.tooltip : undefined}
      changeBadge={
        args.changeBadge === "empowered" || args.changeBadge === "kindled"
          ? args.changeBadge
          : undefined
      }
    />
  );
}

export const cardStatOrbDemo: TangoComponent = {
  id: "card-stat-orb",
  title: "Card Stat Orb",
  blurb:
    "The card-corner resource stat: a fitted white numeral over the energy, spark, or Dreamwell-energy glyph, with an optional monochrome transfiguration badge.",
  callout:
    "Changed numerals stay white. Use the Empowered bolt on a changed energy cost and the Kindled flame on changed spark; the 30px design-size badge overlaps the mark's lower-right edge and scales with it.",
  group: "Components",
  docName: "CardStatOrb",
  Component: CardStatOrbDemo,
  usage: [
    {
      code: `import { CardStatOrb } from "src/tango/components/card/CardStatOrb";

<CardStatOrb
  variant="energy"
  value="2"
  sizeVar="44px"
  numberSizeVar="18px"
  numberCapPx={18}
  changeBadge="empowered"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "energy",
      value: "2",
      sizeVar: "56px",
      numberSizeVar: "22px",
      numberCapPx: 22,
      ariaLabel: "energy cost",
      tooltip: "Energy is paid to play the card.",
      changeBadge: "empowered",
    },
  },
};
