import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError, type InventoryItem } from '@rein-drop/api-client';
import { getApiClient } from '@/config/api';

export type ItemLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; item: InventoryItem };

/** The API's error in words (first field error when there is one). */
export const apiMessage = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/** One inventory item for a form sheet (Return, Write off), loaded when the sheet opens. */
export function useInventoryItem(id: string): ItemLoad {
  const [load, setLoad] = useState<ItemLoad>({ status: 'loading' });
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.resolve()
        .then(() => getApiClient().getInventoryItem(id))
        .then(
          (item) => !cancelled && setLoad({ status: 'ready', item }),
          (err: unknown) => !cancelled && setLoad({ status: 'error', message: apiMessage(err) }),
        );
      return () => {
        cancelled = true;
      };
    }, [id]),
  );
  return load;
}
