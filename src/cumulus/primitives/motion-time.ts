import { TOKENS, type TokenName } from "./tokens";

type MotionTimeToken = Extract<
  TokenName,
  `--dur-${string}` | `--delay-${string}` | `--stagger-${string}`
>;

/** Resolve a raw Cumulus time token to the seconds Framer Motion expects. */
export function motionTimeSeconds(name: MotionTimeToken): number {
  const value = TOKENS[name].value;
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(value);
  if (match === null) {
    throw new Error(`Cumulus motion token ${name} must be a raw ms or s value.`);
  }

  const amount = Number(match[1]);
  return match[2] === "ms" ? amount / 1000 : amount;
}
