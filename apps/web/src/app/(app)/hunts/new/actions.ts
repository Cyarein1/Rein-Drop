"use server";

import { ApiError, type CreateHuntRequest } from "@rein-drop/api-client";
import { mapHuntErrors, type HuntFormErrors } from "@rein-drop/client-core";
import { getServerApiClient } from "@/auth";

export type SaveHuntDraftResult =
  | { ok: true; huntId: string }
  | { ok: false; message: string; errors: HuntFormErrors };

/**
 * Saves the reviewed hunt as a DRAFT. Monitoring is NOT started here - activation comes
 * with plan selection (App Flow Blueprint section 6). Runs on the server, so API
 * credentials never reach the browser; the API re-validates everything.
 */
export async function saveHuntDraft(request: CreateHuntRequest): Promise<SaveHuntDraftResult> {
  const api = await getServerApiClient();
  try {
    const hunt = await api.createHunt(request);
    return { ok: true, huntId: hunt.id };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, message: err.message, errors: mapHuntErrors(err.details ?? []) };
    }
    return { ok: false, message: "We couldn't save your hunt. Please try again.", errors: {} };
  }
}
