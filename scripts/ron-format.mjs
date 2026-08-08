const OPEN_TO_CLOSE = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
]);
const CLOSE_TOKENS = new Set(OPEN_TO_CLOSE.values());

function isWhitespace(character) {
  return /\s/u.test(character);
}

function scanQuoted(source, start, quoteOffset = 0) {
  const quote = source[start + quoteOffset];
  let index = start + quoteOffset + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  throw new Error(`Unterminated quoted literal at offset ${String(start)}`);
}

function scanRawString(source, start) {
  const match = /^(?:br|r)(#*)"/u.exec(source.slice(start));
  if (match === null) return null;
  const hashes = match[1];
  const contentStart = start + match[0].length;
  const closing = `"${hashes}`;
  const closeIndex = source.indexOf(closing, contentStart);
  if (closeIndex === -1) {
    throw new Error(`Unterminated raw string at offset ${String(start)}`);
  }
  return closeIndex + closing.length;
}

function scanBlockComment(source, start) {
  let depth = 1;
  let index = start + 2;
  while (index < source.length && depth > 0) {
    if (source.startsWith("/*", index)) {
      depth += 1;
      index += 2;
    } else if (source.startsWith("*/", index)) {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  if (depth !== 0) {
    throw new Error(`Unterminated block comment at offset ${String(start)}`);
  }
  return index;
}

export function tokenizeRon(source) {
  const tokens = [];
  let index = 0;
  let newlinesBefore = 0;

  function push(kind, end) {
    tokens.push({
      kind,
      text: source.slice(index, end),
      newlinesBefore,
    });
    index = end;
    newlinesBefore = 0;
  }

  while (index < source.length) {
    if (isWhitespace(source[index])) {
      if (source[index] === "\n") newlinesBefore += 1;
      index += 1;
      continue;
    }

    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      push("line-comment", newline === -1 ? source.length : newline);
      continue;
    }
    if (source.startsWith("/*", index)) {
      push("block-comment", scanBlockComment(source, index));
      continue;
    }

    const rawStringEnd = scanRawString(source, index);
    if (rawStringEnd !== null) {
      push("atom", rawStringEnd);
      continue;
    }
    if (source[index] === '"' || source[index] === "'") {
      push("atom", scanQuoted(source, index));
      continue;
    }
    if (
      (source[index] === "b" && source[index + 1] === '"') ||
      (source[index] === "b" && source[index + 1] === "'")
    ) {
      push("atom", scanQuoted(source, index, 1));
      continue;
    }

    const character = source[index];
    if (OPEN_TO_CLOSE.has(character)) {
      push("open", index + 1);
      continue;
    }
    if (CLOSE_TOKENS.has(character)) {
      push("close", index + 1);
      continue;
    }
    if (character === ",") {
      push("comma", index + 1);
      continue;
    }
    if (character === ":") {
      if (source[index + 1] === ":") push("atom", index + 2);
      else push("colon", index + 1);
      continue;
    }

    let end = index + 1;
    while (end < source.length) {
      const next = source[end];
      if (
        isWhitespace(next) ||
        OPEN_TO_CLOSE.has(next) ||
        CLOSE_TOKENS.has(next) ||
        next === "," ||
        next === ":" ||
        next === '"' ||
        next === "'" ||
        source.startsWith("//", end) ||
        source.startsWith("/*", end)
      )
        break;
      end += 1;
    }
    push("atom", end);
  }

  return tokens;
}

function parseNodes(tokens) {
  let index = 0;

  function parseSequence(expectedClose = null) {
    const nodes = [];
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.kind === "close") {
        if (expectedClose === null) {
          throw new Error(`Unexpected closing delimiter ${token.text}`);
        }
        if (token.text !== expectedClose) {
          throw new Error(
            `Expected closing delimiter ${expectedClose}, found ${token.text}`,
          );
        }
        index += 1;
        return { nodes, close: token };
      }
      if (token.kind === "open") {
        index += 1;
        const parsed = parseSequence(OPEN_TO_CLOSE.get(token.text));
        nodes.push({ kind: "group", open: token, ...parsed });
      } else {
        nodes.push({ kind: "token", token });
        index += 1;
      }
    }
    if (expectedClose !== null) {
      throw new Error(`Missing closing delimiter ${expectedClose}`);
    }
    return { nodes, close: null };
  }

  return parseSequence().nodes;
}

function firstToken(node) {
  return node.kind === "group" ? node.open : node.token;
}

function nodeCategory(node) {
  if (node.kind === "group") return "group";
  return node.token.kind;
}

