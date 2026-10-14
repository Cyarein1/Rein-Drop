import { Redirect } from 'expo-router';

/**
 * `/` - the companion app opens on Deals (decision 0018: the Home dashboard is web-only). Kept as a
 * redirect so existing links to `/` (onboarding "done", older builds' notifications) still land.
 */
export default function StartRedirect() {
  return <Redirect href="/deals" />;
}
