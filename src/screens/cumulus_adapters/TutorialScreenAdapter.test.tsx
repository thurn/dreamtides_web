// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { TutorialScreenAdapter } from "./TutorialScreenAdapter";
import type { TutorialScreenProps } from "../../cumulus/screens/TutorialScreen";
import type { TutorialPlaybackState } from "../../types/tutorial";
import { makeTutorialConfiguration } from "../../testing/tutorial-configuration-fixture";
import { prefixSetup, prefixActions, engine } from "../../rules/battle/tutorial-contracts-fixture";
import { startTutorialPrefix } from "../../rules/battle/tutorial-prefix";
import { registerBattleInitProvider } from "../../rules/battle/journey-battle";
import { parseTutorialRunId } from "../../types/identifiers";
import { getLogEntries, resetLog } from "../../logging";
const captured=vi.hoisted(()=>({props:null as TutorialScreenProps|null}));
const mutations=vi.hoisted(()=>({action:vi.fn(()=>Promise.resolve(1)),beginTutorial:vi.fn(()=>Promise.resolve(1)),beginTutorialBattle:vi.fn(()=>Promise.resolve(1)),completeTutorialAction:vi.fn(()=>Promise.resolve(1))}));
const configuration=makeTutorialConfiguration();
const avatars=[configuration.battle.playerAvatarId,configuration.battle.enemyAvatarId].map(id=>({id,name:"Fixture",title:"Fixture",renderedText:"",imageNumber:"1",startingEssence:0}));
let tutorial:TutorialPlaybackState;
vi.mock("../../state/front-door-context",()=>({useFrontDoor:()=>({state:{phase:"tutorial",journeyId:null,tutorial},mutations})}));
vi.mock("../../state/journey-context",()=>({useJourney:()=>({journeyContent:{tutorial:configuration}})}));
vi.mock("../../data/tutorial-actions",async importOriginal=>({...await importOriginal<typeof import("../../data/tutorial-actions")>(),loadTutorialActions:()=>prefixActions}));
vi.mock("../../state/use-tutorial-cards",()=>({useTutorialCards:()=>({cards:[],dreamwell:[]})}));
vi.mock("../../cumulus/screens/TutorialScreen",()=>({TutorialScreen:(props:TutorialScreenProps)=>{captured.props=props;return <main data-tutorial-screen />;}}));
let mounted:Root|null=null;
beforeEach(()=>{
 vi.spyOn(console,"log").mockImplementation(()=>{});vi.clearAllMocks();resetLog();
 registerBattleInitProvider({engine,beginBattle:()=>null});
 tutorial={runId:parseTutorialRunId("adapter-run"),actions:prefixActions,currentActionIndex:0,playerCardPlay:null,prefix:startTutorialPrefix(engine,prefixSetup(),prefixActions,1)!};
});
afterEach(()=>{act(()=>mounted?.unmount());mounted=null;registerBattleInitProvider(null);vi.restoreAllMocks();document.body.innerHTML="";});
async function mount(){const element=document.createElement("div");document.body.append(element);mounted=createRoot(element);await act(async()=>{mounted!.render(<CumulusRoot><TutorialScreenAdapter avatars={avatars} playbackSpeed={4}/></CumulusRoot>);await Promise.resolve();});return element;}
describe("TutorialScreenAdapter",()=>{
 it("projects a real prefix and sends authored completion identity through the facade",async()=>{
  const element=await mount();expect(element.querySelector("[data-tutorial-screen]")).not.toBeNull();
  expect(captured.props?.playbackSpeed).toBe(4);expect(captured.props?.view.battle.far.deckCardIds[0]).toBe(tutorial.prefix?.draws[0]?.instance);
  await act(async()=>{captured.props?.onActionComplete?.(tutorial.runId,prefixActions[0].id);await Promise.resolve();});
  expect(mutations.completeTutorialAction).toHaveBeenCalledWith(tutorial.runId,prefixActions[0].id);
  expect(getLogEntries()).toEqual(expect.arrayContaining([expect.objectContaining({event:"tutorial_action_presented",runId:tutorial.runId,actionId:prefixActions[0].id})]));
 });
 it("hands the terminal authored cursor to the durable battle lifecycle",async()=>{
  tutorial={...tutorial,currentActionIndex:null};await mount();expect(mutations.beginTutorialBattle).toHaveBeenCalledWith(tutorial.runId);
 });
});
