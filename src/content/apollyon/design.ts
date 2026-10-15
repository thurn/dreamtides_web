/** Provisional D6 specifications. Pair-authoring beads adopt and verify the live abilities. */
import { all, characterYouControl, randomIn, staticAbility } from "../../engine/dsl/builders";
import { onDawn, triggered, triggeringCard, whenAbandon, whenDiscard, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { smallEnemyDissolveAspectAbilities } from "./aspects/aspect-ccc0385e-ff00-4be3-a807-99e4def47d2d";
import { reclaimedCharacterSparkAspectAbilities } from "./aspects/aspect-e70d2d02-9ba6-434b-94d3-73ad29d3e9f4";
import { parseFigmentId } from "../../engine/state/ids";
import { parseApollyonIncarnationId } from "../../types/identifiers";
import type { ApollyonIncarnationId } from "../../types/identifiers";
import type { Uuid } from "../define";
import type { ApollyonDesign } from "./types";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dawnReclaimAspectAbilities } from "./aspects/aspect-8890b892-0634-4b8a-bfc0-018adfa979a7";
import { secondEventWarriorAspectAbilities } from "./aspects/aspect-9a1bf275-2763-4db9-ad10-86d8f7e7efdf";
import { spiritAnimalAspectAbilities } from "./aspects/aspect-1380edc9-09ed-44df-ad09-ab4cbfc081b5";
import { secondEventAspectAbilities } from "./aspects/aspect-3fe26475-8023-46d3-b13b-86673b92e3d0";
import { dawnRecoveryAspectAbilities } from "./aspects/aspect-57c65dfd-a125-440e-a410-c8c4a314b1d1";
import { warriorAnthemAspectAbilities } from "./aspects/aspect-80b6296d-840e-4ed7-b684-5aadc0981bf4";

export const APOLLYON_BATTLE_DESIGN = {
  legacyDefaultIncarnationId: parseApollyonIncarnationId("80b6296d-840e-4ed7-b684-5aadc0981bf4"),
} as const;

