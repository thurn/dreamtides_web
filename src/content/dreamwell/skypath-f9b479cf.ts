import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Skypath",
  id: "f9b479cf-02cb-40e1-bb64-70b29977bf15",
  renderedText: "Foresee 1.",
  order: 1,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 1897537165,
  artOwned: true,
  cardNumber: 4,
  tags: ["Art Owned"],
  abilities: () => [event(p.foresee(1))],
  verifiedText: "2bco4bprx11",
});
