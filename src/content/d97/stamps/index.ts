// The D97 stamp catalog (decision P12): every named LPC chunk a map recipe's
// `stamp` operation can place, one module per stamp in this directory
// (`<name>-<id prefix>.ts`, default-exporting a `defineD97Stamp` value), each
// tagged with its theme. `npm run d97:map -- stamps extract` (from a map) and
// `stamps cut` (from a library sheet) write new modules here; list each one
// below to add it to the catalog. `stamps list` prints the catalog and
// `stamps sheet` draws one preview sheet per theme.

import type { D97CatalogStamp } from "../../../d97/map/stamps";
import emberArch684f3b39 from "./ember-arch-684f3b39";
import brickHouse9eb0de38 from "./brick-house-9eb0de38";
import gabledBrickHouse03403ff5 from "./gabled-brick-house-03403ff5";
import paneledHouseFf3ef5e3 from "./paneled-house-ff3ef5e3";
import timberHut68b342a5 from "./timber-hut-68b342a5";
import canvasTent1eb373a5 from "./canvas-tent-1eb373a5";
import farmCottage023df818 from "./farm-cottage-023df818";
import oakTree80b4b406 from "./oak-tree-80b4b406";
import tallOak9aac4665 from "./tall-oak-9aac4665";
import pineTreeB29437e2 from "./pine-tree-b29437e2";
import bareTree0b66c61a from "./bare-tree-0b66c61a";
import boulderC0eec709 from "./boulder-c0eec709";
import flatRockC8590469 from "./flat-rock-c8590469";
import brickArchway9b2ec675 from "./brick-archway-9b2ec675";
import brickPillarFc443134 from "./brick-pillar-fc443134";
import ironGrateAeebd9a9 from "./iron-grate-aeebd9a9";
import strawPileB0f2fe2c from "./straw-pile-b0f2fe2c";
import stoneIdolFa6bcf41 from "./stone-idol-fa6bcf41";
import stalagmites1801f4e9 from "./stalagmites-1801f4e9";
import saguaroCactus5255c539 from "./saguaro-cactus-5255c539";
import palmTreeEf928535 from "./palm-tree-ef928535";
import tallPalm82007c6c from "./tall-palm-82007c6c";
import greatRibcage62660de6 from "./great-ribcage-62660de6";
import adobeDome70ba8cff from "./adobe-dome-70ba8cff";
import canvasAwning58b01d1b from "./canvas-awning-58b01d1b";
import snowyFir3efb8fe9 from "./snowy-fir-3efb8fe9";
import snowyFirPair5d5e5a86 from "./snowy-fir-pair-5d5e5a86";
import smallSnowyFir8720419e from "./small-snowy-fir-8720419e";
import frostedOak358b2b25 from "./frosted-oak-358b2b25";
import snowLadenPineE53f8c2c from "./snow-laden-pine-e53f8c2c";
import toriiGate275b8b79 from "./torii-gate-275b8b79";
import cherryTreeBc0378ab from "./cherry-tree-bc0378ab";
import greatCherryTree04b0866d from "./great-cherry-tree-04b0866d";
import guardianLionD100368c from "./guardian-lion-d100368c";
import stoneLanternA575fcd0 from "./stone-lantern-a575fcd0";
import shrinePier025068af from "./shrine-pier-025068af";
import consoleDesk6b207687 from "./console-desk-6b207687";
import cargoPadCb8962f0 from "./cargo-pad-cb8962f0";
import bulkheadDoor21b387c3 from "./bulkhead-door-21b387c3";
import lockerBankA944a35f from "./locker-bank-a944a35f";
import exitHatch1e7064a5 from "./exit-hatch-1e7064a5";
import slidingDoorFrame000728b6 from "./sliding-door-frame-000728b6";
import stoneCross2383b32c from "./stone-cross-2383b32c";
import twinHeadstonesE298cd3c from "./twin-headstones-e298cd3c";
import freshGrave5e6f2d95 from "./fresh-grave-5e6f2d95";
import stoneTombC24effdb from "./stone-tomb-c24effdb";
import mourningAngel92554715 from "./mourning-angel-92554715";
import tallCross894726b5 from "./tall-cross-894726b5";
import stoneSarcophagus8742a1b3 from "./stone-sarcophagus-8742a1b3";
import deadOak4b099a7f from "./dead-oak-4b099a7f";
import stoneFountain8344f2c8 from "./stone-fountain-8344f2c8";
import marketStall8268bfc9 from "./market-stall-8268bfc9";
import handCart02d71085 from "./hand-cart-02d71085";
import clockTower993f1121 from "./clock-tower-993f1121";
import winchWell70d71581 from "./winch-well-70d71581";
import signposts63183394 from "./signposts-63183394";
import scarecrow33be7cfd from "./scarecrow-33be7cfd";
import clockOakDa2dde52 from "./clock-oak-da2dde52";
import gardenShedCe5f48a0 from "./garden-shed-ce5f48a0";
import roundHayBale062aa74f from "./round-hay-bale-062aa74f";
import birdbathE41c7674 from "./birdbath-e41c7674";
import hoodedStatueA71de33a from "./hooded-statue-a71de33a";
import wolfStatue8bffff94 from "./wolf-statue-8bffff94";
import wroughtIronArchB1f47948 from "./wrought-iron-arch-b1f47948";
import columnedPortico4ed63fa9 from "./columned-portico-4ed63fa9";
import vendingMachineA2e74a5d from "./vending-machine-a2e74a5d";
import burningBarrel49ab05be from "./burning-barrel-49ab05be";
import streetLamp815c6fcb from "./street-lamp-815c6fcb";
import junkHeap85ab0875 from "./junk-heap-85ab0875";
import serverRack79f84432 from "./server-rack-79f84432";
import energyCrystal19145f9a from "./energy-crystal-19145f9a";
import rowboatDd35bdd7 from "./rowboat-dd35bdd7";
import sampanBoatBfa6ec65 from "./sampan-boat-bfa6ec65";
import plankBarn2985ee18 from "./plank-barn-2985ee18";
import hayLeanTo78ba625c from "./hay-lean-to-78ba625c";
import paleGatehouse61ae9649 from "./pale-gatehouse-61ae9649";

