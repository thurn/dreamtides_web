import { QA_SCENES } from "../src/runtime/qa-scenes.ts";

process.stdout.write(
  `${JSON.stringify(
    QA_SCENES.map(({ id, label }) => ({ id, label })),
  )}\n`,
);
