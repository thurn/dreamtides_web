// A minimal, dependency-free XML reader for Tiled's TMX and TSX files: it
// parses elements, attributes, text, CDATA and character references, and
// skips the declaration, comments, processing instructions and doctype.
// It is strict about structure (mismatched or unclosed tags throw) and makes
// no attempt at namespaces or DTD entities, which Tiled never writes.

/** One parsed XML element. */
export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** The element's own text content (text and CDATA), concatenated. */
  readonly text: string;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    const named = NAMED_ENTITIES[body];
    if (named === undefined) throw new Error(`Unknown XML entity ${match}.`);
    return named;
  });
}

interface MutableElement {
  name: string;
  attributes: Record<string, string>;
  children: MutableElement[];
  text: string;
}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const ATTRIBUTE = /\s*([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/y;

/** Parse an XML document and return its root element. */
export function parseXml(text: string): XmlElement {
  const source = text;
  const stack: MutableElement[] = [];
  let root: MutableElement | null = null;
  let index = 0;

  function fail(message: string): never {
    throw new Error(`XML parse error at offset ${String(index)}: ${message}`);
  }
  function skipPast(terminator: string): void {
    const end = source.indexOf(terminator, index);
    if (end === -1) fail(`missing ${terminator}`);
    index = end + terminator.length;
  }

  while (index < source.length) {
    const lt = source.indexOf("<", index);
    const textEnd = lt === -1 ? source.length : lt;
    if (textEnd > index) {
      const text = source.slice(index, textEnd);
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.text += decodeEntities(text);
      else if (text.trim() !== "") fail("text outside the root element");
      index = textEnd;
      continue;
    }
    if (source.startsWith("<?", index)) {
      skipPast("?>");
    } else if (source.startsWith("<!--", index)) {
      skipPast("-->");
    } else if (source.startsWith("<![CDATA[", index)) {
      const start = index + "<![CDATA[".length;
      skipPast("]]>");
      const parent = stack[stack.length - 1];
      if (parent === undefined) fail("CDATA outside the root element");
      else parent.text += source.slice(start, index - 3);
    } else if (source.startsWith("<!", index)) {
      skipPast(">");
    } else if (source.startsWith("</", index)) {
      index += 2;
      NAME.lastIndex = index;
      const match = NAME.exec(source);
      if (match === null) fail("malformed closing tag");
      const name = match[0];
      index = NAME.lastIndex;
      const open = stack.pop();
      if (open?.name !== name) fail(`closing </${name}> does not match`);
      while (/\s/u.test(source[index] ?? "")) index += 1;
      if (source[index] !== ">") fail("malformed closing tag");
      index += 1;
    } else {
      index += 1;
      NAME.lastIndex = index;
      const match = NAME.exec(source);
      if (match === null) fail("malformed opening tag");
      const element: MutableElement = {
        name: match[0],
        attributes: {},
        children: [],
        text: "",
      };
      index = NAME.lastIndex;
      for (;;) {
        ATTRIBUTE.lastIndex = index;
        const attribute = ATTRIBUTE.exec(source);
        if (attribute === null) break;
        element.attributes[attribute[1]] = decodeEntities(
          attribute[3] ?? attribute[4] ?? "",
        );
        index = ATTRIBUTE.lastIndex;
      }
      while (/\s/u.test(source[index] ?? "")) index += 1;
      const selfClosing = source.startsWith("/>", index);
      if (!selfClosing && source[index] !== ">") fail("malformed opening tag");
      index += selfClosing ? 2 : 1;
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.children.push(element);
      else if (root === null) root = element;
      else fail("more than one root element");
      if (!selfClosing) stack.push(element);
    }
  }
  const unclosed = stack[stack.length - 1];
  if (unclosed !== undefined) fail(`unclosed <${unclosed.name}>`);
  if (root === null) fail("no root element");
  return root;
}

/** The direct children of `element` named `name`. */
export function childrenNamed(
  element: XmlElement,
  name: string,
): readonly XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

/** The first direct child of `element` named `name`, or null. */
export function childNamed(element: XmlElement, name: string): XmlElement | null {
  return element.children.find((child) => child.name === name) ?? null;
}
