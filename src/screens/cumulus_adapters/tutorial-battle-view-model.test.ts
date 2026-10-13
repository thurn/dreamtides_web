import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { engine, host, CARDS } from "../../rules/battle/tutorial-contracts-fixture";
import { tutorialBattleOf } from "../../rules/battle/fold";
import { buildTutorialBattleView } from "./tutorial-battle-view-model";
const cards=createEngineCardModels({definitions:[],cards:new Map(),figment:()=>undefined});
describe("tutorial engine projection",()=>{
 it("projects the same physical hand and public resources as the engine",()=>{
  const battle=tutorialBattleOf(host("player",CARDS.strong).battle);if(battle === null)throw Error("missing host");
  const model=buildTutorialBattleView(battle,engine,cards);
  expect(model.view.battle.nearHand.cardIds).toEqual(battle.engine.slice.committed.sides.player.hand);
  expect(model.view.battle.near.status.currentEnergy).toBe(battle.engine.slice.committed.sides.player.currentEnergy);
  expect(model.view.battle.turn).toBe(String(battle.engine.slice.committed.turn.round));
  expect(model.view.manualControls).toBe(true);expect(model.view.battle.prompt.surface.kind).toBe("none");
 });
});

import { init, context, trigger } from "../../rules/battle/tutorial-contracts-fixture";
import { testTutorialTriggerId } from "../../types/test-identities";
import { pendingEnginePrompt, reduceEngineIntent } from "../../rules/battle/engine-battle";
import { parseTutorialBattleFoldState } from "../../rules/battle/tutorial-load";
it("shows the actual pre-play frame and visual outlines while paid gameplay stays blocked",()=>{
 const recipe=init("player",CARDS.choice);
 const guide={...trigger(testTutorialTriggerId("cinematic-card-play"),"card-play"),match:{kind:"card-id" as const,cardId:CARDS.choice}};
 const initial=host("player",CARDS.choice,[guide],{...recipe,setup:{...recipe.setup!,placements:[{side:"player",deckIndex:0,zone:"hand"},{side:"player",deckIndex:1,zone:"hand"}]}});
 const before=tutorialBattleOf(initial.battle)!;
 const action=engine.legalActions(before.engine.slice.committed,"player").find(action=>action.kind === "play" && action.card === before.engine.slice.committed.sides.player.hand[0]);
 if(action === undefined)throw Error("missing public play");
 const authored={...initial,battle:{...before,overrides:{definitions:[],consumed:[],dreamwell:null}}};
 const started=reduceEngineIntent(authored,"BATTLE_ACTION",{side:"player",action},context(),engine)!;
 const cost=pendingEnginePrompt(started.battle,engine)!;
 const paid=reduceEngineIntent(started,"BATTLE_ANSWER",{side:"player",promptId:cost.prompt.id,value:2},context(11),engine)!;
 const current=tutorialBattleOf(paid.battle)!;
 expect(current.engine.slice.committed.sides.player.currentEnergy).toBe(3);
 expect(current.checkpoints[0].before.sides.player.currentEnergy).toBe(5);
 const rendered=buildTutorialBattleView(current,engine,cards);
 expect(rendered.view.battle.near.status.currentEnergy).toBe(5);
 expect(rendered.view.battle.nearHand.cards.map(card=>card.id)).toEqual([before.engine.slice.committed.sides.player.hand[1]]);
 expect(rendered.view.battle.nearHand.cards.every(card=>card.showPlayableOutline)).toBe(true);
 expect(rendered.model.affordances.canAct).toBe(false);
 expect(rendered.view.manualControls).toBe(false);
 const loaded=parseTutorialBattleFoldState(JSON.parse(JSON.stringify(current)) as Record<string,unknown>);
 expect(loaded).toEqual(current);
 if(loaded === null)throw Error("reload refused");
 expect(buildTutorialBattleView(loaded,engine,cards).view).toEqual(rendered.view);
 expect(current.engine.slice.committed.sides.player.currentEnergy).toBe(3);
});
