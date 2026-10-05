// The shared Dreamwell's card catalog.
//
// Both players draw from the same seeded deck. Each drawn card permanently
// increases that player's maximum energy by `energyAdded`, then resolves the
// player-facing rules in `renderedText`. UUID is stable identity; names are
// display-only and are not required to be unique. Source order is preserved;
// deck construction groups cards by tier (`order`).

import type { DreamwellCardDefinition } from "../define";
import meteorMeadow5ec17498 from "./meteor-meadow-5ec17498";
import skypathF9b479cf from "./skypath-f9b479cf";
import autumnGlade02e8ea92 from "./autumn-glade-02e8ea92";
import twilightRadianceDe98477c from "./twilight-radiance-de98477c";
import astralInterfaceEe1ef770 from "./astral-interface-ee1ef770";
import glimmeringHorizonCf0f0a05 from "./glimmering-horizon-cf0f0a05";
import ruinTreeFcce7aa2 from "./ruin-tree-fcce7aa2";
import lilyLake558a1f1b from "./lily-lake-558a1f1b";
import firmamentMirror14dec460 from "./firmament-mirror-14dec460";
import shadowPassage03e4e701 from "./shadow-passage-03e4e701";
import summerBlossom662b7393 from "./summer-blossom-662b7393";
import theVoltsurge7171ff89 from "./the-voltsurge-7171ff89";
import sunsetSLastGazeFa8704fe from "./sunset-s-last-gaze-fa8704fe";
import leafLightCanopy2b23a60c from "./leaf-light-canopy-2b23a60c";
import silentWinter9954cede from "./silent-winter-9954cede";
import shiningBeacon3a4293da from "./shining-beacon-3a4293da";
import prismaticPasturesD585b78a from "./prismatic-pastures-d585b78a";
import celestialGatewayA3033051 from "./celestial-gateway-a3033051";
import luminousEnigma556057bb from "./luminous-enigma-556057bb";
import theBastion20be0fdd from "./the-bastion-20be0fdd";
import eternalHorizonA57f1276 from "./eternal-horizon-a57f1276";
import ringvaleF61431f3 from "./ringvale-f61431f3";
import nomadSVerge51caf26d from "./nomad-s-verge-51caf26d";
import emberCavernEae99eb2 from "./ember-cavern-eae99eb2";
import brokenAqueductA9c254c4 from "./broken-aqueduct-a9c254c4";
import echoingBoughs2ad68489 from "./echoing-boughs-2ad68489";
import centennialSquareAf2ef62f from "./centennial-square-af2ef62f";
import ancientMine91deefd2 from "./ancient-mine-91deefd2";
import azureCascade8f5f2e26 from "./azure-cascade-8f5f2e26";
import rustedEdificeA0fbcbd9 from "./rusted-edifice-a0fbcbd9";
import overgrownPassage06e62e45 from "./overgrown-passage-06e62e45";
import sunsetPool120ec4c2 from "./sunset-pool-120ec4c2";
import fortuneSWheel446095b1 from "./fortune-s-wheel-446095b1";

export const DREAMWELL_CARDS: readonly DreamwellCardDefinition[] = [
  meteorMeadow5ec17498,
  skypathF9b479cf,
  autumnGlade02e8ea92,
  twilightRadianceDe98477c,
  astralInterfaceEe1ef770,
  glimmeringHorizonCf0f0a05,
  ruinTreeFcce7aa2,
  lilyLake558a1f1b,
  firmamentMirror14dec460,
  shadowPassage03e4e701,
  summerBlossom662b7393,
  theVoltsurge7171ff89,
  sunsetSLastGazeFa8704fe,
  leafLightCanopy2b23a60c,
  silentWinter9954cede,
  shiningBeacon3a4293da,
  prismaticPasturesD585b78a,
  celestialGatewayA3033051,
  luminousEnigma556057bb,
  theBastion20be0fdd,
  eternalHorizonA57f1276,
  ringvaleF61431f3,
  nomadSVerge51caf26d,
  emberCavernEae99eb2,
  brokenAqueductA9c254c4,
  echoingBoughs2ad68489,
  centennialSquareAf2ef62f,
  ancientMine91deefd2,
  azureCascade8f5f2e26,
  rustedEdificeA0fbcbd9,
  overgrownPassage06e62e45,
  sunsetPool120ec4c2,
  fortuneSWheel446095b1,
];
