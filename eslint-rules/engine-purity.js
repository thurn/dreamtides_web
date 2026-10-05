/**
 * Keeps the rules engine pure and deterministic (engine-design § Goals): the
 * same start state plus the same answers must always produce the same state,
 * events, and prompts, so replay, the fuzzer, and AI search stay sound.
 *
 * It bans, in the files it governs:
 * - reading the clock or ambient randomness: `Date`, `Math.random`,
 *   `performance.now`, `crypto.getRandomValues`/`randomUUID`;
 * - module-level mutable state: a top-level `let`/`var`, a top-level binding
 *   initialized with `new …` (a Map, Set, class instance, …), and any write
 *   or mutating method call on a top-level binding from inside a function.
 *
 * eslint.config.js decides which files this rule governs.
 */

const MUTATING_METHODS = new Set([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin",
  "set", "add", "delete", "clear",
]);

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
      mutableBinding:
        "Module-level `{{kind}}` is mutable state shared across battles. Keep state in BattleState or pass it in.",
      mutableValue:
        "A module-level `new {{name}}(…)` is mutable state shared across battles. Build it per call or keep it in BattleState.",
      mutation:
        "This mutates the module-level binding `{{name}}`, which is state shared across battles.",
    },
  },
  create(context) {
    /** @type {Set<string>} */
    const moduleBindings = new Set();
    let functionDepth = 0;

    function rootIdentifier(node) {
      let current = node;
      while (current && current.type === "MemberExpression") {
        current = current.object;
      }
      return current && current.type === "Identifier" ? current.name : null;
    }

    function isShadowed(name, node) {
      let scope = context.sourceCode.getScope(node);
      while (scope && scope.type !== "module" && scope.type !== "global") {
        if (scope.set.has(name)) return true;
        scope = scope.upper;
      }
      return false;
    }

    function reportWrite(node, target) {
      if (functionDepth === 0) return;
      const name = rootIdentifier(target);
      if (name !== null && moduleBindings.has(name) && !isShadowed(name, node)) {
        context.report({ node, messageId: "mutation", data: { name } });
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
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type !== "VariableDeclaration") continue;
          for (const declarator of declaration.declarations) {
            if (declarator.id.type === "Identifier") {
              moduleBindings.add(declarator.id.name);
            }
            if (declaration.kind !== "const") {
              context.report({
                node: declarator,
                messageId: "mutableBinding",
                data: { kind: declaration.kind },
              });
            } else if (declarator.init?.type === "NewExpression") {
              const callee = declarator.init.callee;
              context.report({
                node: declarator,
                messageId: "mutableValue",
                data: { name: callee.type === "Identifier" ? callee.name : "…" },
              });
            }
          }
        }
      },
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
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          MUTATING_METHODS.has(callee.property.name)
        ) {
          reportWrite(node, callee.object);
        }
      },
      Identifier(node) {
        if (node.name !== "Date") return;
        const parent = node.parent;
        if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) return;
        if (parent?.type === "Property" && parent.key === node && !parent.computed) return;
        if (node.parent?.type === "TSTypeReference") return;
        if (isShadowed("Date", node)) return;
        context.report({ node, messageId: "clock", data: { name: "Date" } });
      },
      MemberExpression(node) {
        if (node.computed || node.object.type !== "Identifier" || node.property.type !== "Identifier") return;
        const name = `${node.object.name}.${node.property.name}`;
        if (name === "Math.random" || name === "crypto.getRandomValues" || name === "crypto.randomUUID") {
          context.report({ node, messageId: "random", data: { name } });
        } else if (name === "performance.now") {
          context.report({ node, messageId: "clock", data: { name } });
        }
      },
    };
  },
};

export default rule;
