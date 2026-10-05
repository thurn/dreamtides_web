/**
 * Bans raw `string` domain identities and unchecked identity minting.
 *
 * Identities are branded types minted by the `parse*`/brand helpers in
 * src/types/identifiers.ts and src/types/card-identity.ts. This rule reports:
 *
 * - identity-like declarations (`id`, `signature`, `digest`, `hash`, or names
 *   ending in Id/Key/Uuid/Signature/Digest/Hash/Type/Sha and their plurals)
 *   typed as raw `string`, including arrays, unions, Set members, and
 *   Map/Record keys;
 * - with `checkSemanticNames`, semantic declarations (`actor`, `kind`,
 *   `journeySeed`, `reducerVersion`, `seed`, `source`, `subtype`, `zone`)
 *   typed as raw `string`;
 * - unchecked identity assertions (`value as SomethingId`) and unchecked
 *   identity constructors (`asSomethingId(value)`).
 *
 * The few private minting boundaries carry an inline
 * `eslint-disable-next-line dreamtides/no-raw-string-identity -- <reason>`.
 */

const IDENTITY_NAME_SUFFIX =
  /(?:Id|Ids|Key|Keys|Uuid|Uuids|Signature|Signatures|Digest|Digests|Hash|Hashes|Type|Types|Sha|Shas)$/u;
const IDENTITY_NAMES = new Set(["id", "signature", "digest", "hash"]);
const SEMANTIC_NAMES = new Set([
  "actor",
  "kind",
  "journeySeed",
  "reducerVersion",
  "seed",
  "source",
  "subtype",
  "zone",
]);
const COLLECTION_TYPES = new Set([
  "Array",
  "ReadonlyArray",
  "Iterable",
  "Set",
  "ReadonlySet",
]);
const KEYED_TYPES = new Set(["Map", "ReadonlyMap", "Record"]);
const ASSERTED_IDENTITY_TYPE = /(?:Id|Key|Uuid)$/u;
const UNCHECKED_CONSTRUCTOR = /^as[A-Z][A-Za-z0-9]*(?:Id|Key|Uuid)$/u;
const FUNCTION_VALUES = new Set([
  "FunctionExpression",
  "TSEmptyBodyFunctionExpression",
]);

export function isIdentityLikeName(name) {
  return IDENTITY_NAMES.has(name) || IDENTITY_NAME_SUFFIX.test(name);
}

function referenceName(typeNode) {
  return typeNode.type === "TSTypeReference" &&
    typeNode.typeName.type === "Identifier"
    ? typeNode.typeName.name
    : null;
}

function typeArguments(typeNode) {
  return typeNode.typeArguments?.params ?? [];
}

/**
 * True when a type is or contains raw `string` as a value, collection member,
 * or (when `includeKeys`) a Map/Record key.
 */
function containsRawString(typeNode, includeKeys) {
  switch (typeNode.type) {
    case "TSStringKeyword":
      return true;
    case "TSTypeOperator":
      return typeNode.typeAnnotation !== undefined &&
        containsRawString(typeNode.typeAnnotation, includeKeys);
    case "TSArrayType":
      return containsRawString(typeNode.elementType, includeKeys);
    case "TSUnionType":
      return typeNode.types.some((member) =>
        containsRawString(member, includeKeys));
    case "TSTypeReference": {
      const name = referenceName(typeNode);
      if (name !== null && COLLECTION_TYPES.has(name)) {
        return typeArguments(typeNode).some((argument) =>
          containsRawString(argument, includeKeys));
      }
      if (includeKeys && name !== null && KEYED_TYPES.has(name)) {
        const keyType = typeArguments(typeNode)[0];
        return keyType !== undefined && containsRawString(keyType, includeKeys);
      }
      return false;
    }
    default:
      return false;
  }
}

/** The first `...Id`/`...Key`/`...Uuid` reference an assertion targets. */
function assertedIdentityName(typeNode) {
  if (typeNode.type === "TSUnionType" || typeNode.type === "TSIntersectionType") {
    for (const member of typeNode.types) {
      const name = assertedIdentityName(member);
      if (name !== null) return name;
    }
    return null;
  }
  const name = referenceName(typeNode);
  return name !== null && ASSERTED_IDENTITY_TYPE.test(name) ? name : null;
}

