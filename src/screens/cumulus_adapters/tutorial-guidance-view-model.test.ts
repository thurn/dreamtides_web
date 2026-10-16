import { testTutorialTriggerId } from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { engine, host, CARDS, context, trigger } from "../../rules/battle/tutorial-contracts-fixture";
import { tutorialBattleOf } from "../../rules/battle/fold";
import { reduceEngineIntent } from "../../rules/battle/engine-battle";
import { buildBattleTutorialGuidanceView } from "./battle-tutorial-guidance-view-model";
const cards=createEngineCardModels({definitions:[],cards:new Map(),figment:()=>undefined});
describe("tutorial guidance projection",()=>{
 it("projects the current durable guidance identity and its actual engine source",()=>{
  const initial=host("player",CARDS.strong,[trigger(testTutorialTriggerId("projection"),"card-play")]),current=tutorialBattleOf(initial.battle)!;
  const action=engine.legalActions(current.engine.slice.committed,"player").find(action=>action.kind === "play");if(action === undefined)throw Error("no play");
  const next=reduceEngineIntent(initial,"BATTLE_ACTION",{side:"player",action},context(),engine)!;
  const battle=tutorialBattleOf(next.battle)!;
  const view=buildBattleTutorialGuidanceView(battle,engine,cards);
  expect(view?.presentationId).toBe(battle.checkpoints[0]?.presentation.id);expect(view?.triggerId).toBe(next.tutorialTriggerIdsSeen[0]);
 });
});
