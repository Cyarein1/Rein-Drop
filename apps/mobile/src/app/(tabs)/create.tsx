import { Redirect } from 'expo-router';

/**
 * `/create` - kept only so existing links still work. Creating a Hunt lives in the Hunts tab
 * (header "+" button, decision 0018); this opens the same Create Hunt modal.
 */
export default function CreateRedirect() {
  return <Redirect href="/hunts/new" />;
}
