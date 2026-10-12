import { event } from "../../engine/dsl/builders";
import { materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { dreamwellCard } from "../define";
import ethereal from "../figments/ethereal-3eddb1b8";

export default dreamwellCard({
  name: "Nomad's Verge",
  id: "51caf26d-83bf-45a9-bc80-010d353277db",
  renderedText: "Materialize a 1✦ ethereal figment.",
  order: 1,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 2637215371,
  artOwned: false,
  cardNumber: 25,
  tags: [],
  abilities: () => [event(materializeFigments(parseFigmentId(ethereal.id), 1, { spark: 1 }))],
  verifiedText: "2cw5pg0lkqi",
});