function staticKeyName(node) {
  return !node.computed && node.key.type === "Identifier" ? node.key : null;
}

/** The declared name of a function: its own id, or its method/accessor key. */
function functionNameNode(node) {
  if (node.id) return node.id;
  const parent = node.parent;
  if (
    FUNCTION_VALUES.has(node.type) &&
    parent?.value === node &&
    (parent.type === "MethodDefinition" ||
      parent.type === "TSAbstractMethodDefinition" ||
      (parent.type === "Property" && (parent.method || parent.kind !== "init")))
  ) {
    return staticKeyName(parent);
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw string domain identities and unchecked identity assertions; use the branded types and parse*/brand helpers in src/types/.",
    },
    schema: [
      {
        type: "object",
        properties: { checkSemanticNames: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      rawIdentity:
        "`{{name}}` is an identity typed as a raw string. Use a branded identity type from src/types/identifiers.ts or src/types/card-identity.ts.",
      rawSemantic:
        "`{{name}}` is a domain value typed as a raw string. Use a branded type or a closed union.",
      uncheckedAssertion:
        "`as {{name}}` mints an identity without validation. Use the parse*/brand helper for {{name}}.",
      uncheckedConstructor:
        "`{{name}}` mints an identity without validation. Use a parse* helper from src/types/identifiers.ts.",
    },
  },

  create(context) {
    const checkSemanticNames = context.options[0]?.checkSemanticNames === true;

    function checkDeclaration(nameNode, typeNode) {
      if (nameNode?.type !== "Identifier" || typeNode == null) return;
      const name = nameNode.name;
      const type = typeNode.type === "TSTypeAnnotation"
        ? typeNode.typeAnnotation
        : typeNode;
      if (isIdentityLikeName(name) && containsRawString(type, true)) {
        context.report({
          node: nameNode,
          messageId: "rawIdentity",
          data: { name },
        });
      } else if (
        checkSemanticNames &&
        SEMANTIC_NAMES.has(name) &&
        containsRawString(type, false)
      ) {
        context.report({
          node: nameNode,
          messageId: "rawSemantic",
          data: { name },
        });
      }
    }

    function checkKeyed(node) {
      checkDeclaration(staticKeyName(node), node.typeAnnotation);
    }

    function checkFunction(node) {
      checkDeclaration(functionNameNode(node), node.returnType);
    }

    function checkAssertion(node) {
      const name = assertedIdentityName(node.typeAnnotation);
      if (name !== null) {
        context.report({ node, messageId: "uncheckedAssertion", data: { name } });
      }
    }

    return {
      // Variables, parameters (including parameter properties and defaults),
      // and catch bindings.
      Identifier(node) {
        if (node.typeAnnotation) checkDeclaration(node, node.typeAnnotation);
      },
      RestElement(node) {
        checkDeclaration(node.argument, node.typeAnnotation);
      },
      TSPropertySignature: checkKeyed,
      PropertyDefinition: checkKeyed,
      TSAbstractPropertyDefinition: checkKeyed,
      AccessorProperty: checkKeyed,
      TSAbstractAccessorProperty: checkKeyed,
      TSTypeAliasDeclaration(node) {
        checkDeclaration(node.id, node.typeAnnotation);
      },
      TSNamedTupleMember(node) {
        checkDeclaration(node.label, node.elementType);
      },
      TSMethodSignature(node) {
        checkDeclaration(staticKeyName(node), node.returnType);
      },
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      TSDeclareFunction: checkFunction,
      TSEmptyBodyFunctionExpression: checkFunction,

      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          UNCHECKED_CONSTRUCTOR.test(node.callee.name)
        ) {
          context.report({
            node: node.callee,
            messageId: "uncheckedConstructor",
            data: { name: node.callee.name },
          });
        }
      },
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
};

export default rule;
