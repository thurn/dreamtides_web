import {
  FluentParser,
  FluentSerializer,
  Junk,
  columnOffset,
  lineOffset,
} from "@fluent/syntax";

const parser = new FluentParser({ withSpans: true });
const serializer = new FluentSerializer();

function parseResource(source, sourceName) {
  const resource = parser.parse(source);
  const junk = resource.body.filter((entry) => entry instanceof Junk);
  if (junk.length === 0) return resource;

  const diagnostics = junk.flatMap((entry) => {
    const annotations =
      entry.annotations.length > 0
        ? entry.annotations
        : [{ message: "Invalid Fluent syntax", span: entry.span }];
    return annotations.map((annotation) => {
      const start = annotation.span?.start ?? entry.span?.start ?? 0;
      const line = lineOffset(source, start) + 1;
      const column = columnOffset(source, start) + 1;
      return `${sourceName}:${String(line)}:${String(column)}: ${annotation.message}`;
    });
  });

  throw new Error(
    `Unable to format Fluent resource:\n${diagnostics.join("\n")}`,
  );
}

export function formatFluent(source, sourceName = "<input>") {
  const resource = parseResource(source, sourceName);
  const formatted = serializer.serialize(resource);
  const reparsed = parseResource(formatted, sourceName);
  if (!resource.equals(reparsed, ["span"])) {
    throw new Error(
      `Unable to format Fluent resource without changing its syntax tree: ${sourceName}`,
    );
  }
  return formatted;
}
