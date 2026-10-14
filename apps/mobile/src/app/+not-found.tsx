import { Redirect } from 'expo-router';

/**
 * Unknown or retired routes (e.g. `/analytics`, now web-only - decision 0018) land on Deals
 * instead of an error screen, so old links and notifications never dead-end.
 */
export default function NotFound() {
  return <Redirect href="/deals" />;
}