export const D97_STAMPS: readonly D97CatalogStamp[] = [
  emberArch684f3b39,
  brickHouse9eb0de38,
  gabledBrickHouse03403ff5,
  paneledHouseFf3ef5e3,
  timberHut68b342a5,
  canvasTent1eb373a5,
  farmCottage023df818,
  oakTree80b4b406,
  tallOak9aac4665,
  pineTreeB29437e2,
  bareTree0b66c61a,
  boulderC0eec709,
  flatRockC8590469,
  brickArchway9b2ec675,
  brickPillarFc443134,
  ironGrateAeebd9a9,
  strawPileB0f2fe2c,
  stoneIdolFa6bcf41,
  stalagmites1801f4e9,
  saguaroCactus5255c539,
  palmTreeEf928535,
  tallPalm82007c6c,
  greatRibcage62660de6,
  adobeDome70ba8cff,
  canvasAwning58b01d1b,
  snowyFir3efb8fe9,
  snowyFirPair5d5e5a86,
  smallSnowyFir8720419e,
  frostedOak358b2b25,
  snowLadenPineE53f8c2c,
  toriiGate275b8b79,
  cherryTreeBc0378ab,
  greatCherryTree04b0866d,
  guardianLionD100368c,
  stoneLanternA575fcd0,
  shrinePier025068af,
  consoleDesk6b207687,
  cargoPadCb8962f0,
  bulkheadDoor21b387c3,
  lockerBankA944a35f,
  exitHatch1e7064a5,
  slidingDoorFrame000728b6,
  stoneCross2383b32c,
  twinHeadstonesE298cd3c,
  freshGrave5e6f2d95,
  stoneTombC24effdb,
  mourningAngel92554715,
  tallCross894726b5,
  stoneSarcophagus8742a1b3,
  deadOak4b099a7f,
  stoneFountain8344f2c8,
  marketStall8268bfc9,
  handCart02d71085,
  clockTower993f1121,
  winchWell70d71581,
  signposts63183394,
  scarecrow33be7cfd,
  clockOakDa2dde52,
  gardenShedCe5f48a0,
  roundHayBale062aa74f,
  birdbathE41c7674,
  hoodedStatueA71de33a,
  wolfStatue8bffff94,
  wroughtIronArchB1f47948,
  columnedPortico4ed63fa9,
  vendingMachineA2e74a5d,
  burningBarrel49ab05be,
  streetLamp815c6fcb,
  junkHeap85ab0875,
  serverRack79f84432,
  energyCrystal19145f9a,
  rowboatDd35bdd7,
  sampanBoatBfa6ec65,
  plankBarn2985ee18,
  hayLeanTo78ba625c,
  paleGatehouse61ae9649,
];
