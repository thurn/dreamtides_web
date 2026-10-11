// A one-call judged-QA setup: --arg card=<lab uuid> --arg
// stage=hand:player:<uuid>,play:enemy:<uuid>,void:player:<uuid>.
// A bead-local judged scenario can use the same helpers, then exercise its
// card-specific interactions before taking captures and returning evidence.
export const viewports = ["desktop", "mobile"];

/** @param {import("../prelude.mjs").Qa} qa */
export default async function cardLabStage(qa) {
  const card = qa.args.card;
  if (card === undefined) throw new Error("card-lab-stage needs --arg card=<uuid>");
  await qa.open(`/?goto=card-lab&card=${encodeURIComponent(card)}&variant=${encodeURIComponent(qa.args.variant ?? "base")}&as=${encodeURIComponent(qa.args.as ?? "player")}&seed=1&debug=1`);
  await qa.waitFor("the engine probe", () => "__engineProbe" in window, null);
  const instances = [];
  for (const item of (qa.args.stage ?? "").split(",").filter(Boolean)) {
    const [zone, side, uuid] = item.split(":");
    instances.push(await qa.labAddCard(
      /** @type {"hand" | "play" | "void"} */ (zone),
      /** @type {"player" | "enemy"} */ (side),
      uuid,
    ));
  }
  await qa.assertCaps("staged board");
  await qa.capture(`card-lab-stage-${qa.viewportName}`);
  return { instances };
}