function needsSpace(previous, current) {
  if (previous === null) return false;
  if (previous === "open") return false;
  if (["close", "comma", "colon"].includes(current)) return false;
  if (current === "group" && ["atom", "group"].includes(previous)) return false;
  return true;
}

function flatSequence(nodes) {
  let output = "";
  let previous = null;
  for (const node of nodes) {
    let text;
    const current = nodeCategory(node);
    if (node.kind === "group") text = flatGroup(node);
    else if (node.token.kind === "line-comment") return null;
    else if (
      node.token.kind === "block-comment" &&
      node.token.newlinesBefore > 0
    )
      return null;
    else text = node.token.text;
    if (text === null || text.includes("\n")) return null;
    if (needsSpace(previous, current)) output += " ";
    output += text;
    previous = current;
  }
  return output;
}

function canNormalizeTrailingComma(group) {
  if (group.nodes.length === 0) return false;
  if (group.open.text !== "(") return true;

  const hasNamedField = group.nodes.some(
    (node) => node.kind === "token" && node.token.kind === "colon",
  );
  const commaCount = group.nodes.filter(
    (node) => node.kind === "token" && node.token.kind === "comma",
  ).length;
  const last = group.nodes.at(-1);
  const separatorCommaCount =
    commaCount -
    (last?.kind === "token" && last.token.kind === "comma" ? 1 : 0);
  return hasNamedField || separatorCommaCount > 0;
}

function hasSafeTrailingComma(group) {
  const last = group.nodes.at(-1);
  return (
    last?.kind === "token" &&
    last.token.kind === "comma" &&
    canNormalizeTrailingComma(group)
  );
}

function flatGroup(group) {
  const nodes = hasSafeTrailingComma(group)
    ? group.nodes.slice(0, -1)
    : group.nodes;
  const inner = flatSequence(nodes);
  if (inner === null) return null;
  return `${group.open.text}${inner}${group.close.text}`;
}

class Writer {
  constructor(indentWidth) {
    this.indentWidth = indentWidth;
    this.output = "";
    this.column = 0;
    this.lineHasContent = false;
  }

  append(text) {
    this.output += text;
    const newline = text.lastIndexOf("\n");
    if (newline === -1) {
      this.column += text.length;
      this.lineHasContent ||= text.length > 0;
    } else {
      this.column = text.length - newline - 1;
      this.lineHasContent = this.column > 0;
    }
  }

  space() {
    if (this.output.endsWith(" ") || this.output.endsWith("\n")) return;
    this.append(" ");
  }

  newline(indentLevel = 0) {
    this.output = this.output.replace(/[ \t]+$/u, "");
    if (!this.output.endsWith("\n")) this.output += "\n";
    const indentation = " ".repeat(indentLevel * this.indentWidth);
    this.output += indentation;
    this.column = indentation.length;
    this.lineHasContent = false;
  }

  blankLine(indentLevel = 0) {
    this.output = this.output.replace(/[ \t]+$/u, "");
    if (!this.output.endsWith("\n")) this.output += "\n";
    this.output += "\n";
    const indentation = " ".repeat(indentLevel * this.indentWidth);
    this.output += indentation;
    this.column = indentation.length;
    this.lineHasContent = false;
  }
}

function splitAtCommas(nodes) {
  const segments = [];
  let current = [];
  for (const node of nodes) {
    if (node.kind === "token" && node.token.kind === "comma") {
      segments.push({ nodes: current, comma: node });
      current = [];
    } else {
      current.push(node);
    }
  }
  if (current.length > 0) segments.push({ nodes: current, comma: null });
  return segments;
}

function segmentHasNamedRecord(nodes) {
  return nodes.some(
    (node, index) =>
      node.kind === "token" &&
      node.token.kind === "atom" &&
      nodes[index + 1]?.kind === "group" &&
      nodes[index + 1].open.text === "(",
  );
}

function shouldSeparateSegments(group, segments, indentLevel) {
  if (segments.length < 2) return false;

  const isRecordWithNamedFields =
    indentLevel === 0 &&
    group.open.text === "(" &&
    group.nodes.some(
      (node) => node.kind === "token" && node.token.kind === "colon",
    );
  const isListOfNamedRecords =
    group.open.text === "[" &&
    segments.every((segment) => segmentHasNamedRecord(segment.nodes));

  return isRecordWithNamedFields || isListOfNamedRecords;
}

