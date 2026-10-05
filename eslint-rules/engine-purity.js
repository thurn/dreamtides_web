/**
 * Keeps the rules engine pure and deterministic (engine-design § Goals): the
 * same start state plus the same answers must always produce the same state,
 * events, and prompts, so replay, the fuzzer, and AI search stay sound.
 *
 * It bans, in the files it governs:
 * - reading the clock or ambient randomness: `Date`, `performance`,
 *   `Math.random`, `crypto.getRandomValues`/`randomUUID`;
 * - module-level mutable state: a top-level `let`/`var`, a top-level binding
 *   initialized with `new …` (a Map, Set, class instance, …), a mutable
 *   `static` class field, and any write or mutating method call on a
 *   module-level binding from inside a function.
 *
 * Both checks use scope analysis rather than names alone. A reference counts
 * only when it resolves to the global (a local `Math` or `state` shadows it),
 * and the clock and randomness checks follow every route to a banned member:
 * through `globalThis`/`window`/`self`/`global`, string-keyed member access,
 * destructuring, and aliases. Passing `Math`, `crypto`, or a global object
 * anywhere the rule cannot follow is reported too.
 *
 * eslint.config.js decides which files this rule governs.
 */

const MUTATING_METHODS = new Set([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin",
  "set", "add", "delete", "clear",
]);

/**
 * What a global value gives access to: either a banned value (any use is
 * reported) or a namespace whose named members may be banned.
 * @typedef {{ banned: { messageId: string, name: string } } | { name: string, members: Map<string, Access> }} Access
 */

/** @type {Access} */
const MATH = {
  name: "Math",
  members: new Map([["random", { banned: { messageId: "random", name: "Math.random" } }]]),
};
/** @type {Access} */
const CRYPTO = {
  name: "crypto",
  members: new Map([
    ["getRandomValues", { banned: { messageId: "random", name: "crypto.getRandomValues" } }],
    ["randomUUID", { banned: { messageId: "random", name: "crypto.randomUUID" } }],
  ]),
};
/** @type {Access} */
const DATE = { banned: { messageId: "clock", name: "Date" } };
/** @type {Access} */
const PERFORMANCE = { banned: { messageId: "clock", name: "performance" } };

const GLOBAL_OBJECT_NAMES = ["globalThis", "window", "self", "global"];
/** @type {Access & { members: Map<string, Access> }} */
const GLOBAL_OBJECT = { name: "globalThis", members: new Map() };
for (const name of GLOBAL_OBJECT_NAMES) GLOBAL_OBJECT.members.set(name, GLOBAL_OBJECT);
GLOBAL_OBJECT.members.set("Math", MATH);
GLOBAL_OBJECT.members.set("crypto", CRYPTO);
GLOBAL_OBJECT.members.set("Date", DATE);
GLOBAL_OBJECT.members.set("performance", PERFORMANCE);

/** Expression wrappers that pass their operand's value through unchanged. */
const TRANSPARENT = new Set([
  "ChainExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion",
]);

