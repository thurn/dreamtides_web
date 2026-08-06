import path from "node:path";

const INFO_CARD_STATICS = new Set(["PressInfo", "PressPopover", "usePressReveal", "anchorRect", "setRevealDelay", "SITE_DISC"]);
const MECHANICAL_PROPS = new Set(["anchorRect", "portalTarget", "revealSide", "revealPlacement", "revealDelayMs", "hoverDelayMs", "pressDelayMs", "delayMs", "gap", "maxWidthPx", "triggerAs"]);
const STRONG_MECHANICAL_PROPS = new Set(["anchorRect", "portalTarget", "revealSide", "revealPlacement", "revealDelayMs", "hoverDelayMs", "pressDelayMs"]);
const CONTROLLED_PROPS = new Set(["open", "shown", "isOpen", "isShown", "revealOpen", "revealShown"]);
const INTERACTION_ESCAPE_PROPS = new Set(["onMouseEnter", "onMouseMove", "onMouseLeave", "onPointerEnter", "onPointerMove", "onPointerLeave", "onPointerDown", "onPointerUp", "onPointerCancel", "onMouseDown", "onMouseUp", "onTouchStart", "onTouchMove", "onTouchEnd"]);
const CONTENT_PROPS = new Set(["content", "children", "card", "reveal", "renderedContent"]);
const NAMED_REVEAL_COMPONENTS = new Set(["GameCard", "CompactGameCardRow", "EntityReference", "InfoCard", "AtlasNode", "GlossaryTerm", "BattleGameCard", "Dreamsign", "WagerPrizeCard", "DreamAvatarPortrait", "DreamAvatarAbilityText", "TideDisc", "TidesInfoLabel", "EssenceValue", "PipBadge", "CardStatOrb", "JourneyStatusBar", "SiteNode", "TransfigurationFormButton", "OfferTile"]);
const GENERIC_REVEAL_WRAPPERS = new Set(["HoverPopover", "RevealPopover", "EntityReveal", "GenericReveal", "RevealWrapper", "EntityRevealWrapper"]);

const CONTEXT_COMPONENTS = [
  "src/cumulus/components/atlas/AtlasNode.tsx",
  "src/cumulus/components/card/CardStatOrb.tsx",
  "src/cumulus/components/card/CardChoiceGrid.tsx",
  "src/cumulus/components/card/CardGalleryPanel.tsx",
  "src/cumulus/components/card/DreamsignGalleryPanel.tsx",
  "src/cumulus/components/card/EntityReference.tsx",
  "src/cumulus/components/card/CardView.tsx",
  "src/cumulus/components/card/CompactGameCardRow.tsx",
  "src/cumulus/components/card/GlossaryTerm.tsx",
  "src/cumulus/components/card/PlayingCard.tsx",
  "src/cumulus/components/controls/PipBadge.tsx",
  "src/cumulus/components/controls/OfferTile.tsx",
  "src/cumulus/components/controls/TransfigurationFormButton.tsx",
  "src/cumulus/components/dreamscape/SiteNode.tsx",
  "src/cumulus/components/hud/DreamAvatarPortrait.tsx",
  "src/cumulus/components/hud/DreamAvatarAbilityText.tsx",
  "src/cumulus/components/hud/Dreamsign.tsx",
  "src/cumulus/components/hud/JourneyStatusBar.tsx",
  "src/cumulus/components/hud/EssenceValue.tsx",
  "src/cumulus/components/hud/TideDisc.tsx",
  "src/cumulus/components/hud/TidesInfoLabel.tsx",
  "src/cumulus/components/hud/TideSelectionButton.tsx",
];
const IDENTITY_COMPONENTS = CONTEXT_COMPONENTS.filter((file) => !file.endsWith("CardView.tsx") && !file.endsWith("CompactGameCardRow.tsx"));
const APPROVED_INTERNAL_IMPORTS = new Map();
for (const file of CONTEXT_COMPONENTS) APPROVED_INTERNAL_IMPORTS.set(`${file}|src/cumulus/internal/reveal/context`, new Set(["useRevealSource"]));
for (const file of IDENTITY_COMPONENTS) APPROVED_INTERNAL_IMPORTS.set(`${file}|src/cumulus/internal/reveal/identity`, new Set(["revealEntityId"]));
APPROVED_INTERNAL_IMPORTS.set("src/cumulus/CumulusRoot.tsx|src/cumulus/internal/reveal/context", new Set(["RevealCoordinatorProvider"]));
APPROVED_INTERNAL_IMPORTS.set("src/cumulus/components/atlas/AtlasNode.tsx|src/cumulus/internal/reveal/model", new Set(["RevealInfoCardModel", "RevealSpec"]));
APPROVED_INTERNAL_IMPORTS.set("src/cumulus/components/hud/DreamAvatarPortrait.tsx|src/cumulus/internal/reveal/model", new Set(["RevealSpec"]));

