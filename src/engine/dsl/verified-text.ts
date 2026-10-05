import { hashString } from "../state/hash";

/**
 * The value an entity's `verifiedText` must hold: a hash of its printed text
 * and amplified text. Editing either text fails the content gate until the
 * abilities are re-verified against it and the hash is updated.
 */
export function expectedVerifiedText(text: string, amplifiedText?: string): string {
  return hashString(JSON.stringify([text, amplifiedText ?? null])).toString(36);
}
