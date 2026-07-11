import path from "node:path";

const INFO_CARD_STATICS = new Set([
  "PressInfo",
  "PressPopover",
  "usePressReveal",
  "anchorRect",
  "setRevealDelay",
  "SITE_DISC",
]);

const MECHANICAL_PROPS = new Set([
  "anchorRect",
  "portalTarget",
  "revealSide",
  "revealPlacement",
  "revealDelayMs",
  "hoverDelayMs",
  "pressDelayMs",
  "gap",
  "maxWidthPx",
  "triggerAs",
]);

const CONTROLLED_PROPS = new Set([
  "open",
  "shown",
  "isOpen",
  "isShown",
  "revealOpen",
  "revealShown",
]);

const NAMED_REVEAL_COMPONENTS = /^(?:GameCard|CompactGameCardRow|InfoCard|AtlasNode|GlossaryTerm|BattleGameCard|Dreamsign|DreamcallerPortrait|TideDisc|ResourceChip|PipBadge|CardStatOrb|QuestStatusBar|SiteNode)$/;
const GENERIC_REVEAL_WRAPPER = /^(?:HoverPopover|RevealPopover|EntityReveal|GenericReveal|RevealWrapper|EntityRevealWrapper)$/;

function repoPath(filename, cwd) {
  return path.relative(cwd, filename).split(path.sep).join("/");
}

function isExempt(filename) {
  return (
    filename.startsWith("src/tango/internal/reveal/") ||
    filename === "src/tango/TangoRoot.tsx" ||
    /\.test\.[cm]?[jt]sx?$/.test(filename)
  );
}

function mayImportRevealInternals(filename) {
  return filename.startsWith("src/tango/components/");
}

function jsxName(node) {
  if (node?.type === "JSXIdentifier") return node.name;
  if (node?.type === "JSXMemberExpression") return jsxName(node.property);
  return "";
}

function propertyName(node) {
  if (!node || node.computed) return null;
  return node.property?.type === "Identifier" ? node.property.name : null;
}

function typeName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "TSQualifiedName") return typeName(node.right);
  return "";
}

function containsNamedReveal(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "JSXElement") {
    return NAMED_REVEAL_COMPONENTS.test(jsxName(node.openingElement?.name));
  }
  if (node.type === "Identifier" && /Reveal|InfoCard|GameCard/.test(node.name)) {
    return true;
  }
  return Object.entries(node).some(
    ([key, value]) =>
      key !== "parent" &&
      (Array.isArray(value)
        ? value.some(containsNamedReveal)
        : containsNamedReveal(value)),
  );
}

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      internalImport: "Entity reveal coordinator hooks, models, geometry, and portals are internal to Tango named components.",
      infoCardStatic: "InfoCard is a visual content component. Interaction statics are outside its public API.",
      genericWrapper: "Generic reveal/popover wrappers are forbidden. Use a named semantic Tango component or static content.",
      arbitraryContent: "Reveal content must be strict coordinator data owned by a named component, not an arbitrary ReactNode slot.",
      directPortal: "Only the internal entity reveal coordinator may create the reveal portal.",
      mechanicalProp: "Reveal placement, timing, anchor, and portal mechanics are coordinator-owned and cannot be passed by product code.",
      controlledState: "Entity reveals are uncontrolled from product code; open/shown state belongs to the coordinator.",
      publicSpec: "RevealSpec is an internal protocol and cannot appear in a product API.",
    },
  },
  create(context) {
    const filename = repoPath(context.filename, context.cwd);
    if (isExempt(filename)) return {};

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (!mayImportRevealInternals(filename) && /tango\/internal\/reveal(?:\/|$)|(?:^|\/)internal\/reveal(?:\/|$)/.test(source)) {
          context.report({ node, messageId: "internalImport" });
        }
        if (/HoverPopover/.test(source)) {
          context.report({ node, messageId: "genericWrapper" });
        }
      },
      MemberExpression(node) {
        if (
          node.object?.type === "Identifier" &&
          node.object.name === "InfoCard" &&
          INFO_CARD_STATICS.has(propertyName(node))
        ) {
          context.report({ node, messageId: "infoCardStatic" });
        }
      },
      JSXOpeningElement(node) {
        const name = jsxName(node.name);
        if (GENERIC_REVEAL_WRAPPER.test(name)) {
          context.report({ node, messageId: "genericWrapper" });
        }
        if (!NAMED_REVEAL_COMPONENTS.test(name)) return;
        for (const attribute of node.attributes) {
          if (attribute.type !== "JSXAttribute") continue;
          const prop = jsxName(attribute.name);
          if (MECHANICAL_PROPS.has(prop)) {
            context.report({ node: attribute, messageId: "mechanicalProp" });
          } else if (CONTROLLED_PROPS.has(prop)) {
            context.report({ node: attribute, messageId: "controlledState" });
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "createPortal" &&
          containsNamedReveal(node.arguments[0])
        ) {
          context.report({ node, messageId: "directPortal" });
        }
      },
      TSInterfaceDeclaration(node) {
        const name = node.id.name;
        if (!mayImportRevealInternals(filename) && /RevealSpec/.test(name)) {
          context.report({ node: node.id, messageId: "publicSpec" });
        }
        if (GENERIC_REVEAL_WRAPPER.test(name.replace(/Props$/, ""))) {
          context.report({ node: node.id, messageId: "genericWrapper" });
        }
        if (!GENERIC_REVEAL_WRAPPER.test(name.replace(/Props$/, ""))) return;
        for (const member of node.body.body) {
          if (member.type !== "TSPropertySignature") continue;
          const annotation = member.typeAnnotation?.typeAnnotation;
          if (annotation?.type === "TSTypeReference" && /^(?:ReactNode|ReactElement)$/.test(typeName(annotation.typeName))) {
            context.report({ node: member, messageId: "arbitraryContent" });
          }
        }
      },
      TSPropertySignature(node) {
        const key = node.key?.type === "Identifier" ? node.key.name : "";
        if (!mayImportRevealInternals(filename) && /^revealSpec$/i.test(key)) {
          context.report({ node: node.key, messageId: "publicSpec" });
        }
      },
      TSTypeReference(node) {
        if (!mayImportRevealInternals(filename) && typeName(node.typeName) === "RevealSpec") {
          context.report({ node, messageId: "publicSpec" });
        }
      },
      FunctionDeclaration(node) {
        if (node.id && GENERIC_REVEAL_WRAPPER.test(node.id.name)) {
          context.report({ node: node.id, messageId: "genericWrapper" });
        }
      },
    };
  },
};