/** The name a member access or property key reads, or null when it is computed at runtime. */
function staticKey(key, computed) {
  if (!computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")) {
    return String(key.value);
  }
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban the clock, ambient randomness, and module-level mutable state in the rules engine.",
    },
    schema: [],
    messages: {
      clock: "The engine must be deterministic: `{{name}}` reads the clock. Time is not an engine input.",
      random:
        "The engine must be deterministic: `{{name}}` is ambient randomness. Draw from a named battle RNG stream instead.",
      opaque:
        "`{{name}}` is used where this rule cannot follow it, so it could reach the clock or ambient randomness. Access its members by name.",
      mutableBinding:
        "Module-level `{{kind}}` is mutable state shared across battles. Keep state in BattleState or pass it in.",
      mutableValue:
        "A module-level `new {{name}}(…)` is mutable state shared across battles. Build it per call or keep it in BattleState.",
      mutation:
        "This mutates the module-level binding `{{name}}`, which is state shared across battles.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    let functionDepth = 0;
    /** @type {Set<import("estree").Node>} */
    const reported = new Set();
    /** @type {Set<unknown>} */
    const followed = new Set();

    function report(node, messageId, name) {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, data: messageId === "mutableBinding" ? { kind: name } : { name } });
    }

    /** The variable `identifier` refers to, honoring shadowing, or null for an undeclared global. */
    function resolve(identifier) {
      let scope = sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return null;
    }

    /** Checks every read of `variable`, which holds a value granting `access`. */
    function followVariable(variable, access) {
      if (!variable || followed.has(variable)) return;
      followed.add(variable);
      for (const reference of variable.references) {
        if (reference.isRead()) checkUse(reference.identifier, access);
      }
    }

    /** Checks a destructuring pattern whose source grants `access`. */
    function checkPattern(pattern, access) {
      if (pattern.type === "AssignmentPattern") {
        checkPattern(pattern.left, access);
        return;
      }
      if (pattern.type === "Identifier") {
        followVariable(resolve(pattern), access);
        return;
      }
      if (pattern.type !== "ObjectPattern" || !("members" in access)) {
        report(pattern, "opaque", "name" in access ? access.name : access.banned.name);
        return;
      }
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          report(property, "opaque", access.name);
          continue;
        }
        const key = staticKey(property.key, property.computed);
        if (key === null) {
          report(property, "opaque", access.name);
          continue;
        }
        const member = access.members.get(key);
        if (member === undefined) continue;
        if ("banned" in member) {
          report(property, member.banned.messageId, member.banned.name);
        } else {
          checkPattern(property.value, member);
        }
      }
    }

    /** Checks one use of an expression whose value grants `access`. */
    function checkUse(node, access) {
      if ("banned" in access) {
        report(node, access.banned.messageId, access.banned.name);
        return;
      }
      const parent = node.parent;
      if (!parent) return;
      if (TRANSPARENT.has(parent.type)) {
        checkUse(parent, access);
        return;
      }
      if (parent.type === "MemberExpression" && parent.object === node) {
        const key = staticKey(parent.property, parent.computed);
        if (key === null) {
          report(parent, "opaque", access.name);
          return;
        }
        const member = access.members.get(key);
        if (member !== undefined) checkUse(parent, member);
        return;
      }
      if (parent.type === "VariableDeclarator" && parent.init === node) {
        checkPattern(parent.id, access);
        return;
      }
      if (parent.type === "AssignmentExpression" && parent.right === node && parent.left.type !== "MemberExpression") {
        checkPattern(parent.left, access);
        return;
      }
      if (parent.type === "UnaryExpression" && parent.operator === "typeof") return;
      if (parent.type === "TSTypeQuery" || parent.type === "TSQualifiedName") return;
      report(node, "opaque", access.name);
    }

    function isModuleBinding(identifier) {
      const variable = resolve(identifier);
      return variable !== null && variable.scope.type === "module";
    }

    function rootIdentifier(node) {
      let current = node;
      while (current && (current.type === "MemberExpression" || TRANSPARENT.has(current.type))) {
        current = current.type === "MemberExpression" ? current.object : current.expression;
      }
      return current && current.type === "Identifier" ? current : null;
    }

    function reportWrite(node, target) {
      if (functionDepth === 0) return;
      const identifiers = [];
      if (target.type === "ObjectPattern" || target.type === "ArrayPattern") {
        for (const variable of patternIdentifiers(target)) identifiers.push(variable);
      } else {
        const root = rootIdentifier(target);
        if (root !== null) identifiers.push(root);
      }
      for (const identifier of identifiers) {
        if (isModuleBinding(identifier)) {
          report(node, "mutation", identifier.name);
          return;
        }
      }
    }

    /** The identifiers a destructuring assignment target writes, including member roots. */
    function patternIdentifiers(pattern) {
      switch (pattern.type) {
        case "Identifier":
          return [pattern];
        case "MemberExpression": {
          const root = rootIdentifier(pattern);
          return root === null ? [] : [root];
        }
        case "AssignmentPattern":
          return patternIdentifiers(pattern.left);
        case "RestElement":
          return patternIdentifiers(pattern.argument);
        case "ArrayPattern":
          return pattern.elements.flatMap((element) => (element === null ? [] : patternIdentifiers(element)));
        case "ObjectPattern":
          return pattern.properties.flatMap((property) =>
            patternIdentifiers(property.type === "RestElement" ? property : property.value),
          );
        default:
          return [];
      }
    }

    function checkStaticField(node) {
      // A class declared inside a function gets fresh static fields per call.
      if (!node.static || functionDepth > 0) return;
      if (!node.readonly) {
        report(node, "mutableBinding", "static field");
      } else if (node.value?.type === "NewExpression") {
        const callee = node.value.callee;
        report(node, "mutableValue", callee.type === "Identifier" ? callee.name : "…");
      }
    }

    const enterFunction = () => {
      functionDepth += 1;
    };
    const exitFunction = () => {
      functionDepth -= 1;
    };

    return {
      Program(program) {
        for (const statement of program.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
              ? statement.declaration
              : statement;
          if (declaration?.type !== "VariableDeclaration") continue;
          for (const declarator of declaration.declarations) {
            if (declaration.kind !== "const") {
              report(declarator, "mutableBinding", declaration.kind);
            } else if (declarator.init?.type === "NewExpression") {
              const callee = declarator.init.callee;
              report(declarator, "mutableValue", callee.type === "Identifier" ? callee.name : "…");
            }
          }
        }
      },
      "Program:exit"(program) {
        const globalScope = sourceCode.getScope(program);
        const roots = new Map([["Math", MATH], ["crypto", CRYPTO], ["Date", DATE], ["performance", PERFORMANCE]]);
        for (const name of GLOBAL_OBJECT_NAMES) roots.set(name, GLOBAL_OBJECT);
        const references = [...globalScope.through];
        for (const name of roots.keys()) {
          const variable = globalScope.set.get(name);
          if (variable) references.push(...variable.references);
        }
        for (const reference of references) {
          const access = roots.get(reference.identifier.name);
          if (access === undefined || reference.resolved?.scope.type === "module") continue;
          if (reference.isTypeReference === true || reference.isValueReference === false) continue;
          if (!reference.isRead()) continue;
          checkUse(reference.identifier, access);
        }
      },
      PropertyDefinition: checkStaticField,
      FunctionDeclaration: enterFunction,
      "FunctionDeclaration:exit": exitFunction,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitFunction,
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitFunction,
      AssignmentExpression(node) {
        reportWrite(node, node.left);
      },
      UpdateExpression(node) {
        reportWrite(node, node.argument);
      },
      UnaryExpression(node) {
        if (node.operator === "delete") reportWrite(node, node.argument);
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const method = staticKey(callee.property, callee.computed);
        if (method !== null && MUTATING_METHODS.has(method)) {
          reportWrite(node, callee.object);
        }
      },
    };
  },
};

export default rule;
