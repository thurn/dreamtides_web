import { parseTutorialActions } from "./tutorial-actions";
import type { TutorialAction } from "../types/tutorial";
import { EditorApiRequestError } from "../editor/editor-api";
import {
  confirmSourceRevision,
  queueSourceSave,
  withExpectedSourceRevision,
} from "../editor/source-revision";

const SOURCE = "tutorial";

interface TutorialEditorResponse {
  readonly actions: readonly TutorialAction[];
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      const error = (body as Record<string, unknown>).error;
      if (error !== null && typeof error === "object" && !Array.isArray(error)) {
        const message = (error as Record<string, unknown>).message;
        const code = (error as Record<string, unknown>).code;
        if (typeof message === "string") return new EditorApiRequestError({
          code: typeof code === "string" ? code : undefined,
          details: error,
          message,
          status: response.status,
        });
      }
    }
  } catch {
    // Fall through to the status-based error.
  }
  return new Error(`Tutorial save failed (${String(response.status)}).`);
}

/** Persist the complete ordered tutorial action sequence to tutorial.ron. */
export async function saveTutorialActions(
  actions: readonly TutorialAction[],
  fetcher: typeof fetch = fetch,
): Promise<TutorialEditorResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetcher("/api/editor/tutorial", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withExpectedSourceRevision(SOURCE, { actions })),
    });
    if (!response.ok) throw await responseError(response);
    const body: unknown = await response.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Tutorial save response must be an object.");
    }
    confirmSourceRevision(SOURCE, body);
    return {
      actions: parseTutorialActions((body as Record<string, unknown>).actions),
    };
  });
}
