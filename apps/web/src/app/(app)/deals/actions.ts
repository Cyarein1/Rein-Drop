"use server";

import {
  ApiError,
  type DealDetail,
  type DealSummary,
  type IgnoreDealRequest,
  type ListDealsQueryInput,
  type MarkDealBoughtRequest,
  type Page,
} from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

export type DealActionResult =
  | { ok: true; deal: DealDetail }
  | { ok: false; message: string; field?: string };

export type DealPageResult = { ok: true; page: Page<DealSummary> } | { ok: false; message: string };

function failure(err: unknown): { ok: false; message: string; field?: string } {
  if (err instanceof ApiError) {
    const detail = err.details?.[0];
    return { ok: false, message: detail?.message ?? err.message, field: detail?.path };
  }
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** Next page of the feed ("Show more"). */
export async function loadDeals(query: ListDealsQueryInput): Promise<DealPageResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, page: await api.listDeals(query) };
  } catch (err) {
    return failure(err);
  }
}

type Action = "seen" | "save" | "unsave" | "unignore";

export async function dealAction(id: string, action: Action): Promise<DealActionResult> {
  try {
    const api = await getServerApiClient();
    const run = {
      seen: () => api.markDealSeen(id),
      save: () => api.saveDeal(id),
      unsave: () => api.unsaveDeal(id),
      unignore: () => api.unignoreDeal(id),
    }[action];
    return { ok: true, deal: await run() };
  } catch (err) {
    return failure(err);
  }
}

export async function ignoreDeal(id: string, request: IgnoreDealRequest): Promise<DealActionResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, deal: await api.ignoreDeal(id, request) };
  } catch (err) {
    return failure(err);
  }
}

export async function markDealBought(id: string, request: MarkDealBoughtRequest): Promise<DealActionResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, deal: await api.markDealBought(id, request) };
  } catch (err) {
    return failure(err);
  }
}
