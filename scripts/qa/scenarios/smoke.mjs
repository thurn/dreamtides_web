// The phase-gate smoke: the front door of a fresh game (seed 1 unless
// `--arg seed=<n>`), Avatar selection, every Layer 1 site, Battle Start, and
// the first turn of the engine battle through one full AI turn. It uses no
// development-only URL parameter, so it runs the same with --prod.

/** @param {import("../prelude.mjs").Qa} qa */
export default async function smoke(qa) {
  const mode = qa.prod ? "prod" : "dev";
  const { sites } = await qa.battle.enterFirstBattle({
    seed: qa.args.seed ?? "1",
    atFrontDoor: async () => {
      await qa.capture(`smoke-${mode}-front-door`);
    },
  });
  await qa.capture(`smoke-${mode}-battle-start`);

  // Until the far side has taken a turn and the near side may act again.
  const run = await qa.battle.playUntil(
    (battle, progress) => progress.history.some((at) => at.startsWith("far:")) && battle.side === "near" && battle.canPass,
    { label: "one AI turn", timeout: 180_000 },
  );
  await qa.assertCaps("after the AI turn");
  await qa.capture(`smoke-${mode}-after-ai-turn`);
  return { sites, turns: run.history, responds: run.responds };
}
