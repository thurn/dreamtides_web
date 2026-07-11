import path from "node:path";

const INFO_CARD_STATICS = new Set(["PressInfo", "PressPopover", "usePressReveal", "anchorRect", "setRevealDelay", "SITE_DISC"]);
const MECHANICAL_PROPS = new Set(["anchorRect", "portalTarget", "revealSide", "revealPlacement", "revealDelayMs", "hoverDelayMs", "pressDelayMs", "delayMs", "gap", "maxWidthPx", "triggerAs"]);
const STRONG_MECHANICAL_PROPS = new Set(["anchorRect", "portalTarget", "revealSide", "revealPlacement", "revealDelayMs", "hoverDelayMs", "pressDelayMs"]);
const CONTROLLED_PROPS = new Set(["open", "shown", "isOpen", "isShown", "revealOpen", "revealShown"]);
const CONTENT_PROPS = new Set(["content", "children", "card", "reveal", "renderedContent"]);
const NAMED_REVEAL_COMPONENTS = new Set(["GameCard", "CompactGameCardRow", "InfoCard", "AtlasNode", "GlossaryTerm", "BattleGameCard", "Dreamsign", "DreamcallerPortrait", "TideDisc", "ResourceChip", "PipBadge", "CardStatOrb", "QuestStatusBar", "SiteNode"]);
const GENERIC_REVEAL_WRAPPERS = new Set(["HoverPopover", "RevealPopover", "EntityReveal", "GenericReveal", "RevealWrapper", "EntityRevealWrapper"]);

const CONTEXT_COMPONENTS = [
  "src/tango/components/atlas/AtlasNode.tsx",
  "src/tango/components/card/CardStatOrb.tsx",
  "src/tango/components/card/CardView.tsx",
  "src/tango/components/card/CompactGameCardRow.tsx",
  "src/tango/components/card/GlossaryTerm.tsx",
  "src/tango/components/controls/PipBadge.tsx",
  "src/tango/components/dreamscape/SiteNode.tsx",
  "src/tango/components/hud/DreamcallerPortrait.tsx",
  "src/tango/components/hud/Dreamsign.tsx",
  "src/tango/components/hud/QuestStatusBar.tsx",
  "src/tango/components/hud/ResourceChip.tsx",
  "src/tango/components/hud/TideDisc.tsx",
  "src/tango/components/hud/TideSelectionButton.tsx",
];
const IDENTITY_COMPONENTS = CONTEXT_COMPONENTS.filter((file) => !file.endsWith("CardView.tsx") && !file.endsWith("CompactGameCardRow.tsx"));
const APPROVED_INTERNAL_IMPORTS = new Map();
for (const file of CONTEXT_COMPONENTS) APPROVED_INTERNAL_IMPORTS.set(`${file}|src/tango/internal/reveal/context`, new Set(["useRevealSource"]));
for (const file of IDENTITY_COMPONENTS) APPROVED_INTERNAL_IMPORTS.set(`${file}|src/tango/internal/reveal/identity`, new Set(["revealEntityId"]));
APPROVED_INTERNAL_IMPORTS.set("src/tango/TangoRoot.tsx|src/tango/internal/reveal/context", new Set(["RevealCoordinatorProvider"]));
APPROVED_INTERNAL_IMPORTS.set("src/tango/components/atlas/AtlasNode.tsx|src/tango/internal/reveal/model", new Set(["RevealInfoCardModel", "RevealSpec"]));
APPROVED_INTERNAL_IMPORTS.set("src/tango/components/hud/DreamcallerPortrait.tsx|src/tango/internal/reveal/model", new Set(["RevealSpec"]));

const PORTAL_OWNER_ALLOWLIST = new Set([
  "src/tango/internal/reveal/RevealOverlay.tsx",
  "src/tango/components/controls/Select.tsx",
  "src/battle/components/BattleContextMenu.tsx",
  "src/debug/SignatureDecksApp.tsx",
]);

