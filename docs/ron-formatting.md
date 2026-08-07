# RON formatting

The repository formats tracked RON sources with two-space indentation and a
120-column target. Short lists, maps, tuples, and structs remain on one line;
larger values break at their top-level commas. String and comment contents are
preserved exactly.

Format every tracked or unignored RON file:

```bash
npm run format:ron
```

Check formatting without writing files:

```bash
npm run format:ron:check
```

The diff-aware `npm run review` check runs the formatting gate when a RON file,
the formatter, or `.ronfmt.json` changes. `npm run review:full` always runs the
gate.

The formatter validates balanced delimiters and compares the significant token
stream before writing. Formatting may remove a trailing comma from an inline
list, map, multi-element tuple, or named-field value. It retains the comma in a
single-element tuple because that comma carries meaning in RON.

Project settings live in `.ronfmt.json`:

```json
{
  "indentWidth": 2,
  "printWidth": 120
}
```
