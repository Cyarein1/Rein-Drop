import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { getApiClient } from '@/config/api';

/**
 * Unfinished onboarding opens by itself once per app launch (Blueprint section 2: new users set up
 * first). Moved here from the old Home tab (decision 0018) so it runs whichever tab opens first.
 */
let promptedThisLaunch = false;

export function useOnboardingPrompt(): void {
  const router = useRouter();
  useEffect(() => {
    if (promptedThisLaunch) return;
    let cancelled = false;
    getApiClient()
      .getSellerSnapshot()
      .then(
        (s) => {
          if (cancelled || promptedThisLaunch) return;
          promptedThisLaunch = true;
          if (s.status === 'not_started' || s.status === 'in_progress') router.push('/onboarding');
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [router]);
}
