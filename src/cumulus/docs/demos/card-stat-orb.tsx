import { assertLocalized } from "@trox/runtime";
import { CardStatOrb } from "../../components/card/CardStatOrb";
import type { CumulusComponent } from "../registry";

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
      ariaLabel={
        typeof args.ariaLabel === "string"
          ? assertLocalized(args.ariaLabel)
          : undefined
      }
      changeBadge={
        args.changeBadge === "empowered" || args.changeBadge === "kindled"
          ? {
              kind: args.changeBadge,
              accessibleName: assertLocalized(
                typeof args.changeBadgeName === "string"
                  ? args.changeBadgeName
                  : "Transfiguration",
              ),
            }
          : undefined
      }
    />
  );
}

export const cardStatOrbDemo: CumulusComponent = {
  id: "card-stat-orb",
  title: "Card Stat Orb",
  blurb:
    "The card-corner resource stat: a fitted white numeral over the energy, spark, or Dreamwell-energy glyph, with an optional monochrome transfiguration badge.",
  callout: "Changed numerals stay white.",
  details: [
    "The hammer matches the Transfiguration site's atlas icon; the 30px design-size badge intersects the mark's lower-right edge and scales with it.",
  ],
  group: "Cards",
  docName: "CardStatOrb",
  Component: CardStatOrbDemo,
  usage: [
    {
      code: `import { CardStatOrb } from "src/cumulus/components/card/CardStatOrb";

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
      changeBadge: "empowered",
    },
  },
};
