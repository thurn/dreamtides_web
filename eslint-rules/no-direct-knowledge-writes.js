/**
 * Keeps every change to a battle's knowledge (`state.knownTo`) behind the
 * named helpers in src/engine/view/knowledge.ts, so the forgetting rules and
 * their timing live in one place (engine-design § Views and hidden
 * information).
 *
 * It reports, in the files it governs, a write through a `.knownTo` member
 * access at any depth:
 * - assigning, compound-assigning, destructuring into, incrementing, or
 *   deleting it or anything under it (`state.knownTo = …`,
 *   `state.knownTo[side] = …`, `state.knownTo.player[0] = …`,
 *   `state.knownTo[side].length = 0`);
 * - calling a mutating array method on it or under it (`push`, `splice`,
 *   `sort`, …), or passing it as `Object.assign`'s target.
 *
 * It follows aliases by scope analysis: a binding initialized or assigned
 * from such an access (`const known = state.knownTo[side]`), destructured
 * from one (`const { knownTo } = state`, `const { player } = state.knownTo`),
 * or from another alias counts as `knownTo`, so writes through it are
 * reported too, wherever they appear in its scope. Rebinding the alias
 * itself is not a write. A value passed to a function is not followed.
 *
 * eslint.config.js decides which files this rule governs.
 */

const MUTATING_METHODS = new Set([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin",
]);

/** Expression wrappers that pass their operand's value through unchanged. */
const TRANSPARENT = new Set([
  "ChainExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion",
]);

const KNOWN_TO = "knownTo";

/** The name a member access or property key reads, or null when it is computed at runtime. */
function staticKey(key, computed) {
  if (!computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")) {
    return String(key.value);
  }
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) return key.quasis[0].value.cooked;
  return null;
}

function unwrap(node) {
  let current = node;
  while (TRANSPARENT.has(current.type)) current = current.expression;
  return current;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require knowledge (`knownTo`) writes to go through the named helpers in src/engine/view/knowledge.ts.",
    },
    schema: [],
    messages: {
      write:
        "This writes `knownTo` directly. Change knowledge through a named helper in src/engine/view/knowledge.ts, which owns its forgetting rules and timing.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    /** Bindings that hold `knownTo` or a value under it. */
    const aliases = new Set();

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

    /**
     * Whether `node` is `knownTo` or a value under it: a member chain that
     * accesses `.knownTo`, or one rooted at an alias. `requireMember` asks
     * for at least one member access, so a bare alias is not itself a write
     * target.
     */
    function holdsKnowledge(node, requireMember) {
      let current = unwrap(node);
      let members = 0;
      while (current.type === "MemberExpression") {
        if (staticKey(current.property, current.computed) === KNOWN_TO) return true;
        members += 1;
        current = unwrap(current.object);
      }
      if (current.type !== "Identifier" || (requireMember && members === 0)) return false;
      const variable = resolve(current);
      return variable !== null && aliases.has(variable);
    }

    function addAlias(identifier) {
      const variable = resolve(identifier);
      if (variable !== null) aliases.add(variable);
    }

    /** Records the bindings of `pattern` that receive `knownTo` or a value under it; `whole` when the source itself holds it. */
    function bindPattern(pattern, whole) {
      switch (pattern.type) {
        case "Identifier":
          if (whole) addAlias(pattern);
          return;
        case "AssignmentPattern":
          bindPattern(pattern.left, whole);
          return;
        case "RestElement":
          bindPattern(pattern.argument, whole);
          return;
        case "ArrayPattern":
          for (const element of pattern.elements) if (element !== null) bindPattern(element, whole);
          return;
        case "ObjectPattern":
          for (const property of pattern.properties) {
            if (property.type === "RestElement") {
              bindPattern(property, whole);
            } else {
              bindPattern(property.value, whole || staticKey(property.key, property.computed) === KNOWN_TO);
            }
          }
          return;
        default:
          return;
      }
    }

    /** Whether an assignment or destructuring target writes `knownTo` or under it. */
    function writesKnowledge(target) {
      switch (target.type) {
        case "MemberExpression":
          return holdsKnowledge(target, true);
        case "AssignmentPattern":
          return writesKnowledge(target.left);
        case "RestElement":
          return writesKnowledge(target.argument);
        case "ArrayPattern":
          return target.elements.some((element) => element !== null && writesKnowledge(element));
        case "ObjectPattern":
          return target.properties.some((property) =>
            writesKnowledge(property.type === "RestElement" ? property : property.value),
          );
        default:
          return TRANSPARENT.has(target.type) ? writesKnowledge(target.expression) : false;
      }
    }

    function report(node) {
      context.report({ node, messageId: "write" });
    }

    return {
      VariableDeclarator(node) {
        if (node.init !== null) bindPattern(node.id, holdsKnowledge(node.init, false));
      },
      AssignmentExpression(node) {
        if (writesKnowledge(node.left)) {
          report(node);
        } else if (node.operator === "=") {
          bindPattern(node.left, holdsKnowledge(node.right, false));
        }
      },
      UpdateExpression(node) {
        if (writesKnowledge(node.argument)) report(node);
      },
      UnaryExpression(node) {
        if (node.operator === "delete" && writesKnowledge(node.argument)) report(node);
      },
      CallExpression(node) {
        const callee = unwrap(node.callee);
        if (callee.type !== "MemberExpression") return;
        const method = staticKey(callee.property, callee.computed);
        if (method !== null && MUTATING_METHODS.has(method) && holdsKnowledge(callee.object, false)) {
          report(node);
          return;
        }
        const object = unwrap(callee.object);
        const target = node.arguments[0];
        if (
          method === "assign" && object.type === "Identifier" && object.name === "Object" &&
          target !== undefined && target.type !== "SpreadElement" && holdsKnowledge(target, false)
        ) {
          report(node);
        }
      },
    };
  },
};

export default rule;
