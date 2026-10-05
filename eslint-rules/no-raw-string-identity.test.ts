import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-raw-string-identity.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const semantic = [{ checkSemanticNames: true }];

function identityErrors(...names: string[]) {
  return names.map((name) => ({
    messageId: "rawIdentity",
    data: { name },
  }));
}

ruleTester.run("no-raw-string-identity", rule, {
  valid: [
    {
      name: "branded identities and named enumerations",
      code: `
        interface Good {
          siteId: SiteId;
          cardUuids: readonly CardId[];
          id: SiteType;
        }
      `,
    },
    {
      name: "branded intersections and non-identity strings",
      code: `
        type SiteId = string & { readonly __brand: "SiteId" };
        interface Label { title: string; description?: string; key: string }
        const values: Map<CardId, string> = new Map();
      `,
    },
    {
      name: "generic minting through a type parameter",
      code: `
        function identityConstructor<Identity extends DomainIdentity<string>>() {
          return (value: string): Identity => value as Identity;
        }
      `,
    },
    {
      name: "semantic names are off unless the option is enabled",
      code: `interface Event { kind: string; seed: string; source: string }`,
    },
    {
      name: "semantic names ignore Map and Record keys",
      code: `interface Index { source: Record<string, Entry> }`,
      options: semantic,
    },
    {
      name: "semantic names typed as closed unions",
      code: `interface Event { kind: "draw" | "play"; zone: Zone }`,
      options: semantic,
    },
    {
      name: "checked parsers and non-identity assertions",
      code: `
        const site = parseSiteId(raw);
        const value = raw as const;
        const list = raw as readonly Card[];
      `,
    },
  ],
  invalid: [
    {
      name: "scalar, collection, and generic raw string identities",
      code: `
        interface Bad {
          siteId: string;
          readonly cardUuids: readonly string[];
          id?: ReadonlyArray<string>;
          cardsById: ReadonlyMap<string, CardData>;
          nodesById: Record<string, Node>;
          planSignature: string;
          candidateDigest: string;
          textHash: string;
          winnerType: string;
        }
      `,
      errors: identityErrors(
        "siteId",
        "cardUuids",
        "id",
        "cardsById",
        "nodesById",
        "planSignature",
        "candidateDigest",
        "textHash",
        "winnerType",
      ),
    },
    {
      name: "variables, parameters, rest parameters, and defaults",
      code: `
        const gameId: string = "a";
        function load(siteId: string, ...cardIds: string[]): void {}
        const pick = (choiceKey: string | null = null) => choiceKey;
        class Holder { constructor(private readonly ownerUuid: string) {} }
      `,
      errors: identityErrors("gameId", "siteId", "cardIds", "choiceKey", "ownerUuid"),
    },
    {
      name: "class fields, aliases, tuples, and Set members",
      code: `
        class Cache { seenHashes: Set<string> = new Set(); }
        type PlanDigest = string;
        type Pair = [leftId: string, right: number];
      `,
      errors: identityErrors("seenHashes", "PlanDigest", "leftId"),
    },
    {
      name: "functions, methods, and accessors returning raw strings",
      code: `
        function cardKey(): string { return ""; }
        interface Keyed { entryKey(): string }
        class Hasher { get stateHash(): string { return ""; } digest(): string { return ""; } }
        const helpers = { rowId(): string { return ""; } };
      `,
      errors: identityErrors("cardKey", "entryKey", "stateHash", "digest", "rowId"),
    },
    {
      name: "a raw gameId parameter in a test helper",
      filename: "src/state/example.test.ts",
      code: `function startGame(gameId: string) { return gameId; }`,
      errors: identityErrors("gameId"),
    },
    {
      name: "semantic raw string declarations when enabled",
      code: `
        interface Event {
          actor: string;
          kind: string | null;
          journeySeed: string;
          reducerVersion: string;
          seed: readonly string[];
          source: string;
          subtype: string;
          zone: string;
        }
      `,
      options: semantic,
      errors: [
        "actor",
        "kind",
        "journeySeed",
        "reducerVersion",
        "seed",
        "source",
        "subtype",
        "zone",
      ].map((name) => ({ messageId: "rawSemantic", data: { name } })),
    },
    {
      name: "unchecked identity constructors and assertions",
      code: `
        const site = asSiteId(raw);
        const card = raw as CardId;
        const key = <EntryKey>raw;
        const maybe = raw as CardId | null;
      `,
      errors: [
        { messageId: "uncheckedConstructor", data: { name: "asSiteId" } },
        { messageId: "uncheckedAssertion", data: { name: "CardId" } },
        { messageId: "uncheckedAssertion", data: { name: "EntryKey" } },
        { messageId: "uncheckedAssertion", data: { name: "CardId" } },
      ],
    },
    {
      name: "minting boundaries are reported unless suppressed inline",
      code: `function anotherBoundary(raw: string) { return raw as CardId; }`,
      errors: [{ messageId: "uncheckedAssertion", data: { name: "CardId" } }],
    },
  ],
});
