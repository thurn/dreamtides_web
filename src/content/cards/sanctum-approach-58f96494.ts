import { countDiscardedBy, event, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import ethereal from "../figments/ethereal-3eddb1b8";

export default card({
  name: "Sanctum Approach",
  mtgName: "Occult Epiphany",
  id: "58f96494-87ec-4145-9e1c-95951d0ab711",
  renderedText:
    "Draw X cards, then discard X cards. Materialize a 1✦ ethereal figment for each event discarded.",
  amplifiedText:
    "Draw X cards, then discard X cards. Materialize a 2✦ ethereal figment for each event discarded.",
  energyCost: 1,
  energyCosts: ["1", "X"],
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: ["Figment Maker"],
  imageNumber: 1118816006,
  artOwned: false,
  cardNumber: 206,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => {
    const instruction = p.discard(x());
    return [event(p.sequence(
      p.draw(x()),
      instruction,
      p.materializeFigments(parseFigmentId(ethereal.id), countDiscardedBy(instruction, "event"), { spark: variant.amplified ? 2 : 1 }),
    ))];
  },
  verifiedText: "1eqjdgvs3os",
});