function repoPath(filename, cwd) { return path.relative(cwd, filename).split(path.sep).join("/"); }
function stripExtension(value) { return value.replace(/\.(?:ts|tsx|js|jsx)$/, ""); }
function resolvedImport(filename, source) { return stripExtension(path.posix.normalize(path.posix.join(path.posix.dirname(filename), source))); }
function isInternalTest(filename) { return filename.startsWith("src/tango/internal/reveal/") || /\.test\.[cm]?[jt]sx?$/.test(filename); }
function jsxName(node) { return node?.type === "JSXIdentifier" ? node.name : node?.type === "JSXMemberExpression" ? jsxName(node.property) : ""; }
function keyName(node) {
  if (!node || node.computed) return "";
  if (node.key?.type === "Identifier" || node.key?.type === "Literal") return String(node.key.name ?? node.key.value ?? "");
  if (node.type === "Property" && (node.key.type === "Identifier" || node.key.type === "Literal")) return String(node.key.name ?? node.key.value ?? "");
  return "";
}
function propertyName(node) { return node && !node.computed && node.property?.type === "Identifier" ? node.property.name : ""; }
function typeName(node) { return !node ? "" : node.type === "Identifier" ? node.name : node.type === "TSQualifiedName" ? typeName(node.right) : ""; }
function isReactNodeType(node) {
  if (!node) return false;
  if (node.type === "TSTypeReference") return /^(?:ReactNode|ReactElement|ReactPortal)$/.test(typeName(node.typeName));
  if (node.type === "TSUnionType") return node.types.some(isReactNodeType);
  if (node.type === "TSArrayType") return isReactNodeType(node.elementType);
  return false;
}
function revealLikeProps(names, componentName = "") {
  const strong = [...names].some((name) => STRONG_MECHANICAL_PROPS.has(name));
  const content = [...names].some((name) => CONTENT_PROPS.has(name));
  return NAMED_REVEAL_COMPONENTS.has(componentName) || GENERIC_REVEAL_WRAPPERS.has(componentName) || strong || (content && ([...names].some((name) => MECHANICAL_PROPS.has(name)) || names.has("shown") || names.has("isShown")));
}

