import { describe, expect, it } from "vitest";
import { buildTutorialView } from "./tutorial-view-model";
import { engine, init, display, CARDS } from "../../rules/battle/tutorial-contracts-fixture";
import { startTutorialPrefix, completePrefixAction } from "../../rules/battle/tutorial-prefix";
import { makeTutorialBattleConfiguration } from "../../testing/tutorial-configuration-fixture";
import { testTutorialActionId } from "../../types/test-identities";
import { parseTutorialRunId } from "../../types/identifiers";
import type { TutorialAction } from "../../types/tutorial";
const configuration=makeTutorialBattleConfiguration();
const avatars=[configuration.playerAvatarId,configuration.enemyAvatarId].map(id=>({id,name:"Fixture",title:"Fixture",renderedText:"",imageNumber:"1",startingEssence:0}));
const actions:readonly TutorialAction[]=[{id:testTutorialActionId("draw"),action:"draw-opponent-card",cardId:CARDS.weak,wait:0},{id:testTutorialActionId("play"),action:"reveal-and-play-opponent-card",cardId:CARDS.weak,revealDuration:1,wait:0},{id:testTutorialActionId("help"),action:"display-how-to-play",text:"synthetic",wait:0}];
describe("scripted engine projection",()=>{
 it("binds a declared reveal to its genuine physical setup card",()=>{
  const prefix=startTutorialPrefix(engine,{init:display(),engineInit:init("enemy",CARDS.weak)},actions,1)!;
  const view=buildTutorialView(avatars,configuration,{runId:parseTutorialRunId("projection"),actions,currentActionIndex:0,playerCardPlay:null,prefix},[],[],engine);
  expect(view.battle.far.deckCardIds[0]).toBe(prefix.draws[0].instance);expect(view.battle.nearHand.cards).toEqual([]);
 });
 it("projects the first normal player draw without inventing an authored Dreamwell draw",()=>{
  const prefix=startTutorialPrefix(engine,{init:display(),engineInit:init("enemy",CARDS.weak)},actions,1)!;
  const completed=completePrefixAction(engine,prefix,actions[1],actions,2)!;
  const view=buildTutorialView(avatars,configuration,{runId:parseTutorialRunId("projection"),actions,currentActionIndex:2,playerCardPlay:null,prefix:completed},[],[],engine);
  expect(view.battle.nearHand.cardIds).toEqual(completed.engine.slice.committed.sides.player.hand);
  expect(view.battle.turn).toBe("1");expect(view.battle.inspector.turn).toBe("2");
  expect(completed.events.filter(entry=>entry.event.kind === "dreamwellDrawn")).toEqual([]);
 });
});

it("reveals only the bound physical draw from its actual public producer frame",()=>{
 const draw:TutorialAction={id:testTutorialActionId("public-draw"),action:"draw-card",owner:"player",cardId:CARDS.strong,reason:"turn-draw",wait:0};
 const cues=[...actions,draw];
 const prefix=startTutorialPrefix(engine,{init:display(),engineInit:init("enemy",CARDS.weak)},cues,3)!;
 const completed=completePrefixAction(engine,prefix,cues[1],cues,4)!;
 const bound=completed.draws.find(association=>association.actionId === draw.id)!;
 if(bound.eventIndex === null)throw Error("real producer absent");
 const producer=completed.events[bound.eventIndex];
 expect(producer.event).toMatchObject({kind:"cardDrawn",side:"player",instance:bound.instance});
 expect(engine.view(producer.before,"player").instances[bound.instance]).toBeUndefined();
 expect(engine.view(producer.state,"player").instances[bound.instance]).toBeDefined();
 const view=buildTutorialView(avatars,configuration,{runId:parseTutorialRunId("draw-projection"),actions:cues,currentActionIndex:3,playerCardPlay:null,prefix:completed},[],[],engine);
 expect(view.cardDraw?.card.id).toBe(bound.instance);
 expect(view.cardDraw?.card.model.cardId).toBe(CARDS.strong);
 expect(view.battle.nearHand.cards).toEqual([]);
 expect(completePrefixAction(engine,completed,draw,cues,5)).not.toBeNull();
 expect(completed.events.filter(entry=>entry.event.kind === "cardDrawn" && entry.event.instance === bound.instance)).toHaveLength(1);
});

import { prefixSetup, prefixActions } from "../../rules/battle/tutorial-contracts-fixture";
import { playPrefixPlayer } from "../../rules/battle/tutorial-prefix";
import { parseBattleSlotViewId, parseBattleCardId } from "../../types/identifiers";
it.each([4, 9])("retains ordinary occupied B%s outside the compact initial empty cells", index => {
 const initial=startTutorialPrefix(engine,prefixSetup(),prefixActions,20)!;
 const drawn=completePrefixAction(engine,initial,prefixActions[1],prefixActions,21)!;
 const instance=drawn.engine.slice.committed.sides.player.hand[0],slot=parseBattleSlotViewId(`B${index}`);
 const played=playPrefixPlayer(engine,drawn,instance,22,prefixActions,slot)!;
 const playback={runId:parseTutorialRunId("occupied-projection"),actions:prefixActions,currentActionIndex:2,playerCardPlay:{cardInstanceId:parseBattleCardId(instance),cardId:CARDS.strong,targetSlotId:slot},prefix:played};
 const saved=JSON.parse(JSON.stringify(played)) as typeof played;
 const view=buildTutorialView(avatars,configuration,playback,[],[],engine);
 expect(view.battle.near.backRank.find(cell=>cell.id === slot)?.card?.id).toBe(instance);
 expect(view.battle.near.backRank.find(cell=>cell.id === slot)?.card?.model.cardId).toBe(CARDS.strong);
 expect(view.battle.near.backRank.map(cell=>cell.id)).toEqual(["B0","B1","B2",slot]);
 expect(played).toEqual(saved);
 expect(buildTutorialView(avatars,configuration,{...playback,prefix:saved},[],[],engine)).toEqual(view);
 expect(playPrefixPlayer(engine,drawn,instance,22,prefixActions,slot)).toEqual(played);
});