const PORTAL_OWNER_ALLOWLIST = new Set([
  "src/cumulus/internal/reveal/RevealOverlay.tsx",
  "src/cumulus/components/controls/Select.tsx",
  "src/cumulus/components/overlay/CommandMenu.tsx",
  "src/battle/components/BattleContextMenu.tsx",
  "src/debug/SignatureDecksApp.tsx",
]);
const APPROVED_PROP_TYPE_IMPORTS = new Map([
  ["src/cumulus/components/card/CardView|GameCardProps", "GameCard"],
  ["src/cumulus/components/hud/JourneyStatusBar|JourneyStatusBarProps", "JourneyStatusBar"],
]);

function repoPath(filename, cwd) { return path.relative(cwd, filename).split(path.sep).join("/"); }
function stripExtension(value) { return value.replace(/\.(?:ts|tsx|js|jsx)$/, ""); }
function resolvedImport(filename, source) {
  if (source.startsWith("src/")) return stripExtension(path.posix.normalize(source));
  return stripExtension(path.posix.normalize(path.posix.join(path.posix.dirname(filename), source)));
}
function isInternalTest(filename) { return filename.startsWith("src/cumulus/internal/reveal/") || /\.test\.[cm]?[jt]sx?$/.test(filename); }
function jsxName(node) { return node?.type === "JSXIdentifier" ? node.name : node?.type === "JSXMemberExpression" ? jsxName(node.property) : ""; }
function keyName(node) {
  if (!node || node.computed) return "";
  if (node.key?.type === "Identifier" || node.key?.type === "Literal") return String(node.key.name ?? node.key.value ?? "");
  if (node.type === "Property" && (node.key.type === "Identifier" || node.key.type === "Literal")) return String(node.key.name ?? node.key.value ?? "");
  return "";
}
function propertyName(node) {
  if (!node) return "";
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed && node.property?.type === "Literal" && typeof node.property.value === "string") return node.property.value;
  if (node.computed && node.property?.type === "TemplateLiteral" && node.property.expressions.length === 0) return node.property.quasis[0]?.value.cooked ?? "";
  return "";
}
function staticString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? "";
  return "";
}
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
      internalImport: "This file/import relationship is not approved for Cumulus reveal internals. Named semantic components may import only their explicitly assigned coordinator symbols.",
      infoCardStatic: "InfoCard is visual content only; interaction statics are forbidden.",
      genericWrapper: "Generic reveal wrappers are forbidden. Use a named semantic Cumulus component or static content.",
      arbitraryContent: "Reveal content must be strict coordinator data, not an arbitrary ReactNode/content slot.",
      directPortal: "This module is not an approved portal owner. Entity reveals portal only through the internal coordinator.",
      mechanicalProp: "Reveal placement, timing, anchor, and portal mechanics are coordinator-owned.",
      controlledState: "Reveal open/shown state is coordinator-owned and uncontrolled from product code.",
      publicSpec: "RevealSpec is an internal protocol and cannot appear in a product API.",
      opaqueSpread: "Named reveal components accept only statically enumerable safe props; opaque JSX spreads are forbidden.",
      interactionEscape: "Named reveal components own hover and press reveal handlers. Supply semantic activation through the component API.",
    },
  },
  create(context) {
    const filename = repoPath(context.filename, context.cwd);
    if (isInternalTest(filename)) return {};
    const sourceCode = context.sourceCode;
    const portalFunctions = new Set();
    const portalNamespaces = new Set();
    const infoCardBindings = new Set(["InfoCard"]);
    const allowedRevealTypeNames = new Set();
    const staticObjectBindings = new Map();
    const typedSpreadBindings = new Map();
    const approvedPropTypeBindings = new Map();
    const namedComponentBindings = new Map();

    function variableFor(node, name) {
      let scope = sourceCode.getScope(node);
      while (scope !== null) {
        const variable = scope.set.get(name);
        if (variable !== undefined) return variable;
        scope = scope.upper;
      }
      return undefined;
    }

    function declaredVariable(node) {
      return sourceCode.getDeclaredVariables(node)[0];
    }

    function objectProperties(node) {
      if (node?.type !== "ObjectExpression") return [];
      return node.properties.filter((property) => property.type === "Property" && property.kind === "init" && keyName(property) !== "");
    }

    function typeParameters(node) {
      return node?.typeArguments?.params ?? node?.typeParameters?.params ?? [];
    }

    function isLiteralKeyType(node) {
      if (node?.type === "TSLiteralType") {
        return node.literal?.type === "Literal" && typeof node.literal.value === "string";
      }
      return node?.type === "TSUnionType" && node.types.length > 0
        && node.types.every(isLiteralKeyType);
    }

    function approvedComponentForPropsType(node) {
      if (node?.type === "TSParenthesizedType") return approvedComponentForPropsType(node.typeAnnotation);
      if (node?.type !== "TSTypeReference") return "";
      const name = typeName(node.typeName);
      const direct = approvedPropTypeBindings.get(variableFor(node, name));
      if (direct !== undefined && typeParameters(node).length === 0) return direct;
      if (name !== "Omit" && name !== "Pick") return "";
      const parameters = typeParameters(node);
      if (parameters.length !== 2 || !isLiteralKeyType(parameters[1])) return "";
      const base = parameters[0];
      if (base?.type !== "TSTypeReference" || typeParameters(base).length !== 0) return "";
      return approvedPropTypeBindings.get(variableFor(base, typeName(base.typeName))) ?? "";
    }

    function registerTypedParameters(parameters) {
      for (const parameter of parameters) {
        if (parameter.type !== "Identifier") continue;
        const component = approvedComponentForPropsType(parameter.typeAnnotation?.typeAnnotation);
        const variable = variableFor(parameter, parameter.name);
        if (component !== "" && variable !== undefined) typedSpreadBindings.set(variable, new Set([component]));
      }
    }

    function componentIdentity(node) {
      const name = jsxName(node);
      if (NAMED_REVEAL_COMPONENTS.has(name)) return name;
      if (node?.type !== "JSXIdentifier") return "";
      return namedComponentBindings.get(variableFor(node, node.name)) ?? "";
    }

    function checkInternalImport(node, source) {
      const resolved = resolvedImport(filename, source);
      if (!resolved.startsWith("src/cumulus/internal/reveal/")) return;
      const approved = APPROVED_INTERNAL_IMPORTS.get(`${filename}|${resolved}`);
      const imported = node.specifiers.map((specifier) => specifier.type === "ImportSpecifier" ? String(specifier.imported.name ?? specifier.imported.value) : "*");
      if (!approved || imported.some((name) => !approved.has(name))) context.report({ node, messageId: "internalImport" });
      else for (const name of imported) allowedRevealTypeNames.add(name);
    }

    function checkInternalBoundary(node, source) {
      const resolved = resolvedImport(filename, source);
      if (resolved.startsWith("src/cumulus/internal/reveal/")) {
        context.report({ node, messageId: "internalImport" });
      }
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
        if (NAMED_REVEAL_COMPONENTS.has(componentName) && INTERACTION_ESCAPE_PROPS.has(name)) context.report({ node: member, messageId: "interactionEscape" });
      }
    }

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        checkInternalImport(node, source);
        const resolved = resolvedImport(filename, source);
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          const imported = String(specifier.imported.name ?? specifier.imported.value);
          const binding = declaredVariable(specifier);
          const typeOnly = node.importKind === "type" || specifier.importKind === "type";
          if (!typeOnly && binding !== undefined && NAMED_REVEAL_COMPONENTS.has(imported)) {
            namedComponentBindings.set(binding, imported);
          }
          if (!typeOnly) continue;
          const component = APPROVED_PROP_TYPE_IMPORTS.get(`${resolved}|${imported}`);
          if (component !== undefined && binding !== undefined) approvedPropTypeBindings.set(binding, component);
        }
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
          const binding = declaredVariable(node);
          if (node.init?.type === "Identifier" && portalFunctions.has(node.init.name)) portalFunctions.add(node.id.name);
          if (node.init?.type === "Identifier" && infoCardBindings.has(node.init.name)) infoCardBindings.add(node.id.name);
          if (node.init?.type === "Identifier" && binding !== undefined) {
            const component = namedComponentBindings.get(variableFor(node.init, node.init.name));
            if (component !== undefined) namedComponentBindings.set(binding, component);
          }
          if (node.init?.type === "MemberExpression" && portalNamespaces.has(node.init.object?.name) && propertyName(node.init) === "createPortal") portalFunctions.add(node.id.name);
          if (node.parent?.kind === "const" && node.init?.type === "ObjectExpression" && binding !== undefined) {
            staticObjectBindings.set(binding, objectProperties(node.init));
          }
          if (node.init?.type === "ArrowFunctionExpression" && /^[A-Z]/.test(node.id.name) && node.init.params[0]?.type === "ObjectPattern") {
            const names = new Set(node.init.params[0].properties.map(keyName));
            if (revealLikeProps(names, node.id.name)) context.report({ node: node.id, messageId: "genericWrapper" });
          }
        }
        if (node.id.type === "ObjectPattern" && node.init?.type === "Identifier" && infoCardBindings.has(node.init.name)) {
          for (const property of node.id.properties) if (INFO_CARD_STATICS.has(keyName(property))) context.report({ node: property, messageId: "infoCardStatic" });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) checkInternalBoundary(node, String(node.source.value));
      },
      ExportAllDeclaration(node) {
        checkInternalBoundary(node, String(node.source.value));
      },
      ImportExpression(node) {
        const source = staticString(node.source);
        if (source !== "") checkInternalBoundary(node, source);
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
        const sourceName = jsxName(node.name);
        const name = componentIdentity(node.name) || sourceName;
        const attributes = node.attributes.filter((attribute) => attribute.type === "JSXAttribute");
        const opaqueSpreads = node.attributes.filter((attribute) => {
          if (attribute.type !== "JSXSpreadAttribute") return false;
          if (attribute.argument.type === "ObjectExpression") return false;
          if (attribute.argument.type !== "Identifier") return true;
          const binding = variableFor(attribute.argument, attribute.argument.name);
          return !staticObjectBindings.has(binding)
            && !typedSpreadBindings.get(binding)?.has(name);
        });
        const spreadProperties = node.attributes.flatMap((attribute) => {
          if (attribute.type !== "JSXSpreadAttribute") return [];
          if (attribute.argument.type === "Identifier") {
            return staticObjectBindings.get(variableFor(attribute.argument, attribute.argument.name)) ?? [];
          }
          return objectProperties(attribute.argument);
        });
        const names = new Set([...attributes.map((attribute) => jsxName(attribute.name)), ...spreadProperties.map(keyName)]);
        if (!revealLikeProps(names, name)) return;
        if (NAMED_REVEAL_COMPONENTS.has(name)) {
          for (const spread of opaqueSpreads) context.report({ node: spread, messageId: "opaqueSpread" });
        }
        if (!NAMED_REVEAL_COMPONENTS.has(name) && GENERIC_REVEAL_WRAPPERS.has(name)) context.report({ node, messageId: "genericWrapper" });
        for (const attribute of attributes) {
          const prop = jsxName(attribute.name);
          if (!NAMED_REVEAL_COMPONENTS.has(name) && CONTENT_PROPS.has(prop)) context.report({ node: attribute, messageId: "arbitraryContent" });
          if (MECHANICAL_PROPS.has(prop)) context.report({ node: attribute, messageId: "mechanicalProp" });
          if (CONTROLLED_PROPS.has(prop)) context.report({ node: attribute, messageId: "controlledState" });
          if (NAMED_REVEAL_COMPONENTS.has(name) && INTERACTION_ESCAPE_PROPS.has(prop)) context.report({ node: attribute, messageId: "interactionEscape" });
        }
        for (const property of spreadProperties) {
          const prop = keyName(property);
          if (!NAMED_REVEAL_COMPONENTS.has(name) && CONTENT_PROPS.has(prop)) context.report({ node: property, messageId: "arbitraryContent" });
          if (MECHANICAL_PROPS.has(prop)) context.report({ node: property, messageId: "mechanicalProp" });
          if (CONTROLLED_PROPS.has(prop)) context.report({ node: property, messageId: "controlledState" });
          if (NAMED_REVEAL_COMPONENTS.has(name) && INTERACTION_ESCAPE_PROPS.has(prop)) context.report({ node: property, messageId: "interactionEscape" });
        }
      },
      TSInterfaceDeclaration(node) { processMembers(node.id, node.id.name.replace(/Props$/, ""), node.body.body); },
      TSTypeAliasDeclaration(node) { if (node.typeAnnotation.type === "TSTypeLiteral") processMembers(node.id, node.id.name.replace(/Props$/, ""), node.typeAnnotation.members); },
      TSPropertySignature(node) { if (/^revealSpec$/i.test(keyName(node))) context.report({ node: node.key, messageId: "publicSpec" }); },
      TSTypeReference(node) { if (typeName(node.typeName) === "RevealSpec" && !allowedRevealTypeNames.has("RevealSpec")) context.report({ node, messageId: "publicSpec" }); },
      FunctionDeclaration(node) {
        registerTypedParameters(node.params);
        if (node.id && GENERIC_REVEAL_WRAPPERS.has(node.id.name)) context.report({ node: node.id, messageId: "genericWrapper" });
      },
      FunctionExpression(node) { registerTypedParameters(node.params); },
      ArrowFunctionExpression(node) { registerTypedParameters(node.params); },
    };
  },
};