function renderSequence(writer, nodes, indentLevel, options) {
  let previous = null;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const token = firstToken(node);
    const current = nodeCategory(node);

    if (token.kind === "line-comment") {
      if (writer.lineHasContent) writer.space();
      writer.append(token.text);
      if (index < nodes.length - 1) writer.newline(indentLevel);
      previous = null;
      continue;
    }
    if (token.kind === "block-comment" && token.newlinesBefore > 0) {
      if (writer.lineHasContent) writer.newline(indentLevel);
      writer.append(token.text);
      if (index < nodes.length - 1) writer.newline(indentLevel);
      previous = null;
      continue;
    }

    if (needsSpace(previous, current)) writer.space();
    if (node.kind === "group") {
      renderGroup(writer, node, indentLevel, {
        ...options,
        reserveWidth:
          index === nodes.length - 1 ? (options.reserveWidth ?? 0) : 0,
      });
    } else writer.append(node.token.text);
    previous = current;
  }
}

function renderGroup(writer, group, indentLevel, options) {
  const segments = splitAtCommas(group.nodes);
  const separateSegments = shouldSeparateSegments(
    group,
    segments,
    indentLevel,
  );
  const hasIntentionalRootBlankLine =
    indentLevel === 0 &&
    group.nodes.some((node) => firstToken(node).newlinesBefore >= 2);
  const flat =
    separateSegments || hasIntentionalRootBlankLine
      ? null
      : flatGroup(group);
  if (
    flat !== null &&
    writer.column + flat.length + (options.reserveWidth ?? 0) <=
      options.printWidth
  ) {
    writer.append(flat);
    return;
  }

  writer.append(group.open.text);
  if (group.nodes.length === 0) {
    writer.append(group.close.text);
    return;
  }

  const childIndent = indentLevel + 1;
  writer.newline(childIndent);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segmentFirstToken =
      segment.nodes.length === 0 ? null : firstToken(segment.nodes[0]);
    if (
      index > 0 &&
      (separateSegments ||
        (indentLevel === 0 && segmentFirstToken?.newlinesBefore >= 2))
    ) {
      writer.blankLine(childIndent);
    }
    renderSequence(writer, segment.nodes, childIndent, {
      ...options,
      reserveWidth:
        segment.comma === null ? 0 : segment.comma.token.text.length,
    });
    if (segment.comma !== null) writer.append(segment.comma.token.text);
    else if (index === segments.length - 1 && canNormalizeTrailingComma(group))
      writer.append(",");
    writer.newline(index === segments.length - 1 ? indentLevel : childIndent);
  }
  writer.append(group.close.text);
}

function comparableNodes(nodes, output = []) {
  for (const node of nodes) {
    if (node.kind === "token") {
      output.push(`${node.token.kind}\0${node.token.text}`);
      continue;
    }
    output.push(`${node.open.kind}\0${node.open.text}`);
    const content = hasSafeTrailingComma(node)
      ? node.nodes.slice(0, -1)
      : node.nodes;
    comparableNodes(content, output);
    output.push(`${node.close.kind}\0${node.close.text}`);
  }
  return output;
}

function comparableTokens(source) {
  return comparableNodes(parseNodes(tokenizeRon(source)));
}

export function formatRon(source, options = {}) {
  const indentWidth = options.indentWidth ?? 2;
  const printWidth = options.printWidth ?? 100;
  if (!Number.isInteger(indentWidth) || indentWidth < 0) {
    throw new Error("indentWidth must be a non-negative integer");
  }
  if (!Number.isInteger(printWidth) || printWidth < 1) {
    throw new Error("printWidth must be a positive integer");
  }

  const tokens = tokenizeRon(source);
  const nodes = parseNodes(tokens);
  const writer = new Writer(indentWidth);
  let sawLeadingFileComment = false;
  let sawTopLevelValue = false;
  for (const node of nodes) {
    const token = firstToken(node);
    const isComment = ["line-comment", "block-comment"].includes(token.kind);
    if (
      writer.lineHasContent &&
      sawLeadingFileComment &&
      !sawTopLevelValue &&
      !isComment
    ) {
      writer.blankLine(0);
    } else if (token.newlinesBefore > 0 && writer.lineHasContent) {
      writer.newline(0);
    }
    renderSequence(writer, [node], 0, { printWidth });
    if (isComment && !sawTopLevelValue) sawLeadingFileComment = true;
    else if (!isComment) sawTopLevelValue = true;
  }

  const formatted = `${writer.output.trimEnd()}\n`;
  const before = comparableTokens(source);
  const after = comparableTokens(formatted);
  if (
    before.length !== after.length ||
    before.some((token, index) => token !== after[index])
  ) {
    throw new Error("Refusing to format because the RON token stream changed");
  }
  return formatted;
}
