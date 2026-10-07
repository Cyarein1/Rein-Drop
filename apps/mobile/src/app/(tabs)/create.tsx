import { Redirect } from 'expo-router';

/**
 * Placeholder route behind the central Create tab button. The button itself opens the
 * Create Hunt modal; this only runs if someone deep-links to /create.
 */
export default function CreateRedirect() {
  return <Redirect href="/hunts/new" />;
}
