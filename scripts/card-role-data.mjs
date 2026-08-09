import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ROLES = new Set(["starter-deck", "nightmare"]);

function fail(message) {
  throw new Error(`cards.toml roles: ${message}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

/** Compile stable gameplay identities from the typed card catalog. */
export function compileCardRoleData(cards) {
  if (!Array.isArray(cards)) fail("expected a cards array");
  const starterDeckCardIds = [];
  const nightmares = [];
  for (const [index, card] of cards.entries()) {
    if (typeof card !== "object" || card === null || Array.isArray(card)) {
      fail(`card ${String(index + 1)} must be a table`);
    }
    const cardId = card.id;
    if (typeof cardId !== "string" || !UUID.test(cardId)) {
      fail(`card ${String(index + 1)} must have a lowercase UUID`);
    }
    const roles = card.roles ?? [];
    if (!Array.isArray(roles) || roles.some((role) => !ROLES.has(role))) {
      fail(`card ${cardId} has an unsupported role`);
    }
    if (new Set(roles).size !== roles.length) {
      fail(`card ${cardId} repeats a role`);
    }
    const isStarter = roles.includes("starter-deck");
    if (isStarter !== (card.rarity === "Starter")) {
      fail(`card ${cardId} must align starter-deck role with Starter rarity`);
    }
    if (isStarter) starterDeckCardIds.push(cardId);
    if (roles.includes("nightmare")) {
      if (card.rarity !== "Special") {
        fail(`nightmare role card ${cardId} must have Special rarity`);
      }
      if (
        typeof card.name !== "string" ||
        card.name.trim() === "" ||
        typeof card["card-number"] !== "number" ||
        !Number.isInteger(card["card-number"])
      ) {
        fail(`nightmare role card ${cardId} has invalid derived identity data`);
      }
      nightmares.push({
        cardId,
        historicalCardNumber: card["card-number"],
        displayName: card.name,
      });
    }
  }
  if (starterDeckCardIds.length === 0)
    fail("starter-deck role must not be empty");
  if (nightmares.length !== 1)
    fail("exactly one card must have the nightmare role");
  const payload = {
    schemaVersion: 1,
    starterDeckCardIds,
    nightmare: nightmares[0],
  };
  const contentHash = hash(payload);
  return { ...payload, contentHash, foldHash: contentHash };
}