export default {
  meta: {
    type: "problem", schema: [],
    messages: {
      internalImport: "This file/import relationship is not approved for Tango reveal internals. Named semantic components may import only their explicitly assigned coordinator symbols.",
      infoCardStatic: "InfoCard is visual content only; interaction statics are forbidden.",
      genericWrapper: "Generic reveal wrappers are forbidden. Use a named semantic Tango component or static content.",
      arbitraryContent: "Reveal content must be strict coordinator data, not an arbitrary ReactNode/content slot.",
      directPortal: "This module is not an approved portal owner. Entity reveals portal only through the internal coordinator.",
      mechanicalProp: "Reveal placement, timing, anchor, and portal mechanics are coordinator-owned.",
      controlledState: "Reveal open/shown state is coordinator-owned and uncontrolled from product code.",
      publicSpec: "RevealSpec is an internal protocol and cannot appear in a product API.",
    },
  },
  create(context) {
    const filename = repoPath(context.filename, context.cwd);
    if (isInternalTest(filename)) return {};
    const portalFunctions = new Set();
    const portalNamespaces = new Set();
    const infoCardBindings = new Set(["InfoCard"]);
    const allowedRevealTypeNames = new Set();

    function checkInternalImport(node, source) {
      const resolved = resolvedImport(filename, source);
      if (!resolved.startsWith("src/tango/internal/reveal/")) return;
      const approved = APPROVED_INTERNAL_IMPORTS.get(`${filename}|${resolved}`);
      const imported = node.specifiers.map((specifier) => specifier.type === "ImportSpecifier" ? String(specifier.imported.name ?? specifier.imported.value) : "*");
      if (!approved || imported.some((name) => !approved.has(name))) context.report({ node, messageId: "internalImport" });
      else for (const name of imported) allowedRevealTypeNames.add(name);
    }

    function processMembers(node, componentName, members) {
      const properties = members.filter((member) => member.type === "TSPropertySignature");
      const names = new Set(properties.map(keyName));
      if (!revealLikeProps(names, componentName)) return;
      if (!NAMED_REVEAL_COMPONENTS.has(componentName) && (GENERIC_REVEAL_WRAPPERS.has(componentName) || [...names].some((name) => STRONG_MECHANICAL_PROPS.has(name)) || ([...names].some((name) => MECHANICAL_PROPS.has(name)) && [...names].some((name) => CONTENT_PROPS.has(name))))) {
        context.report({ node, messageId: "genericWrapper" });
      }
      for (const member of properties) {
        const name = keyName(member);
        const annotation = member.typeAnnotation?.typeAnnotation;
        if (CONTENT_PROPS.has(name) && isReactNodeType(annotation)) context.report({ node: member, messageId: "arbitraryContent" });
        if (MECHANICAL_PROPS.has(name)) context.report({ node: member, messageId: "mechanicalProp" });
        if (CONTROLLED_PROPS.has(name)) context.report({ node: member, messageId: "controlledState" });
      }
    }

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        checkInternalImport(node, source);
        if (/HoverPopover/.test(source)) context.report({ node, messageId: "genericWrapper" });
        if (source === "react-dom") {
          for (const specifier of node.specifiers) {
            if (specifier.type === "ImportSpecifier" && String(specifier.imported.name ?? specifier.imported.value) === "createPortal") portalFunctions.add(specifier.local.name);
            else if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") portalNamespaces.add(specifier.local.name);
          }
        }
        if (/InfoCard$/.test(stripExtension(source))) {
          for (const specifier of node.specifiers) if (specifier.type === "ImportSpecifier" && String(specifier.imported.name ?? specifier.imported.value) === "InfoCard") infoCardBindings.add(specifier.local.name);
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier") {
          if (node.init?.type === "Identifier" && portalFunctions.has(node.init.name)) portalFunctions.add(node.id.name);
          if (node.init?.type === "MemberExpression" && portalNamespaces.has(node.init.object?.name) && propertyName(node.init) === "createPortal") portalFunctions.add(node.id.name);
          if (node.init?.type === "ArrowFunctionExpression" && /^[A-Z]/.test(node.id.name) && node.init.params[0]?.type === "ObjectPattern") {
            const names = new Set(node.init.params[0].properties.map(keyName));
            if (revealLikeProps(names, node.id.name)) context.report({ node: node.id, messageId: "genericWrapper" });
          }
        }
        if (node.id.type === "ObjectPattern" && node.init?.type === "Identifier" && infoCardBindings.has(node.init.name)) {
          for (const property of node.id.properties) if (INFO_CARD_STATICS.has(keyName(property))) context.report({ node: property, messageId: "infoCardStatic" });
        }
      },
      MemberExpression(node) {
        if (node.object?.type === "Identifier" && infoCardBindings.has(node.object.name) && INFO_CARD_STATICS.has(propertyName(node))) context.report({ node, messageId: "infoCardStatic" });
      },
      CallExpression(node) {
        const direct = node.callee?.type === "Identifier" && portalFunctions.has(node.callee.name);
        const member = node.callee?.type === "MemberExpression" && node.callee.object?.type === "Identifier" && portalNamespaces.has(node.callee.object.name) && propertyName(node.callee) === "createPortal";
        if ((direct || member) && !PORTAL_OWNER_ALLOWLIST.has(filename)) context.report({ node, messageId: "directPortal" });
      },
      JSXOpeningElement(node) {
        const name = jsxName(node.name);
        const attributes = node.attributes.filter((attribute) => attribute.type === "JSXAttribute");
        const names = new Set(attributes.map((attribute) => jsxName(attribute.name)));
        if (!revealLikeProps(names, name)) return;
        if (!NAMED_REVEAL_COMPONENTS.has(name) && GENERIC_REVEAL_WRAPPERS.has(name)) context.report({ node, messageId: "genericWrapper" });
        for (const attribute of attributes) {
          const prop = jsxName(attribute.name);
          if (!NAMED_REVEAL_COMPONENTS.has(name) && CONTENT_PROPS.has(prop)) context.report({ node: attribute, messageId: "arbitraryContent" });
          if (MECHANICAL_PROPS.has(prop)) context.report({ node: attribute, messageId: "mechanicalProp" });
          if (CONTROLLED_PROPS.has(prop)) context.report({ node: attribute, messageId: "controlledState" });
        }
      },
      TSInterfaceDeclaration(node) { processMembers(node.id, node.id.name.replace(/Props$/, ""), node.body.body); },
      TSTypeAliasDeclaration(node) { if (node.typeAnnotation.type === "TSTypeLiteral") processMembers(node.id, node.id.name.replace(/Props$/, ""), node.typeAnnotation.members); },
      TSPropertySignature(node) { if (/^revealSpec$/i.test(keyName(node))) context.report({ node: node.key, messageId: "publicSpec" }); },
      TSTypeReference(node) { if (typeName(node.typeName) === "RevealSpec" && !allowedRevealTypeNames.has("RevealSpec")) context.report({ node, messageId: "publicSpec" }); },
      FunctionDeclaration(node) { if (node.id && GENERIC_REVEAL_WRAPPERS.has(node.id.name)) context.report({ node: node.id, messageId: "genericWrapper" }); },
    };
  },
};
