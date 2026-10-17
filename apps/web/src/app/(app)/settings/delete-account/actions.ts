"use server";

import { ApiError } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

export type DeleteAccountResult = { ok: true } | { ok: false; message: string };

/** POST /me/delete (confirmation "DELETE"): cancels any subscription immediately, then erases the account. */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  try {
    await (await getServerApiClient()).deleteAccount();
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "ACCOUNT_SUSPENDED") return { ok: false, message: "This account can't be deleted here. Please contact support and we'll help." };
      if (err.status === 503) return { ok: false, message: "Billing couldn't be reached, so nothing was deleted. Please try again in a few minutes." };
      return { ok: false, message: err.message };
    }
    return { ok: false, message: "Something went wrong and nothing was deleted. Please try again." };
  }
}