export const APOLLYON_DESIGNS: ReadonlyMap<ApollyonIncarnationId, ApollyonDesign<Uuid, Uuid, Uuid, Uuid>> = new Map([
  [parseApollyonIncarnationId("1380edc9-09ed-44df-ad09-ab4cbfc081b5"), {
    aspect: { id: "395f7a98-d40a-4b42-a4c6-6f38648255f7", renderedText: "Once per turn, when you play a spirit animal, materialize a 1✦ spirit animal figment.", proposedAbilities: () => [triggered(whenYouPlay({ subtype: "Spirit Animal" }), p.materializeFigments(parseFigmentId("1745ab81-c8a9-4601-a3db-7dbcfa138c11"), 1, { spark: 1 }), { oncePerTurn: true })], abilities: spiritAnimalAspectAbilities, verifiedText: expectedVerifiedText("Once per turn, when you play a spirit animal, materialize a 1✦ spirit animal figment.") },
    deckRecipe: {
      poolAvatarId: "94e7c651-25e9-4a62-9de4-eaf5ba20542c",
      archetypeTideIds: ["e03f4d87-bc6c-46f9-9c08-bef7b59a9f70", "93314ceb-4c33-45e0-8ee3-c53d6e6ea21e"],
      signatureCardIds: ["e2f542eb-090f-4a22-a42c-a120eb6caaa3", "c8579b20-95ff-4b1d-b4c6-6bd049fc4760", "46783333-78f9-4146-a8ec-0d1b81e1bf2f"],
    },
    dreamsignIds: ["3a22a33f-5682-4d00-b0ec-86e43b6ed9df"],
  }],
  [parseApollyonIncarnationId("3fe26475-8023-46d3-b13b-86673b92e3d0"), {
    aspect: { id: "5caf07f1-9bfb-4696-9b5b-6b57fe49e7ef", renderedText: "When you play your second event each turn, copy it.", proposedAbilities: () => [triggered(whenYouPlay({ cardType: "event" }, 2), p.copyCard(triggeringCard()))], abilities: secondEventAspectAbilities, verifiedText: expectedVerifiedText("When you play your second event each turn, copy it.") },
    deckRecipe: {
      poolAvatarId: "f6208407-c4e9-42ac-b533-346704f5e39e",
      archetypeTideIds: ["e6863f55-50e7-4c7b-b118-609b5fc5c005", "1ad97f42-6157-45b3-8290-e27219c7888a"],
      signatureCardIds: ["874d5e8f-4e12-4426-a2e7-1ab761d2ca12", "21965e95-0c8c-470c-a1e1-06d7b87a8d00", "d24ea640-638d-4ce2-b15d-b3f4588bda6b"],
    },
    dreamsignIds: ["268341c7-bb5b-49fb-ad8d-a792b7d631a0"],
  }],
  [parseApollyonIncarnationId("80b6296d-840e-4ed7-b684-5aadc0981bf4"), {
    aspect: { id: "61ade662-2bfe-474a-860c-5f8aa586babc", renderedText: "Warriors you control have +1✦.", proposedAbilities: () => [staticAbility(p.sparkModifier(all(characterYouControl({ subtype: "Warrior" })), 1))], abilities: warriorAnthemAspectAbilities, verifiedText: expectedVerifiedText("Warriors you control have +1✦.") },
    deckRecipe: {
      poolAvatarId: "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
      archetypeTideIds: ["4b01b6c1-ccca-4e19-848a-d799d46088b2", "7343b376-88d2-45fe-8b5e-79763480ee7e"],
      signatureCardIds: ["56411ed4-bda9-4fdf-82e5-b5492de67039", "ca37f80e-8474-4d40-b793-7a900f6ca467", "96e2c30c-930c-47af-abb0-d4fbab454d56"],
    },
    dreamsignIds: ["21ae8473-afa7-4384-b7d4-afbf1d84e691"],
  }],
  [parseApollyonIncarnationId("ac116276-5569-491b-85c9-e192823bddae"), {
    aspect: { id: "e9fa35a7-fe02-4046-b10b-78e1abcc557a", renderedText: "Once per turn, when you abandon a character, draw a card.", proposedAbilities: () => [triggered(whenAbandon("you", { cardType: "character" }), p.draw(1), { oncePerTurn: true })], pending: true },
    deckRecipe: {
      poolAvatarId: "16b579fe-c15b-4df6-8262-d45ce44732ae",
      archetypeTideIds: ["ee5e7dd2-0c11-4349-94e1-ec1ae35b20af", "ebb877b5-7f18-413b-8509-3d1e452e0df2"],
      signatureCardIds: ["49641e8e-93a8-46cb-92a9-246b0fd57899", "4edf2d8d-61e4-4c3a-a388-4b52b2ebd005", "34ea77a8-66e4-49b8-a934-a9d95cb74376"],
    },
    dreamsignIds: ["1ece0e16-08de-4c99-8552-2d1d3a2bd517"],
  }],
  [parseApollyonIncarnationId("57c65dfd-a125-440e-a410-c8c4a314b1d1"), {
    aspect: { id: "e4261c6a-af79-4b94-adbb-91e69b9de0dc", renderedText: "▸Dawn: Return a random ≤2● cost character from your void to your hand.", proposedAbilities: () => [triggered(onDawn(), p.returnFromVoid(randomIn("void", 1, { cardType: "character", costAtMost: 2 })))], abilities: dawnRecoveryAspectAbilities, verifiedText: expectedVerifiedText("▸Dawn: Return a random ≤2● cost character from your void to your hand.") },
    deckRecipe: {
      poolAvatarId: "6488452d-4e9e-466c-96df-716d4ec646b1",
      archetypeTideIds: ["a182f025-8a15-44e1-be26-74766a3b0b85", "c78a2ce1-80fe-48b9-9400-98f4965e17a4"],
      signatureCardIds: ["22ebb4fe-483f-4bd2-b0cf-a2d0ea934ebf", "975f49d3-213a-43fc-8079-5fe40f126a7b", "d8c90a33-a581-469a-9fd3-9a80d1cc5315"],
    },
    dreamsignIds: ["293a610d-ea75-4974-88da-13e4c86f248f"],
  }],
  [parseApollyonIncarnationId("e70d2d02-9ba6-434b-94d3-73ad29d3e9f4"), {
    aspect: { id: "649a0d89-a07d-4bc0-ade6-ea9eb5805c80", renderedText: "Once per turn, when you reclaim a character, it gains +1✦.", proposedAbilities: reclaimedCharacterSparkAspectAbilities, abilities: reclaimedCharacterSparkAspectAbilities, verifiedText: expectedVerifiedText("Once per turn, when you reclaim a character, it gains +1✦.") },
    deckRecipe: {
      poolAvatarId: "60bd584b-5bc8-4ee7-8a98-cbb304eb71ab",
      archetypeTideIds: ["9ca5a839-cdcb-497d-9b76-2de4c6874cf0", "7dfa6a52-04ce-42fc-9ef6-4e6571435510"],
      signatureCardIds: ["86fd585b-e9d0-4dc1-bce9-488014b9316d", "8951e112-92d2-4246-9859-39320620231b", "cd3d8e4a-618e-4c2f-be60-0363b81887f1"],
    },
    dreamsignIds: ["8340cce5-8e27-4940-ab79-34e09fdbcae1"],
  }],
  [parseApollyonIncarnationId("9ae35d68-a432-45f6-ab8c-07572a25ad6b"), {
    aspect: { id: "00974abd-19d8-4d83-8af9-6a34e67f11a0", renderedText: "Once per turn, when you discard a card, it gains reclaim until end of turn.", proposedAbilities: () => [triggered(whenDiscard(), p.grantReclaim(triggeringCard(), { duration: "untilEndOfTurn" }), { oncePerTurn: true })], pending: true },
    deckRecipe: {
      poolAvatarId: "b8c1b0ab-0fe6-47d6-b576-0c2231aeb81e",
      archetypeTideIds: ["77765ea3-16fb-4ab7-9f4f-4610f2f04d9f", "e4d7c1fe-cae0-4cec-8254-2656eff4359b"],
      signatureCardIds: ["995c570b-2d86-4f6f-8f02-dd0902e32fcd", "5b2b2188-b9f0-4b3b-9185-26a820d343c7", "4edf2d8d-61e4-4c3a-a388-4b52b2ebd005"],
    },
    dreamsignIds: ["9aaed05a-2223-42f2-9b9d-81a53eab811c"],
  }],
  [parseApollyonIncarnationId("8890b892-0634-4b8a-bfc0-018adfa979a7"), {
    aspect: { id: "d5599cfc-eb2b-465d-8e1b-076cb118ac59", renderedText: "▸Dawn: If there are 7 or more cards in your void, a random character in your void gains reclaim.", proposedAbilities: dawnReclaimAspectAbilities, abilities: dawnReclaimAspectAbilities, verifiedText: expectedVerifiedText("▸Dawn: If there are 7 or more cards in your void, a random character in your void gains reclaim.") },
    deckRecipe: {
      poolAvatarId: "133e22dd-f81b-406d-b4e3-98c346d7fd4e",
      archetypeTideIds: ["f7072be7-f12b-482a-b9e1-4d3925622eb2", "d5cf7078-48ae-402d-837e-dde02b1a7153"],
      signatureCardIds: ["5639053e-1fe3-4a42-b9c3-3fdf894bfab6", "d55d9fd8-ad2d-41f4-aa7f-5958432f00aa", "d8c90a33-a581-469a-9fd3-9a80d1cc5315"],
    },
    dreamsignIds: ["b2626645-827c-46ec-8204-017862d1a398"],
  }],
  [parseApollyonIncarnationId("ccc0385e-ff00-4be3-a807-99e4def47d2d"), {
    aspect: { id: "9bcfcec6-873a-4d2b-992d-91fecdd96208", renderedText: "2●, ☾: Dissolve an enemy with ≤2✦.", proposedAbilities: smallEnemyDissolveAspectAbilities, abilities: smallEnemyDissolveAspectAbilities, verifiedText: expectedVerifiedText("2●, ☾: Dissolve an enemy with ≤2✦.") },
    deckRecipe: {
      poolAvatarId: "5e28154d-770a-4b84-8aac-9de44f5d7d02",
      archetypeTideIds: ["4fcd40ac-b03f-405f-9236-a00139cbdcc8", "f3f6da0b-f83f-4e66-a4e1-8e35a8d27488"],
      signatureCardIds: ["954e8d50-d494-4fb2-b4c7-74979083b774", "cebcd591-dbd6-40b1-813d-f7f01e1b7fdb", "87aba308-00b4-40d8-a46f-4e6f58a664a8"],
    },
    dreamsignIds: ["3fd8861d-fc4c-4097-9e28-89cc37f5b3f4"],
  }],
  [parseApollyonIncarnationId("9a1bf275-2763-4db9-ad10-86d8f7e7efdf"), {
    aspect: { id: "8c8bc6a5-6ece-4ba2-a360-f93619373bbf", renderedText: "When you play your second event each turn, awaken warriors you control.", proposedAbilities: secondEventWarriorAspectAbilities, abilities: secondEventWarriorAspectAbilities, verifiedText: expectedVerifiedText("When you play your second event each turn, awaken warriors you control.") },
    deckRecipe: {
      poolAvatarId: "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
      archetypeTideIds: ["80e3d33f-6b21-4739-9050-be8d28de28a6", "4b01b6c1-ccca-4e19-848a-d799d46088b2"],
      signatureCardIds: ["245b49b9-e1e5-4dd0-ae18-718c437b8eb0", "96e2c30c-930c-47af-abb0-d4fbab454d56", "ca37f80e-8474-4d40-b793-7a900f6ca467"],
    },
    dreamsignIds: ["94e5683d-a24c-4f89-8afa-652d7c6c79aa"],
  }],
]);
